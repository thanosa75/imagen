# Build Instructions (Run on Docker Host)

The Hermes agent container cannot access the Docker daemon directly (GID mismatch: socket is 989, agent user is in 999). Run these commands on the Docker host.

```bash
cd /workspace/projects/imagen

# 1. Ensure .env exists at repo root (copied from backend example)
cp backend/.env.example .env

# 2. EDIT .env — minimum required:
#    GEMINI_API_KEY=<your Google Gemini API key>
#    API_KEY=<strong random secret for x-api-key auth>
#    (Other defaults are fine for local/Docker use)

# 3. Build and start all services
docker compose up --build -d

# 4. Check status
./manage.sh status
```

## What gets built

| Service  | Build Context | Image |
|----------|--------------|-------|
| api      | ./backend    | imagen-api |
| worker   | ./backend    | imagen-worker |
| frontend | ./frontend   | imagen-frontend |
| redis    | redis:7-alpine (pull) | redis:7-alpine |

## Verify

```bash
./manage.sh status    # shows container health + API/frontend checks
./manage.sh logs      # tail all logs
./manage.sh health    # quick health check
```

## Stop

```bash
./manage.sh stop       # preserve volumes
docker compose down -v  # destroy everything incl. data
```
