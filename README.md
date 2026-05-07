# Imagen

AI image generation pipeline with a React PWA frontend and a Node.js/Redis backend.

## Repository Structure

```
imagen/
├── backend/          Node.js REST API + background job worker
│   ├── src/          Application source (routes, controllers, services, workers)
│   ├── tests/        Integration & unit tests
│   ├── data/         Prompt library (prompts.json, etc.)
│   ├── uploads/      Incoming image uploads (runtime, gitignored)
│   ├── results/      Generated image output (runtime, gitignored)
│   ├── Dockerfile    Multi-stage Node image for api & worker
│   └── package.json
├── frontend/         React + Vite PWA (TypeScript)
│   ├── src/          App source (components, features, stores, hooks)
│   ├── public/       Static assets, PWA manifest, icons
│   ├── nginx.conf    nginx config for the production container
│   ├── Dockerfile    Multi-stage Vite build → nginx image
│   └── package.json
└── docker-compose.yml  Full stack: redis + api + worker + frontend
```

## Architecture

```
Browser
  │
  └─► External nginx (SSL :443)
          │
          └─► frontend container (:8090)
                  ├── /*          → React SPA (served by nginx)
                  └── /health     ┐
                      /jobs/*     ├─► api container (:3000, internal only)
                      /prompts/*  ┘
```

- **redis** — job queue and ephemeral state store (internal network only)
- **api** — Express REST API, enqueues generation jobs to Redis
- **worker** — BullMQ worker, pulls jobs from Redis, calls the AI image API, saves results
- **frontend** — React PWA built with Vite, served by nginx which also reverse-proxies `/jobs/*` and `/prompts/*` to the api, keeping everything same-origin (no CORS needed)

The backend is never exposed directly to the outside; all external traffic enters through the frontend nginx container.

## Quick Start

```bash
# 1. Copy and configure environment
cp backend/.env.example .env
# Fill in at minimum:
#   GEMINI_API_KEY=<your key>
#   API_KEY=<a random secret used to authenticate API requests>

# 2. Build and start all services
docker compose up --build -d

# 3. Access the app
open http://localhost:8090
```

## Environment Variables

Defined in `.env` at the repo root (next to `docker-compose.yml`).
See `backend/.env.example` for the full list with descriptions.

Key variables:

| Variable         | Description                                      |
|-----------------|--------------------------------------------------|
| GEMINI_API_KEY  | Google Gemini API key for image generation        |
| API_KEY         | Shared secret for API authentication             |
| REDIS_URL       | Overridden automatically in Docker (redis://redis:6379) |
| ALLOWED_ORIGINS | CORS origins; leave empty behind a reverse proxy |

## Development

### Backend (Node.js)

```bash
cd backend
npm install
cp .env.example .env   # fill in vars
npm run dev            # starts api with nodemon
node src/workers/jobWorker.js   # start worker separately
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev            # Vite dev server on :5173
```

Set `VITE_API_URL=http://localhost:3000` in `frontend/.env.local` to point at the local backend.

## Tests

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

## Ports (Docker)

| Service  | Internal | Exposed  | Notes                        |
|----------|----------|----------|------------------------------|
| redis    | 6379     | —        | Internal only                |
| api      | 3000     | —        | Proxied via frontend nginx   |
| worker   | —        | —        | No HTTP server               |
| frontend | 80       | **8090** | Entry point for all traffic  |
