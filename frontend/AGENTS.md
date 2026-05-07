# AGENTS.md

**imagen/frontend** — React PWA for the Imagen Gemini Image Processing API.

## Project Overview

- **Framework**: React 19 + TypeScript (Vite 8)
- **State**: Zustand 5 (4 stores: settings, prompt, job, camera)
- **Styling**: Tailwind CSS v4 (dark mode via `class` strategy)
- **Routing**: React Router v7 (9 routes with Layout + BottomNav)
- **PWA**: vite-plugin-pwa + Workbox (autoUpdate, offline shell)
- **Forms**: React Hook Form + Zod v4
- **Testing**: Vitest 4 + React Testing Library + jsdom (38 unit tests)
- **Package Manager**: npm

## Quick Start

```bash
cd frontend
npm run dev            # starts on :5173
```

## Architecture

```
src/
├── components/       # Shared UI (Layout, BottomNav, StatusBadge, etc.)
├── features/
│   ├── capture/      # Camera capture + job submission flow (state machine)
│   ├── prompts/      # Prompt CRUD (list, detail, form, variable management)
│   ├── jobs/         # Job list + detail (polling from API)
│   └── settings/     # API config, theme toggle
├── stores/           # Zustand stores (settings, prompt, job, camera)
├── lib/              # api.ts (ApiClient), template.ts, errors.ts
├── hooks/            # usePolling, useOnlineStatus, useInstallPrompt
└── types/            # prompt.ts, job.ts, api.ts
```

## API Client (`src/lib/api.ts`)

- Reads `apiBaseUrl` + `apiKey` from settingsStore at request time
- Must be wired at app init via `setSettingsStoreRef(useSettingsStore)` (done in main.tsx)
- All endpoints except `/health` send `x-api-key` header + `X-Request-ID`
- Automatic single retry on network errors, 503, 429
- Typed `ApiError` with `code`, `message`, `statusCode`, `requestId`

**API Audit (verified against backend code):**
- Image result: `GET /jobs/:id/result-image` (NOT `/jobs/:id/image`)
- Image ALWAYS required in job submission (multer hard-requires it)
- Allowed MIME: jpeg, png, webp (no gif at multer level)
- Prompt CRUD: `GET /prompts/show`, `GET /prompts/:id`, `POST /prompts`, `PUT /prompts/:id`, `DELETE /prompts/:id`, `GET /prompts/:id/preview`

## State Machine (Capture Flow)

```
IDLE → PROMPT_SELECTED → VARIABLES_SET → CAMERA_READY → IMAGE_CAPTURED → SUBMITTING → POLLING → COMPLETED
                                                                              ↓
                                                                            FAILED
```

Implemented in `CapturePage.tsx` with step-based rendering.

## Common Pitfalls

1. **Do NOT change the API client paths** — they were audited against actual `src/` code. See ../backend/FRONTEND_PLAN.md §1.

2. **Do NOT cache job results** — The PWA intentionally does NOT maintain an image gallery. Results are ephemeral in-memory, lost on navigation. Users must save to device.

3. **Do NOT add IndexedDB/localStorage for images** — Keeps the PWA lightweight. Job IDs only tracked in localStorage for the jobs history page.

4. **Do NOT modify the middleware order in vite.config.ts** — PWA plugin must come after React + Tailwind.

5. **Do NOT remove the `Body()` from `FormData`** — The API uses `multipart/form-data`, not base64 JSON.

6. **Do NOT assume prompt data has `template` or `defaultVariables`** — `GET /prompts/show` returns summaries. Use `GET /prompts/:id` for full data.

## Testing

```bash
npm test              # vitest run (all unit tests)
npm run test:watch    # vitest in watch mode
npm run test:coverage # vitest with coverage
```

Test files: `tests/unit/` — template, api, settingsStore, promptStore, jobStore (38 tests, all passing).

## Backend Dependencies

This frontend requires the **imagen/backend** to have prompt CRUD endpoints. See `../backend/FRONTEND_PLAN.md` §2 for the required backend changes. The prompt CRUD routes have been added to `../backend/src/routes/promptRoutes.js` and the service methods to `../backend/src/services/promptService.js`.
