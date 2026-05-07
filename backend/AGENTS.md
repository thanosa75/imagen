# AGENTS.md

**imagen** — Production-ready REST API for async image processing and generation via Google Gemini.

## Project Overview

- **Runtime**: Node.js 24+ (CommonJS, no ESM)
- **Framework**: Express 5
- **Database**: Redis 7 (sole persistent store — hashes for jobs, lists for queues, sets for status indices)
- **AI Backend**: `@google/generative-ai` ^0.24 (Gemini for text+image generation)
- **Package Manager**: npm
- **Tests**: Jest 30.2 (169 tests, 14 suites, ~88% stmt / ~79% branch coverage)
- **Deploy**: Docker Compose (api + worker + redis containers)

## Repository Layout

```
imagen/
├── src/
│   ├── server.js              # Entry point (binds port, graceful shutdown)
│   ├── app.js                 # Express app assembly (middleware stack, routes)
│   ├── config/                # Redis client, logger init, Swagger spec
│   ├── controllers/           # Request handlers (jobController.js)
│   ├── services/              # Business logic (geminiService, promptService, queueService)
│   ├── repositories/          # Redis data access (jobRepository.js — ALL I/O goes through here)
│   ├── workers/               # Background job processor (jobWorker.js — runs in own Docker container)
│   ├── middleware/            # auth, errorHandler, rateLimiter, validator, requestLogger
│   ├── errors/                # GeminiErrors.js (RetryableGeminiError vs FatalGeminiError)
│   └── utils/                 # pino logger singleton
├── data/
│   └── prompts.json           # Prompt templates (loaded at runtime by promptService)
├── tests/
│   ├── jobFlow.test.js        # Integration/flow tests (11 tests)
│   └── unit/                  # All unit tests (13 files)
├── Dockerfile
├── docker-compose.yml         # 3 services: redis, api, worker
└── .env.example               # Template — copy to .env
```

## Setup Commands

```bash
# Install dependencies (node_modules already present)
npm install

# Set up env
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, API_KEY (for x-api-key auth)

# Dev mode (hot reload)
npm run dev                    # starts on :3000, requires Redis running

# Without nodemon
npm start
```

### Docker (full stack)

```bash
docker compose up --build      # brings up redis, api (:3000), worker
```

> The API container exposes port 3000. Swagger UI at `http://localhost:3000/doc` (non-production only).

## Architecture & Conventions

### Middleware stack (order matters)

`helmet → CORS (whitelist) → body parsing → requestLogger → rateLimiter → auth → routes → 404 → errorHandler`

Every request except `/health` goes through `authMiddleware` — validates `x-api-key` header with constant-time comparison (`crypto.timingSafeEqual`).

### Pattern: Controller → Service → Repository

- **Controller** handles HTTP I/O (parse request, send response, delegate to services).
- **Service** contains business logic; may call multiple repositories/services.
- **Repository** is the ONLY module that talks to Redis directly (`getRedisClient()`).
- `jobRepository.js` uses Redis `MULTI/EXEC` transactions for atomic status transitions.

### Job lifecycle (Redis keys)

| Redis Key | Type | Purpose |
|-----------|------|---------|
| `job:{uuid}` | Hash | Full job record (status, results, metadata, TTL) |
| `queue:jobs` | List | FIFO job queue (LPUSH enqueue, BRPOP dequeue) |
| `queue:processing` | List | Jobs currently being processed (reliable queue pattern) |
| `jobs:status:{status}` | Set | Job IDs grouped by status |
| `jobs:index` | ZSET | TTL-aware index for ghost cleanup |
| `jobs:active` | Set | Currently processing jobs |

### Running the worker (REQUIRED for job processing)

The API **only** accepts job submissions and reports status. The **worker** (`src/workers/jobWorker.js`) is a separate long-running process that dequeues and processes jobs via Gemini. Both must run:

```bash
# Terminal 1
npm start

# Terminal 2
node src/workers/jobWorker.js
# or docker compose up  (runs both + redis)
```

### Gemini error classification

Errors from Gemini are typed: `RetryableGeminiError` (429/502/503/network errors → requeue, up to `MAX_JOB_RETRIES`) vs `FatalGeminiError` (401/403/bad MIME → fail permanently). Default unknown errors are treated as fatal to avoid infinite retry loops.

### Prompt system

Templates live in `data/prompts.json`. `promptService.js` resolves `{{variable}}` placeholders with `replaceAll`. Prompts declare `requiredVariables`, `defaultVariables`, and `supportedOutcomes` (`text` or `image`).

### Image generation flow

When `expectedOutcome=image`, the worker writes the generated image to `results/` directory (shared volume in Docker), then the controller streams it via `GET /jobs/:id/result-image` using `fs.createReadStream().pipe(res)` with proper stream error handling.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/health` | No | Health check (200 if Redis ok, 503 if degraded) |
| GET | `/prompts/show` | Yes | List available prompt templates |
| POST | `/jobs` | Yes | Submit job (multipart: image, promptId, expectedOutcome, variables) |
| GET | `/jobs/:id` | Yes | Job status + text results |
| GET | `/jobs/:id/result-image` | Yes | Binary image result (streamed) |
| GET | `/doc` | No | Swagger UI (non-production only) |

## Testing Strategy

```bash
# Run all tests
npm test                           # jest (no Redis needed — all mocking)

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage              # outputs to coverage/

# Run a single test file
npx jest tests/unit/geminiService.test.js

# Run with pattern match
npx jest -t "should retry"
```

> Tests use `redis-mock` — no real Redis required. `supertest` for HTTP layer, Jest mocks for Gemini SDK.

## Common Agent Pitfalls

1. **Do NOT change `data/prompts.json` format.** It's loaded at runtime by `promptService.js` and expected to be `{ prompts: [...] }` with `id, name, description, template, requiredVariables, supportedOutcomes`.

2. **Do NOT add ESM imports.** The project is CommonJS throughout (`require`/`module.exports`). Mixing `import` syntax will break.

3. **Do NOT modify the middleware order in `app.js`.** Auth must come before routes, error handler must be last.

4. **Do NOT assume a SQL database exists.** Redis IS the database. All data access goes through `jobRepository.js`.

5. **Do NOT start the API and expect jobs to process.** The worker is a separate process. Jobs stay `pending` forever without it.

6. **Do NOT remove `timingSafeEqual` from `auth.js`.** It prevents timing side-channel attacks on API key comparison.

7. **Do NOT throw generic Errors from Gemini calls.** Use `RetryableGeminiError` or `FatalGeminiError` so the worker's retry/DLQ logic works correctly.

8. **Do NOT hardcode file paths.** The worker writes images to `results/`, the API serves from the path stored in `job.resultImagePath`.

9. **Do NOT add new routes without API key auth** — the auth middleware applies globally except `/health`. New routes inherit it automatically via `app.use(authMiddleware)`.

10. **Install deps with `npm`, not `yarn` or `pnpm`.** The lockfile is `package-lock.json`.

## Environment & Secrets

- Copy `.env.example` → `.env` (gitignored, never committed).
- `GEMINI_API_KEY` is mandatory — GeminiService throws on construction if unset.
- `API_KEY` is mandatory for production — middleware rejects all requests with 500 if empty.
- In Docker, `REDIS_URL=redis://redis:6379` (the container name, not localhost).
- `ALLOWED_ORIGINS` is comma-separated; CORS rejects non-matching origins.

## Docs & References

- `README.md` — Human-facing docs, API examples, troubleshooting
- `FINDINGS.md` — Full 52-finding audit (all CRITICAL/HIGH resolved in develop)
- `CRIT-HIGH-IMPL-PLAN.md` — Detailed implementation plan for fixes applied
- `TEST_EXECUTION_REPORT.md` — Coverage per module, remaining gaps
- `API_SUMMARY.md` — Quick endpoint reference
