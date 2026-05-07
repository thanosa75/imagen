#!/usr/bin/env bash
# ── Imagen Stack Management Script ─────────────────────────────
#
# Usage:
#   ./manage.sh build          Build all Docker images
#   ./manage.sh start [--build] Start the stack (--build to rebuild)
#   ./manage.sh stop           Stop the stack (preserves volumes)
#   ./manage.sh restart        Restart the stack
#   ./manage.sh down           Stop and remove containers, networks
#   ./manage.sh down-volumes   Destroy everything incl. data volumes
#   ./manage.sh status         Show container + health status
#   ./manage.sh logs [svc]     Tail logs (all, or: api worker frontend redis)
#   ./manage.sh health         Quick health check (API + Frontend)
#   ./manage.sh shell <svc>    Open shell in a container
#   ./manage.sh ps             Alias for docker compose ps
#   ./manage.sh help           Show this help
#
# Requirements: docker compose v2+

set -euo pipefail

# ── Colors (must come before any error messages) ──────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
# Detect available compose command (v2 plugin or v1 standalone)
if docker compose version &>/dev/null; then
  COMPOSE_CMD="docker compose -f ${COMPOSE_FILE}"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose -f ${COMPOSE_FILE}"
else
  echo -e "  ${RED}✗${NC} Neither 'docker compose' (v2) nor 'docker-compose' (v1) found."
  echo "    Install Docker Compose or run: apt install docker-compose-plugin"
  exit 1
fi
FRONTEND_HOST="${FRONTEND_HOST:-localhost:8080}"

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
info() { echo -e "${CYAN}→${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

# ── Help ──────────────────────────────────────────────────────
help() {
  sed -n '2,19p' "$0" | sed 's/^# //'
}

# ── Build ─────────────────────────────────────────────────────
cmd_build() {
  info "Building all images..."
  $COMPOSE_CMD build --pull
  ok "Build complete"
}

# ── Start ─────────────────────────────────────────────────────
cmd_start() {
  local build_flag=""
  if [[ "${1:-}" == "--build" ]]; then
    build_flag="--build"
    info "Rebuilding images..."
  fi
  info "Starting Imagen stack..."
  $COMPOSE_CMD up -d $build_flag

  echo ""
  info "Waiting for services to be healthy..."
  wait_healthy "api"      30
  wait_healthy "frontend" 30
  wait_healthy "redis"    10

  echo ""
  cmd_status
}

# ── Stop ──────────────────────────────────────────────────────
cmd_stop() {
  info "Stopping containers (volumes preserved)..."
  $COMPOSE_CMD stop
  ok "Stack stopped"
}

# ── Restart ───────────────────────────────────────────────────
cmd_restart() {
  cmd_stop
  sleep 2
  cmd_start "$@"
}

# ── Down ──────────────────────────────────────────────────────
cmd_down() {
  warn "Removing containers and networks..."
  $COMPOSE_CMD down
  ok "Stack removed (volumes preserved)"
}

cmd_down_volumes() {
  warn "DESTROYING everything: containers, networks, volumes!"
  read -rp "  Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    info "Aborted"
    exit 0
  fi
  $COMPOSE_CMD down -v
  ok "Everything destroyed"
}

# ── Status ────────────────────────────────────────────────────
cmd_status() {
  echo ""
  echo -e "${BOLD}═══ Imagen Stack Status ═══${NC}"
  echo ""

  # Container table
  $COMPOSE_CMD ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || {
    fail "No containers running"
    return
  }

  echo ""
  echo -e "${BOLD}─── Health Checks ───${NC}"

  # API health
  if curl -sf "http://${FRONTEND_HOST}/health" > /dev/null 2>&1; then
    local h
    h=$(curl -sf "http://${FRONTEND_HOST}/health" 2>/dev/null)
    ok "API: $(echo "$h" | grep -o '"status":"[^"]*"' | head -1) — $(echo "$h" | grep -o '"redis":"[^"]*"')"
  else
    fail "API: unreachable"
  fi

  # Frontend
  if curl -sf "http://${FRONTEND_HOST}/" > /dev/null 2>&1; then
    ok "Frontend: serving (HTTP 200)"
  else
    fail "Frontend: unreachable"
  fi
}

# ── Logs ──────────────────────────────────────────────────────
cmd_logs() {
  local svc="${1:-}"
  if [[ -n "$svc" ]]; then
    $COMPOSE_CMD logs --tail=100 -f "$svc"
  else
    $COMPOSE_CMD logs --tail=100 -f
  fi
}

# ── Health ────────────────────────────────────────────────────
cmd_health() {
  echo -e "${BOLD}═══ Health Check ───${NC}"
  echo ""

  if curl -sf "http://${FRONTEND_HOST}/health" > /dev/null 2>&1; then
    ok "API health endpoint: OK"
  else
    fail "API health endpoint: FAILED"
    exit 1
  fi

  if curl -sf "http://${FRONTEND_HOST}/" > /dev/null 2>&1; then
    ok "Frontend serving: OK"
  else
    fail "Frontend serving: FAILED"
    exit 1
  fi

  echo ""
  ok "All checks passed"
}

# ── Shell ─────────────────────────────────────────────────────
cmd_shell() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo "Usage: $0 shell <api|worker|frontend|redis>"
    exit 1
  fi
  local sh="sh"
  case "$svc" in
    redis) sh="redis-cli" ;;
  esac
  $COMPOSE_CMD exec "$svc" $sh
}

# ── PS ────────────────────────────────────────────────────────
cmd_ps() {
  docker compose -f "$COMPOSE_FILE" ps 2>/dev/null ||
  docker-compose -f "$COMPOSE_FILE" ps 2>/dev/null ||
  echo "Could not run docker compose ps"
}

# ── Helpers ───────────────────────────────────────────────────
wait_healthy() {
  local svc="$1" max="${2:-60}"
  local n=0
  while [[ $n -lt $max ]]; do
    local state
    state=$($COMPOSE_CMD ps --format json "$svc" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || true)
    if [[ "$state" == "healthy" ]]; then
      ok "$svc is healthy"
      return 0
    fi
    sleep 2
    ((n+=2))
  done
  warn "$svc did not become healthy within ${max}s"
}

# ── Dispatch ──────────────────────────────────────────────────
if [[ ! -f "$COMPOSE_FILE" ]]; then
  fail "docker-compose.yml not found at $COMPOSE_FILE"
  exit 1
fi

CMD="${1:-help}"
shift || true

case "$CMD" in
  build)         cmd_build "$@"      ;;
  start|up)      cmd_start "$@"      ;;
  stop)          cmd_stop            ;;
  restart)       cmd_restart "$@"    ;;
  down)          cmd_down            ;;
  down-volumes)  cmd_down_volumes    ;;
  status|st)     cmd_status          ;;
  logs|log)      cmd_logs "$@"       ;;
  health)        cmd_health          ;;
  shell|sh)      cmd_shell "$@"      ;;
  ps)            cmd_ps              ;;
  help|--help|-h) help               ;;
  *)
    echo -e "${RED}Unknown command: $CMD${NC}"
    echo ""
    help
    exit 1
    ;;
esac
