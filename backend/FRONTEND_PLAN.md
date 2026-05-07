# FRONTEND_PLAN.md — Imagen React PWA Frontend

> **Status:** Architectural Plan | **Date:** 2026-05-06 | **Target:** `imagen-frontend/` (sibling to `imagen/`)

---

## 1. API Audit: Truth vs Documentation

**Code is truth.** Before planning the frontend, every API surface was verified against `src/`.

| API_SUMMARY.md claim | Actual code | Verdict |
|---|---|---|
| `GET /jobs/:id/image` | `GET /jobs/:id/result-image` (`jobRoutes.js:70`) | ❌ **Wrong path** — frontend must use `/result-image` |
| Image file "optional when expectedOutcome=image" | `submitJob` L17: `if (!req.file)` → throws `MISSING_IMAGE` | ❌ **Image always required** |
| Allowed MIME "jpeg,png,webp,gif" (from `.env.example`) | Multer hardcodes `['image/jpeg', 'image/png', 'image/webp']` (L38) | ❌ **No gif at multer level** (geminiService supports it though) |
| Prompts: read-only list | Only `GET /prompts/show` exists — no create/update/delete | ⚠️ **Read-only** — Use Case 2 needs new backend routes |

### Actual API Reference (verified 2026-05-06)

#### `GET /health` (no auth)
```json
// 200: {"status":"ok","redis":"connected","timestamp":"...","app":"imagen"}
// 503: {"status":"degraded","redis":"disconnected","timestamp":"...","app":"imagen"}
```

#### `GET /prompts/show` (auth: `x-api-key`)
```json
{
  "prompts": [{
    "id": "describe_image",
    "name": "Image Description",
    "description": "Provides a detailed description of an image",
    "requiredVariables": [],
    "supportedOutcomes": ["text"]
  }, ...]
}
// NOTE: template, defaultVariables, examples are NOT exposed to the client
```

#### `POST /jobs` (auth: `x-api-key`, Content-Type: `multipart/form-data`)
| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | file | **YES** | jpeg/png/webp (multer restriction) |
| `promptId` | string | YES | Must match a prompt in `data/prompts.json` |
| `expectedOutcome` | `"text"` or `"image"` | YES | Must match prompt's `supportedOutcomes` |
| `variables` | JSON object | No | `{}` if omitted; parsed from string if needed |

**Response 201:**
```json
{"jobId": "uuid", "status": "pending", "createdAt": "ISO8601"}
```
**Error 400:** `{"error":{"code":"VALIDATION_ERROR","message":"Validation failed","details":[{"path":"...","message":"..."}]}}`

#### `GET /jobs/:id` (auth: `x-api-key`)
```json
// Pending/Processing:
{"jobId":"...","status":"pending","promptId":"...","expectedOutcome":"text",
 "createdAt":"...","updatedAt":"...","completedAt":null}

// Completed (text outcome):
{"jobId":"...","status":"completed","promptId":"...","expectedOutcome":"text",
 "createdAt":"...","updatedAt":"...","completedAt":"...",
 "result":{"text":"The analysis result..."},
 "metadata":{"processingTime":1234,"promptUsed":"...","modelVersion":"..."}}

// Failed:
{"jobId":"...","status":"failed","...",
 "error":{"message":"...","code":"GEMINI_401"}}

// Completed (image outcome) — text result omitted, image served via /result-image
```
Status values: `pending` → `processing` → `completed` | `failed`

#### `GET /jobs/:id/result-image` (auth: `x-api-key`)
Response: binary image stream (`Content-Type: image/jpeg` or `image/png`)
Error 400: wrong outcome type. 404: job not found / failed / image missing. 409: not yet completed.

#### Auth: `x-api-key` header
- Constant-time comparison via `crypto.timingSafeEqual`
- `/health` is the only exempt path
- Missing/invalid key → 401 `{"error":{"code":"UNAUTHORIZED","message":"Invalid or missing API key"}}`
- Unconfigured API_KEY → 500 `{"error":{"code":"SERVER_CONFIG_ERROR","message":"Authentication is not configured"}}`

#### Error envelope (all endpoints)
```json
{"error":{"code":"ERROR_CODE","message":"Human message","details":null|[...],"timestamp":"...","requestId":"..."}}
```
Every response includes `X-Request-ID` header.

---

## 2. Required API Changes (Backend Gaps)

Use Case 2 (prompt CRUD) cannot work with the current read-only API. The following endpoints must be added:

### New endpoints needed

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/prompts/:id` | Get full prompt (including template, variables, defaults) |
| `POST` | `/prompts` | Create a new prompt |
| `PUT` | `/prompts/:id` | Update an existing prompt |
| `DELETE` | `/prompts/:id` | Delete a prompt |
| `GET` | `/prompts/:id/preview` | Resolve prompt template with defaults, return preview text |

### Prompt object (full schema)

```json
{
  "id": "my_prompt",                    // kebab-case, unique, immutable after creation
  "name": "My Prompt",                  // display name
  "description": "What this prompt does",
  "template": "Analyze this image for {{aspect}}. Focus on {{detail}}.",
  "supportedOutcomes": ["text"],        // ["text"] or ["image"] or ["text","image"]
  "requiredVariables": ["aspect"],      // empty array = no required vars
  "defaultVariables": {                 // all variables should have defaults
    "aspect": "objects and colors",
    "detail": "the main subject"
  }
}
```

### Suggested API behavior

- `POST /prompts` → 201, returns the created prompt. Rejects if `id` already exists, or if validation fails (missing `id`/`name`/`template`, invalid `supportedOutcomes`, `requiredVariables` referencing unknown variables).
- `PUT /prompts/:id` → 200, full replacement. `id` field in body is ignored (uses URL param).
- `DELETE /prompts/:id` → 204. No-op if already deleted (idempotent).
- `GET /prompts/:id/preview` → 200, `{"resolvedTemplate": "Analyze this image for objects and colors. Focus on the main subject."}` — resolves `{{vars}}` with `defaultVariables`. Optionally accepts `?variables={"aspect":"custom"}` query param to override defaults.

### File persistence
Prompts live in `data/prompts.json` on disk. All CRUD operations must:
1. Read current file
2. Apply mutation in memory
3. Write back atomically (write to temp file, then `fs.rename` to avoid corruption)

### Optional: Alternative approach (no backend changes)
If backend changes are deferred, the frontend can manage prompts entirely in `localStorage`. This is viable for an MVP but means:
- Prompts don't sync across devices
- Custom prompts are lost on cache clear
- The built-in prompts from `prompts.json` are read-only reference

**Recommendation:** Implement backend CRUD first (6-8 endpoints), then build the frontend against the full API.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  React PWA (Vite)                     │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Camera   │  │ Prompt    │  │ Job Tracker        │  │
│  │ Capture  │  │ Manager   │  │ (polling + status) │  │
│  └────┬────┘  └────┬─────┘  └────────┬───────────┘  │
│       │            │                 │               │
│  ┌────┴────────────┴─────────────────┴───────────┐  │
│  │              API Client Layer                  │  │
│  │  (fetch wrapper: auth header, error handling,  │  │
│  │   request ID tracking, retry logic)            │  │
│  └──────────────────────┬────────────────────────┘  │
│                         │                             │
│  ┌──────────────────────┴────────────────────────┐  │
│  │           State Management (Zustand)            │  │
│  │  stores: promptStore, jobStore, cameraStore     │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │          Service Worker (Workbox)                │  │
│  │  - Offline shell caching                        │  │
│  │  - Background sync for job polling?             │  │
│  │  - Install prompt / push notifications          │  │
│  └────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────┐
│                Imagen API (:3000)                     │
│  /health  /prompts/*  /jobs/*  /jobs/:id/result-image│
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | React 19 + TypeScript | PWA ecosystem, typed API contracts |
| **Build** | Vite 6 | Fast HMR, PWA plugin, env var handling |
| **Routing** | React Router v7 | Declarative routes, nested layouts |
| **State** | Zustand | Lightweight, no boilerplate, TypeScript-native |
| **Styling** | Tailwind CSS v4 | Rapid UI, responsive-first, dark mode |
| **Camera** | `react-webcam` or raw `navigator.mediaDevices.getUserMedia` | PWA camera access, rear/front toggle, capture to blob |
| **PWA** | `vite-plugin-pwa` (Workbox) | Service worker, manifest, install prompt |
| **HTTP** | Native `fetch` + thin wrapper | No extra deps; wrap auth, errors, retry |
| **Forms** | React Hook Form + Zod | Validation, typed schemas |
| **Notifications** | Web Notifications API | Job completion alerts |
| **Testing** | Vitest + React Testing Library | Vite-native, fast |

---

## 4. Route Design

```
/                          → Redirect to /capture
/capture                   → Use Case 1: Camera + Prompt Select + Job Flow
/prompts                   → List all prompts
/prompts/new               → Create new prompt
/prompts/:id               → View prompt detail (read-only preview)
/prompts/:id/edit           → Edit prompt (form)
/jobs                      → Active & recent jobs list
/jobs/:id                  → Job detail (status, result, download)
/settings                  → API URL, API key config, camera prefs
```

---

## 5. Component Tree

```
App
├── Layout (shell: nav bar, status bar, offline indicator)
│   ├── BottomNav (mobile: Capture | Prompts | Jobs | Settings)
│   └── OfflineBanner (when navigator.onLine === false)
│
├── CapturePage
│   ├── CameraView
│   │   ├── CameraStream (video element, getUserMedia)
│   │   ├── CameraControls (capture btn, flip camera, flash toggle)
│   │   └── CapturedPreview (canvas snapshot, retake/confirm)
│   ├── PromptSelector
│   │   ├── PromptList (scrollable cards, search/filter)
│   │   └── PromptCard (name, description, outcome badge)
│   ├── VariableEditor
│   │   └── VariableField[] (dynamic fields based on selected prompt)
│   ├── JobProgress
│   │   ├── ProgressBar (pulsing for pending, animated for processing)
│   │   ├── StatusMessage ("Queueing...", "Processing with Gemini...", "Done!")
│   │   └── ElapsedTimer
│   └── ResultView
│       ├── TextResult (markdown render)
│       ├── ImageResult (download button, share)
│       └── Metadata (prompt used, model, processing time)
│
├── PromptsPage
│   ├── PromptList (all prompts, search, sort, delete)
│   └── PromptForm (create/edit)
│       ├── BasicFields (id, name, description)
│       ├── TemplateEditor (textarea with {{variable}} highlighting)
│       ├── VariableManager
│       │   ├── VariableList (detected vars from template)
│       │   ├── AddVariableButton
│       │   ├── RequiredToggle per variable
│       │   ├── DefaultValueInput per variable
│       │   └── RemoveVariableButton
│       ├── OutcomeSelector (text/image/both checkboxes)
│       └── TemplatePreview (live preview with defaults substituted)
│
├── JobsPage
│   ├── JobList (filterable: all/pending/processing/completed/failed)
│   └── JobCard (status badge, prompt name, thumbnail, age)
│
├── JobDetailPage
│   ├── JobStatusTimeline (pending → processing → completed/failed)
│   ├── ResultDisplay (text or image)
│   ├── MetadataPanel
│   └── ActionButtons (download, retry, delete)
│
└── SettingsPage
    ├── ApiUrlInput
    ├── ApiKeyInput (masked, test connection button)
    ├── CameraPreferences (resolution, rear/front default)
    └── ThemeToggle (light/dark/system)
```

---

## 6. Use Case 1: Capture → Process → Download (Detailed Flow)

### State Machine

```
IDLE → PROMPT_SELECTED → CAMERA_READY → IMAGE_CAPTURED → SUBMITTING → POLLING → COMPLETED
                                    ↑                     ↓           ↓          ↓
                                    └────── RETAKE ──────┘      FAILED    CANCELLED
```

### Step-by-step UX flow

**Step 1: Select a prompt**
- Fetch `GET /prompts/show` on mount, populate `PromptsStore`
- Display as horizontally scrollable cards with name, description, outcome badge
- Search/filter by name or outcome type
- On tap: expand card to show available variables → transition to `PROMPT_SELECTED`

**Step 2: Customize variables**
- Parse template for `{{variable}}` placeholders
- Display one input per variable, pre-filled with defaults (if provided) or empty
- Variables marked `requiredVariables` show validation error if empty
- Live counter: "2 of 3 variables set"
- "Ready" button enables when all required variables are filled

**Step 3: Camera capture**
- Request `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })`
- Show live `<video>` feed with overlay guides
- Capture button → draw frame to `<canvas>` → `canvas.toBlob()` → show preview
- Retake / Confirm buttons
- Handle permissions denial gracefully (fallback: file upload from gallery)

**Step 4: Submit job**
- Build `FormData`: `image` (blob), `promptId`, `expectedOutcome`, `variables` (JSON.stringify)
- `POST /jobs` with `x-api-key` header
- On 201: extract `jobId`, transition to `POLLING`
- On 400/401/500: show error message inline, allow retry

**Step 5: Poll with meaningful progress**
```
Polling strategy:
- T=0s:     "Uploading image..."
- T=0-1s:   "Job queued ✓ — waiting for a worker..."
- T=1+:     Poll GET /jobs/:id every 2s (exponential backoff: 2s, 3s, 5s, 8s, 10s max)
- status=pending:    "Position in queue: estimating..."  (pulsing bar)
- status=processing: "Gemini is analyzing your image..." (animated bar, elapsed timer)
- status=completed:  "Done!" → show result
- status=failed:     Show error message, offer retry
```
Progress UI: animated gradient bar + friendly status messages + elapsed timer. Never show "Loading..." — always contextual.

**Step 6: Display result**
- **Text outcome:** Render `result.text` in a scrollable card. Support Markdown (basic: bold, code, lists). "Copy" button.
- **Image outcome:** Load via fetch+blob URL pattern (fetch with `x-api-key` header → `URL.createObjectURL(blob)` → `<img>`). This ensures auth headers are sent with every image load, avoiding stale cached images.
- Show metadata panel (model, prompt, processing time).

**Step 7: Save result**
- **Text outcome:** "Copy to clipboard" button (primary). "Download as .txt" via `<a download>` fallback for desktop.
- **Image outcome:** Use Web Share API (`navigator.share({ files: [blob] })`) to send to the Photos app / camera roll on mobile. On desktop, fall back to `<a download>`.
- **Principle:** The PWA does NOT maintain an image gallery. Users save results to their device's Photos app. The app itself never caches job results in IndexedDB or localStorage — results are ephemeral in-memory and lost on page navigation/refresh.

### Camera PWA edge cases

- **Permission denied:** Show "Camera access required" with button to open system settings. Offer file picker fallback (`<input type="file" accept="image/*" capture="environment">` — the HTML capture attribute works on mobile).
- **No camera (desktop):** Auto-fallback to file picker.
- **Torch/flash:** Use `track.applyConstraints({ advanced: [{ torch: true }] })` (Chrome Android).
- **Orientation:** Lock to portrait? Or handle both. The Gemini prompts are 9:16-aware.

---

## 7. Use Case 2: Prompt Management (Detailed Flow)

### Prompt CRUD lifecycle

```
List Prompts → [New] → PromptForm (Create) → Save → Back to List
              → [Tap card] → PromptDetail (preview with defaults)
                           → [Edit] → PromptForm (Edit) → Save → Back to Detail
                           → [Delete] → Confirm dialog → Delete → Back to List
```

### Prompt Form Design

The form is the core complexity of this use case. It must handle:

**A. Variable extraction from template**
- Parse `{{variableName}}` from template text in real-time (on every keystroke)
- Display detected variables in a side panel
- Variables in `requiredVariables` but NOT in template → warning (stale required var)
- Variables in template but NOT in `defaultVariables` → prompt to add default

**B. Variable management UI**
```
┌─────────────────────────────────────────────────┐
│ Variables                                [+ Add] │
│                                                   │
│ ┌─ aspect ──────────────────────────────────┐   │
│ │ Required: [✓]  Default: "objects & colors" │   │
│ │                                     [✕ del] │   │
│ └────────────────────────────────────────────┘   │
│ ┌─ detail ──────────────────────────────────┐   │
│ │ Required: [ ]  Default: "main subject"     │   │
│ │                                     [✕ del] │   │
│ └────────────────────────────────────────────┘   │
│                                                   │
│ [+ Add Variable]  [Auto-detect from template]     │
└─────────────────────────────────────────────────┘
```

**C. Live template preview**
```json
// GET /prompts/:id/preview (or frontend-side resolution)
// Shows the template with {{vars}} replaced by defaults
// Updates in real-time as defaults change
```
Preview panel below the template editor:
```
┌─ Preview ──────────────────────────────────────┐
│ Analyze this image for objects and colors.     │
│ Focus on the main subject.                      │
│                                                  │
│ [Copy] [Test with API (consumes quota)]         │
└─────────────────────────────────────────────────┘
```

**D. Validation rules**
| Rule | Error message |
|---|---|
| `id` must be kebab-case, unique | "ID must use lowercase letters, numbers, and hyphens" |
| `name` required, 3-100 chars | "Name is required (3-100 characters)" |
| `template` required, must contain at least 1 non-whitespace char | "Template cannot be empty" |
| `supportedOutcomes` must have at least 1 item | "Select at least one outcome type" |
| `requiredVariables` must reference vars that exist in template | "'aspect' is marked required but doesn't appear in the template" |
| All `{{vars}}` must have a `defaultVariable` entry | "'detail' has no default value — add one or remove from template" |

### CRUD API interactions

```
Create:  POST   /prompts          body: full Prompt object          → 201 + prompt
Read:    GET    /prompts/:id                                          → 200 + prompt
Update:  PUT    /prompts/:id      body: full Prompt object (id ignored) → 200 + prompt
Delete:  DELETE /prompts/:id                                          → 204
Preview: GET    /prompts/:id/preview?variables={}                     → 200 + {resolvedTemplate}
List:    GET    /prompts/show                                         → 200 + {prompts: [...]}
```

### Offline / local-first fallback

If backend is unreachable, fall back to `localStorage` for prompt editing:
- Save draft locally
- Show sync status indicator (⚡ saved locally / ☁️ synced to server)
- On reconnect, push local changes to server
- Conflict resolution: server wins for `updatedAt` conflicts (or "last write wins" with warning)

---

## 8. State Management (Zustand Stores)

### `promptStore`
```typescript
interface PromptStore {
  prompts: Prompt[];
  selectedPromptId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchPrompts: () => Promise<void>;
  selectPrompt: (id: string) => void;
  createPrompt: (data: PromptCreateDTO) => Promise<Prompt>;
  updatePrompt: (id: string, data: PromptUpdateDTO) => Promise<Prompt>;
  deletePrompt: (id: string) => Promise<void>;
}
```

### `jobStore`
```typescript
interface JobStore {
  activeJob: Job | null;       // ephemeral — cleared on navigation away from capture page
  pollingIntervalId: number | null;

  submitJob: (formData: FormData) => Promise<string>;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
  fetchJobStatus: (jobId: string) => Promise<Job>;
  clearActiveJob: () => void;  // also revokes any blob URLs
}
```

> **No job history in state.** Jobs pages query the API directly (`GET /jobs/:id`). Results are NOT cached in IndexedDB, localStorage, or Zustand. Once the user leaves the capture/result page, the result is gone — they must have saved it to Photos (image) or copied it (text) first.

### `cameraStore`
```typescript
interface CameraStore {
  stream: MediaStream | null;
  isReady: boolean;
  capturedBlob: Blob | null;
  facingMode: 'user' | 'environment';
  error: string | null;

  startCamera: () => Promise<void>;
  stopCamera: () => void;
  capture: () => void;
  flipCamera: () => void;
  clearCapture: () => void;
}
```

### `settingsStore`
```typescript
interface SettingsStore {
  apiBaseUrl: string;       // default: from VITE_API_URL env or window.location.origin:3000
  apiKey: string;           // persisted to localStorage
  theme: 'light' | 'dark' | 'system';

  setApiBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  testConnection: () => Promise<boolean>;  // GET /health
}
```

---

## 9. API Client Layer

```typescript
// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private getHeaders(): HeadersInit {
    const apiKey = useSettingsStore.getState().apiKey;
    return {
      'x-api-key': apiKey,
      'x-request-id': crypto.randomUUID(),
    };
  }

  async health(): Promise<HealthResponse> { ... }
  async listPrompts(): Promise<PromptListItem[]> { ... }
  async getPrompt(id: string): Promise<Prompt> { ... }
  async createPrompt(data: PromptCreateDTO): Promise<Prompt> { ... }
  async updatePrompt(id: string, data: PromptUpdateDTO): Promise<Prompt> { ... }
  async deletePrompt(id: string): Promise<void> { ... }
  async previewPrompt(id: string, variables?: Record<string,string>): Promise<string> { ... }
  async submitJob(formData: FormData): Promise<JobCreated> { ... }
  async getJobStatus(id: string): Promise<Job> { ... }
  async getJobImage(id: string): Promise<Blob> { ... }
}

export const api = new ApiClient();
```

**Error handling:** All methods throw typed `ApiError` with `{ code, message, statusCode, requestId }`. Components catch and display accordingly.

**Retry:** Automatic retry (1 attempt) on network errors, 503, 429. Respect `Retry-After` header if present.

---

## 10. PWA Features

| Feature | Implementation |
|---|---|
| **Install prompt** | `beforeinstallprompt` event → custom "Add to Home Screen" button |
| **Offline shell** | Workbox precaches App shell + static assets (not API data) |
| **Offline indicator** | `navigator.onLine` + `online`/`offline` events → banner |
| **Background sync** | Workbox `BackgroundSyncPlugin` for job submissions made while offline |
| **Push notifications** | Optional: subscribe and notify on job completion (requires backend webhook/push infra) |
| **Manifest** | `manifest.json`: name="Imagen", short_name="Imagen", icons (192, 512), theme_color, display=standalone |
| **Camera** | Service worker scope must match the page serving the camera (no SW restriction on getUserMedia) |

---

## 11. File Structure

```
imagen-frontend/
├── public/
│   ├── manifest.json
│   ├── icons/ (192x192, 512x512)
│   └── screenshots/ (PWA store listing)
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Router + Layout
│   ├── index.css                   # Tailwind imports
│   │
│   ├── components/                 # Shared UI
│   │   ├── Layout.tsx
│   │   ├── BottomNav.tsx
│   │   ├── OfflineBanner.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── StatusBadge.tsx
│   │   └── ProgressBar.tsx
│   │
│   ├── features/
│   │   ├── capture/
│   │   │   ├── CapturePage.tsx
│   │   │   ├── CameraView.tsx
│   │   │   ├── CameraControls.tsx
│   │   │   ├── CapturedPreview.tsx
│   │   │   ├── PromptSelector.tsx
│   │   │   ├── VariableEditor.tsx
│   │   │   ├── JobProgress.tsx
│   │   │   ├── ResultView.tsx
│   │   │   └── useCamera.ts        # Camera hook
│   │   │
│   │   ├── prompts/
│   │   │   ├── PromptsPage.tsx
│   │   │   ├── PromptDetailPage.tsx
│   │   │   ├── PromptFormPage.tsx
│   │   │   ├── PromptCard.tsx
│   │   │   ├── TemplateEditor.tsx
│   │   │   ├── VariableManager.tsx
│   │   │   ├── TemplatePreview.tsx
│   │   │   └── promptValidation.ts  # Zod schemas
│   │   │
│   │   ├── jobs/
│   │   │   ├── JobsPage.tsx
│   │   │   ├── JobDetailPage.tsx
│   │   │   └── JobCard.tsx
│   │   │
│   │   └── settings/
│   │       └── SettingsPage.tsx
│   │
│   ├── stores/
│   │   ├── promptStore.ts
│   │   ├── jobStore.ts
│   │   ├── cameraStore.ts
│   │   └── settingsStore.ts
│   │
│   ├── lib/
│   │   ├── api.ts                   # API client
│   │   ├── errors.ts               # ApiError class
│   │   └── template.ts             # extractVariables(), resolveTemplate()
│   │
│   ├── hooks/
│   │   ├── usePolling.ts           # Generic polling hook
│   │   ├── useOnlineStatus.ts
│   │   └── useInstallPrompt.ts
│   │
│   └── types/
│       ├── prompt.ts
│       ├── job.ts
│       └── api.ts
│
├── tests/
│   ├── unit/                        # Unit tests (stores, lib, hooks)
│   │   ├── lib/
│   │   │   ├── api.test.ts
│   │   │   └── template.test.ts
│   │   └── stores/
│   ├── integration/                 # Front↔Back integration tests (mocked Gemini)
│   │   ├── capture/
│   │   │   └── captureFlow.test.ts  # Submit job → poll → result display
│   │   ├── prompts/
│   │   │   └── promptCrud.test.ts   # CRUD lifecycle via API
│   │   └── jobs/
│   │       └── jobPolling.test.ts   # Polling + status transitions
│   ├── e2e/                         # Optional: full browser tests (Playwright)
│   └── setup.ts                     # MSW server, test fixtures
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
└── AGENTS.md                       # Agent steering doc (create after initial scaffold)
```

---

## 12. Implementation Plan (Task Sequence)

### Phase 1: Scaffold & API Client (Day 1)

| Task | Description | Verifies |
|------|-------------|----------|
| 1.1 | `npm create vite@latest imagen-frontend -- --template react-ts` + install deps (tailwind, zustand, react-router, react-hook-form, zod, vite-plugin-pwa) | `npm run dev` starts |
| 1.2 | Create `src/types/` — Prompt, Job, ApiError, DTO types | TypeScript compiles |
| 1.3 | Implement `src/lib/api.ts` — ApiClient with health, listPrompts, getJobStatus (the read-only endpoints that exist today) | Unit tests with mocked fetch |
| 1.4 | Implement `src/lib/template.ts` — `extractVariables(template: string): string[]` + `resolveTemplate(template, variables): string` | Unit tests: detects `{{foo}}`, handles edge cases |
| 1.5 | Create `settingsStore` with localStorage persistence | Test that apiKey survives refresh |
| 1.6 | Wire up `App.tsx` with Router + Layout shell + BottomNav | 5 routes render placeholder pages |

### Phase 2: Capture Flow — Happy Path (Day 2)

| Task | Description | Verifies |
|------|-------------|----------|
| 2.1 | `useCamera` hook — getUserMedia, start/stop, capture to blob, flip camera | Manually test in browser |
| 2.2 | `CameraView` + `CameraControls` components | Shows video stream, capture button works |
| 2.3 | `PromptSelector` — fetch prompts, display as cards, select one | Integration: list renders, tap selects |
| 2.4 | `VariableEditor` — dynamic fields from selected prompt's template, pre-filled defaults | Renders right number of inputs |
| 2.5 | `jobStore` — `submitJob` (FormData construction + POST), `startPolling`/`stopPolling` | Unit test: polling loop with mocked timers |
| 2.6 | `JobProgress` — status messages, progress bar, elapsed timer, error display | Shows correct state transitions |
| 2.7 | `ResultView` — text display + download for text outcome | Manual: capture, submit, see result |
| 2.8 | `ResultView` — image display via fetch+blob URL + download for image outcome | Manual: capture, submit, see image |
| 2.9 | `CapturePage` — wire all sub-components together with the state machine | Full end-to-end happy path works |

### Phase 3: Capture Flow — Edge Cases (Day 3)

| Task | Description | Verifies |
|------|-------------|----------|
| 3.1 | Camera permission denied → fallback UI with file picker | Manual: deny camera, see fallback |
| 3.2 | API errors during submit → inline error + retry button | Mock 500, verify error shown |
| 3.3 | Job failure (status=failed) → error display + retry (re-submit same image) | Mock failed job, verify flow |
| 3.4 | Timeout handling — if job stays "pending" > 60s, show "still queued..." with cancel | Advance fake timers |
| 3.5 | Offline during capture → queue locally, submit on reconnect | Toggle offline, verify queue |
| 3.6 | Cancel during polling → stop polling, mark job as "abandoned" (no server-side cancel yet) | Works |
| 3.7 | Large image handling — downscale on capture to 1920px max dimension before upload | Canvas resize, smaller blob |

### Phase 4: Prompt Management CRUD (Day 4-5)

| Task | Description | Verifies |
|------|-------------|----------|
| 4.1 | Backend: Add `GET /prompts/:id`, `POST /prompts`, `PUT /prompts/:id`, `DELETE /prompts/:id`, `GET /prompts/:id/preview` | cURL tests, unit tests in backend |
| 4.2 | Frontend: Add CRUD methods to `api.ts` | Unit tests |
| 4.3 | `PromptsPage` — list all prompts with search, sort, delete button | Manual: renders prompt cards |
| 4.4 | `PromptFormPage` — create mode with all fields | Form renders, validation fires |
| 4.5 | `TemplateEditor` — textarea with `{{variable}}` syntax highlighting | Variables highlighted in UI |
| 4.6 | `VariableManager` — add/remove/edit variables, toggle required, set defaults | Variables sync with template detection |
| 4.7 | `TemplatePreview` — live preview with defaults resolved | Updates on keystroke |
| 4.8 | `PromptDetailPage` — read-only view with preview, edit button | Shows full prompt with preview |
| 4.9 | Edit flow — load existing prompt into form, update via PUT | Manual: edit → save → verify |
| 4.10 | Delete flow — confirm dialog → DELETE → redirect to list | Manual: delete → gone from list |
| 4.11 | Offline prompt editing — localStorage draft, sync on reconnect | Toggle offline, edit, reconnect |

### Phase 5: PWA Polish (Day 6)

| Task | Description | Verifies |
|------|-------------|----------|
| 5.1 | `vite-plugin-pwa` config — manifest, Workbox precaching, icon generation | Lighthouse PWA audit |
| 5.2 | Install prompt — `beforeinstallprompt` → custom CTA in banner | Test on Android Chrome |
| 5.3 | Offline shell — App shell loads when offline, graceful degradation | Toggle offline, app loads |
| 5.4 | `SettingsPage` — API URL, API key (masked), test connection, theme toggle | Manual test |
| 5.5 | Dark mode — Tailwind `dark:` classes, system preference detection, toggle | All pages look correct in dark |
| 5.6 | Responsive — mobile-first, max-w-md on desktop, camera aspect ratio | Looks good at 375px and 1440px |

### Phase 6: Unit Tests (Day 7)

| Task | Description | Verifies |
|------|-------------|----------|
| 6.1 | Unit tests for all Zustand stores (`promptStore`, `jobStore`, `cameraStore`, `settingsStore`) | `npx vitest run` — all green, coverage > 80% |
| 6.2 | Unit tests for `api.ts` — all methods, success paths, error paths (401, 400, 500, network failure) | Coverage > 90%, all error envelopes tested |
| 6.3 | Unit tests for `template.ts` — `extractVariables()`, `resolveTemplate()`, edge cases | All appendix test cases + additional edge cases |
| 6.4 | Component tests for `PromptForm` — validation rules, variable detection, form submission | Vitest + React Testing Library |
| 6.5 | Component tests for `CapturePage` — state machine transitions, camera mock | All 8 states + transitions covered |

### Phase 7: Integration Tests (Day 8)

**Principle:** Every front↔back interaction must have an integration test that hits the real API endpoints. Gemini can be mocked (`@google/generative-ai`), but the HTTP layer, auth, polling, error handling, and data flow must be tested against a live (or in-memory) server.

| Task | Description | Verifies |
|------|-------------|----------|
| 7.1 | Integration test: capture flow happy path (text outcome) — submit job via API, poll, display result | `tests/integration/capture/captureFlow.test.ts` |
| 7.2 | Integration test: capture flow happy path (image outcome) — submit job, poll, fetch image blob, verify content-type | Same file, image variant |
| 7.3 | Integration test: job failure — submit job, poll until failed, verify error display | FatalGeminiError path |
| 7.4 | Integration test: auth errors — 401 on missing/wrong `x-api-key`, verify error propagation | Auth failure path |
| 7.5 | Integration test: validation errors — submit without image, without promptId, wrong outcome — verify 400 responses | Validator middleware |
| 7.6 | Integration test: prompt CRUD lifecycle — create → read → update → delete → verify 404 | `tests/integration/prompts/promptCrud.test.ts` |
| 7.7 | Integration test: prompt preview — create prompt with defaults, get preview, verify template resolution | Preview endpoint |
| 7.8 | Integration test: polling edge cases — rapid status changes, timeout, cancel | `tests/integration/jobs/jobPolling.test.ts` |

> **Backend test strategy for integration tests:** Spin up Express app in-memory with `supertest`. Mock `@google/generative-ai` to return controlled responses (text or image). Redis can use `redis-mock`. The goal is to test the full HTTP stack without needing a real Gemini key or Redis instance.
>
> **Frontend test strategy for integration tests:** Use MSW (Mock Service Worker) to intercept fetch to the real API running in the same process. Or use `supertest` directly from the test to call the backend. The key is: the HTTP request actually travels, auth is actually checked, status codes are real.

### Phase 8: Docs & Polish (Day 9)

| Task | Description | Verifies |
|------|-------------|----------|
| 8.1 | AGENTS.md for the frontend project — agent-focused conventions, commands, pitfalls | Documented |
| 8.2 | `docker-compose.yml` update — add frontend service (nginx serving static build) | `docker compose up` runs full stack |
| 8.3 | README.md — setup, env vars, screenshots, PWA install instructions | Clear docs |
| 8.4 | Final audit — run all unit + integration tests, verify coverage thresholds, Lighthouse PWA score > 90 | CI-ready |

---

## 13. Key Design Decisions

### Why Zustand over Redux/Context?
Zustand has minimal boilerplate, works outside React components (important for the API client and polling logic), and is TypeScript-native. The 4 stores are small enough that Redux Toolkit would be overkill.

### Why polling over WebSockets?
The backend is a simple REST API. Adding WebSocket support would require significant backend changes (ws upgrade, Redis pub/sub for cross-worker events). Polling every 2-10s is perfectly adequate for job status — typical jobs take 5-30 seconds. If this becomes a bottleneck, WebSocket can be added later as an optimization.

### Why file upload (not base64 in JSON)?
The API uses `multipart/form-data` with multer. Base64-encoding a 10MB image into JSON adds ~33% size overhead and stresses the JSON parser. Stick with the API's chosen format.

### Camera resolution
Capture at 1920px max on the longest edge. Downscale on the client before upload to reduce bandwidth and API processing time. Gemini image models don't benefit from >2MP input for most use cases.

### Prompt persistence
The plan calls for backend CRUD endpoints because:
1. Server-side validation and consistency
2. Prompts are shared across all API clients (PWA + curl + scripts)
3. No data loss on cache clear

The `localStorage` fallback for offline editing is a safety net for connectivity interruptions, not the primary path.

### No client-side image gallery
The PWA intentionally does NOT maintain an image gallery or job history cache. Rationale:
1. Users save results to their device's Photos app — the PWA is a processing tool, not a photo manager
2. Job results expire after `JOB_TTL` (default 24h) on the server
3. No IndexedDB, no localStorage for images — keeps the PWA lightweight and avoids storage quota issues
4. The Jobs page queries the API for recent jobs (live data), not a local cache

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Backend prompt CRUD not implemented | Use Case 2 blocked | Phase 4.1 is the first task; can scope down to localStorage-only MVP |
| Camera API inconsistent across browsers | Capture broken on some devices | Test on Chrome Android + Safari iOS; fallback to `<input capture>` |
| Large image uploads timeout | Jobs fail silently | Client-side resize to 1920px; show upload progress; configurable max size |
| CORS issues with API on different origin | All requests fail | Vite proxy in dev; production: same-origin via nginx reverse proxy or CORS config in API |
| Polling drains battery on mobile | Poor UX | Adaptive polling interval; stop polling when tab is backgrounded (Page Visibility API) |
| Service worker caching stale API responses | Wrong data displayed | Never cache API routes in SW; only cache static assets |

---

## 15. Resolved Design Questions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Prompt export/import? | **No.** | Out of scope for v1. Prompts managed exclusively via CRUD API. |
| 2 | Multi-image per job? | **No.** | API uses `upload.single('image')`. Stick with single-image jobs. |
| 3 | Warn before job TTL expiry? | **No.** | Jobs page shows live API data only. If a job has expired, it simply won't appear. No proactive warnings needed. |
| 4 | Multi-user auth (JWT/OAuth)? | **No.** | Keep the simple `x-api-key` header auth. Single shared key, configured in Settings. |
| 5 | Cache job results in IndexedDB? | **No.** | Users save images to their device's Photos app. The PWA does not maintain a local gallery. Job results are ephemeral and lost on page navigation. |

---

## 16. Appendix: Template Variable Detection Logic

```typescript
// src/lib/template.ts
export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  let match;
  while ((match = regex.exec(template)) !== null) {
    vars.add(match[1]);
  }
  return [...vars].sort();
}

export function resolveTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let resolved = template;
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{{${key}}}`, value);
  }
  return resolved;
}

// Validates that regex matches the backend's replaceAll behavior exactly.
// Test: '{{foo}} and {{bar}}'  → ['bar', 'foo']
// Test: 'no variables here'    → []
// Test: '{{a}} {{a}} {{b}}'    → ['a', 'b']  (deduped)
```
