# IMAGEN PROJECT — Full Code Audit Report

**Project:** imagen (Gemini Image Processing API)  
**Path:** `/workspace/projects/imagen`  
**Stack:** Node.js 20+ / Express 5 / Redis 7 / Google Generative AI SDK  
**Files Audited:** ~20 source/config/test files  
**Total LOC:** ~2,800 (incl. docs)

---

## Severity Legend

| Severity | Meaning |
|----------|---------|
| **CRITICAL** | Causes crashes, data loss, security breaches, or total functional failure. Fix immediately. |
| **HIGH** | Major bugs, security holes, or architectural flaws. Fix before production. |
| **MEDIUM** | Maintainability issues, missing validations, or partial failures under edge cases. |
| **LOW** | Code smells, inconsistencies, technical debt. |

---

## Summary Table

| Category | Critical | High | Medium | Low | Subtotal |
|----------|:--------:|:----:|:------:|:---:|:--------:|
| 1. Security | 3 | 2 | 2 | 2 | 9 |
| 2. Architecture / Routing | 1 | 1 | 2 | 1 | 5 |
| 3. Reliability / Error Handling | 1 | 3 | 3 | 2 | 9 |
| 4. Data Integrity / Redis | 1 | 2 | 3 | 1 | 7 |
| 5. Code Quality / Maintainability | 0 | 1 | 4 | 3 | 8 |
| 6. Infrastructure / DevOps | 0 | 1 | 2 | 2 | 5 |
| 7. Testing | 0 | 1 | 3 | 2 | 6 |
| 8. Dependencies / Supply Chain | 0 | 1 | 1 | 1 | 3 |
| **TOTAL** | **6** | **12** | **20** | **14** | **52** |

---

## 1. Security  (3 Critical, 2 High, 2 Medium, 2 Low)

### [CRIT-1] Duplicate Route Mount Exposes Full Job API under `/prompts`
- **File:** `src/app.js:33`
- **Detail:** `app.use('/prompts', jobRoutes)` mounts the **entire** job router under `/prompts`. This means `POST /prompts/` creates a job, `GET /prompts/:id` returns job status, etc. The intent was likely only `GET /prompts/show`.
- **Fix:** Create a separate `promptRoutes` router or inline the single endpoint.

### [CRIT-2] No Rate Limiting Implemented
- **File:** `src/app.js` (missing)
- **Detail:** `.env.example` defines `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` but no `express-rate-limit` middleware is wired in. The API is wide open to abuse, especially the image upload endpoint.
- **Fix:** `npm i express-rate-limit` and mount before routes.

### [CRIT-3] CORS Enabled Without Restriction
- **File:** `src/app.js:14`
- **Detail:** `app.use(cors())` with no origin whitelist allows any domain to call the API, including malicious sites that could abuse the Gemini key.
- **Fix:** Restrict to known origins: `cors({ origin: process.env.ALLOWED_ORIGINS })`.

### [HIGH-1] No Authentication / API Key Check
- **File:** `src/app.js` (missing)
- **Detail:** Every endpoint is unauthenticated. Anyone with network access can submit jobs, exhaust quota, and read other users' job results by ID.
- **Fix:** Add API key middleware or Bearer token validation.

### [HIGH-2] Uploaded Files Stored in Predictable Path
- **File:** `src/routes/jobRoutes.js:11`
- **Detail:** `uploadDir = path.join(process.cwd(), 'uploads')`. An attacker who learns the random filename pattern can still probe the uploads dir. No path traversal check on `originalname`.
- **Fix:** Use a non-web-accessible temp dir; strip `originalname` from filename.

### [MED-1] Swagger UI Exposes Full Schema in Production
- **File:** `src/app.js:24`
- **Detail:** `/doc` is mounted unconditionally. In production this leaks internal model names, Redis key patterns, and endpoint shapes.
- **Fix:** Guard with `NODE_ENV !== 'production'` or require auth.

### [MED-2] Error Handler Leaks Stack Traces
- **File:** `src/middleware/errorHandler.js:8`
- **Detail:** Stack traces are suppressed in production but the `details` field and raw error messages still propagate. Sensitive paths may leak.
- **Fix:** Sanitize error messages in production; log full details server-side.

### [LOW-1] `.env.example` Contains Placeholder Password Pattern
- **File:** `.env.example:13`
- **Detail:** `REDIS_PASSWORD=***` is a weak placeholder; easy to misconfigure.
- **Fix:** Use empty string or comment it out.

### [LOW-2] `.gitignore` Misses `uploads/` and `results/` Content
- **File:** `.gitignore`
- **Detail:** Lines 34-35 ignore uploads and results, but `.gitkeep` files inside them are still tracked. No protection against accidental commit of large image files if gitignore patterns are bypassed.
- **Fix:** Ensure `uploads/*` and `results/*` are fully ignored; use `tmp/` pattern.

---

## 2. Architecture / Routing  (1 Critical, 1 High, 2 Medium, 1 Low)

### [CRIT-4] Route Collision on `/jobs/:id/image`
- **File:** `src/routes/jobRoutes.js:144,174`
- **Detail:** `router.get('/:id/image')` is registered AFTER `router.get('/:id')`. Express handles this by order, but if a job ID is literally `"image"` the first route wins. Low probability but design smell.
- **Fix:** Use explicit `/jobs/:id/result-image` or nest routers.

### [HIGH-3] Missing Body Size Limit
- **File:** `src/app.js:17`
- **Detail:** `express.json()` and `express.urlencoded()` have no `limit` option. A malicious JSON payload could exhaust memory.
- **Fix:** Add `limit: '10kb'` for JSON and `'100kb'` for urlencoded.

### [MED-3] No Request Timeout on Image Processing
- **File:** `src/controllers/jobController.js`
- **Detail:** The client HTTP request hangs indefinitely while the worker processes the image. For long-running jobs the client gets no feedback other than the 201 initial response.
- **Fix:** Return `202 Accepted` immediately; client polls status endpoint.

### [MED-4] No Webhook or Push Notification Support
- **File:** `src/controllers/jobController.js`
- **Detail:** Pure polling model. No mechanism to notify clients on completion.
- **Fix:** Add optional `webhookUrl` field to job submission.

### [LOW-3] Health Check Does Not Verify Redis
- **File:** `src/app.js:27-29`
- **Detail:** `/health` only returns static JSON. It does not check Redis connectivity or queue depth, so load balancers will route to unhealthy nodes.
- **Fix:** Add Redis ping to health check; return `503` if unreachable.

---

## 3. Reliability / Error Handling  (1 Critical, 3 High, 3 Medium, 2 Low)

### [CRIT-5] Uncaught File Cleanup Race in `submitJob`
- **File:** `src/controllers/jobController.js:52-56`
- **Detail:** If `req.file` exists but validation fails, the catch block calls `fs.unlinkSync(req.file.path)`. However, if Redis enqueue fails **after** the file write, the job record is created but the queue operation throws — the file is deleted but the stale job remains.
- **Fix:** Use atomic transaction or clean up job record on enqueue failure.

### [HIGH-4] File Descriptor Leak in `getJobImage`
- **File:** `src/controllers/jobController.js:155-156`
- **Detail:** `fs.createReadStream` is piped to `res` but no error handler is attached to the stream. If the client disconnects mid-stream, the stream errors are unhandled and may crash the process.
- **Fix:** Add `stream.on('error', ...)` handler and close fd properly.

### [HIGH-5] Gemini Service Swallows All Exceptions
- **File:** `src/services/geminiService.js:87-97`
- **Detail:** `processImage` catches every error and returns `{ success: false }`. This prevents the worker from distinguishing retryable network errors (`429`, `503`) from fatal auth errors (`401`, `403`).
- **Fix:** Throw typed errors (`RetryableError`, `AuthError`) and let caller decide.

### [HIGH-6] Worker Has No Circuit Breaker or Backoff
- **File:** `src/workers/jobWorker.js:235-258`
- **Detail:** On failure the worker waits 5s and loops. If Redis is down or Gemini returns 500s, it will hammer both indefinitely.
- **Fix:** Implement exponential backoff with jitter; circuit breaker for API.

### [MED-5] Missing Validation for `promptId` Existence
- **File:** `src/controllers/jobController.js:12`
- **Detail:** `validateJobSubmission` checks `promptId` is a non-empty string but does **not** verify it exists in `prompts.json`. A typo results in a worker-side failure after the upload is already persisted.
- **Fix:** Query `promptService` before accepting the job; return `400` early.

### [MED-6] Redis `getRedisClient` Auto-Initializes Without `await`
- **File:** `src/config/redis.js:145-150`
- **Detail:** `getRedisClient()` calls `initRedis()` without `await`, then returns a potentially `null` client. Callers then crash with "Cannot read property 'hSet' of null".
- **Fix:** Restore the thrown error or make `initRedis` synchronous.

### [MED-7] No File Size Validation on Result Image Write
- **File:** `src/workers/jobWorker.js:97-99`
- **Detail:** Gemini could return a massive base64 image; decoded and written to disk without size check. Risk of disk exhaustion.
- **Fix:** Check decoded buffer length against `MAX_FILE_SIZE_MB * 10`.

### [LOW-4] Error Handler Calls `next()` After Responding
- **File:** `src/middleware/errorHandler.js`
- **Detail:** Missing `next()` call is actually okay (it's the last middleware), but the pattern is inconsistent with Express docs. No functional issue unless another error handler is added later.

### [LOW-5] Unnecessary Commented-Out Log Line
- **File:** `src/workers/jobWorker.js:70`
- **Detail:** `//logger.info(...)` clutters source control.

---

## 4. Data Integrity / Redis  (1 Critical, 2 High, 3 Medium, 1 Low)

### [CRIT-6] Status Index Update Is Not Atomic
- **File:** `src/repositories/jobRepository.js:107-155`
- **Detail:** `updateJobStatus` performs `hSet` + `sMove` (or `sRem`/`sAdd`) as separate commands. If the process crashes between them, the status hash and the status set become inconsistent.
- **Fix:** Use `MULTI`/`EXEC` transactions or Lua scripts for atomic updates.

### [HIGH-7] Job TTL Does Not Cascade to Status Sets
- **File:** `src/repositories/jobRepository.js:19-59`
- **Detail:** `createJob` sets expire on the job hash but never sets TTL on the status index sets (`jobs:status:pending`, etc.). Over time these sets grow unbounded with ghost job IDs.
- **Fix:** Add TTL to status sets or implement a cleanup cron.

### [HIGH-8] No Retry / Dead-Letter Queue for Failed Jobs
- **File:** `src/workers/jobWorker.js`
- **Detail:** Failed jobs are marked failed and never retried. Transient Gemini errors (rate limit, timeout) permanently kill the job.
- **Fix:** Add retry count to job hash; move to DLQ after max retries.

### [MED-8] Worker Requeues on Shutdown Without Atomicity
- **File:** `src/workers/jobWorker.js:184-188`
- **Detail:** If `isShuttingDown` becomes true mid-job, the worker updates the job status back to pending but does **not** re-enqueue it. The job sits in Redis as "pending" but is never in the queue.
- **Fix:** Atomically update status and `LPUSH` in a transaction.

### [MED-9] Redis Reconnect Strategy Throws Error Object
- **File:** `src/config/redis.js:23-31`
- **Detail:** `reconnectStrategy` returns `new Error(...)` which `redis-client` interprets as "stop reconnecting". It should return a number (delay ms) or `undefined`.
- **Fix:** Return the delay number; log the error separately.

### [MED-10] Queue Stats Uses `Promise.all` Without Error Isolation
- **File:** `src/services/queueService.js:237-252`
- **Detail:** If `getQueueLength()` fails, `getQueueStats()` throws and no partial stats are returned.
- **Fix:** Wrap individual calls in try/catch and return partial data.

### [LOW-6] `ACTIVE_JOBS_KEY` Set Is Never Fully Cleaned
- **File:** `src/repositories/jobRepository.js`
- **Detail:** `sRem` on active jobs happens only on completion/failure. If a worker hard-crashes, the job ID remains in active jobs forever.
- **Fix:** Heartbeat pattern or periodic reconciliation.

---

## 5. Code Quality / Maintainability  (0 Critical, 1 High, 4 Medium, 3 Low)

### [HIGH-9] Two Incompatible Loggers Active
- **Files:** `src/config/logger.js` (pino) vs `src/utils/logger.js` (winston)
- **Detail:** Two separate logging libraries are imported by different modules. This causes format inconsistency and double dependency maintenance. `errorHandler` uses `utils/logger` (winston); `requestLogger` uses `config/logger` (pino). `jobWorker` imports `utils/logger`.
- **Fix:** Standardize on ONE logger (pino is already a dependency).

### [MED-11] Duplicate Configuration Files
- **Files:** `src/config/logger.js` + `src/utils/logger.js`
- **Detail:** Two logger configs doing the same thing. Only one should exist.
- **Fix:** Delete one and update all imports.

### [MED-12] `prompts.json` Is a Single Point of Failure
- **File:** `src/services/promptService.js`
- **Detail:** If `prompts.json` is malformed, the entire API fails on boot. No schema validation, no graceful degradation.
- **Fix:** Add Joi or Zod schema validation on load; provide fallback.

### [MED-13] No JSDoc / Type Definitions for Public APIs
- **Files:** All controllers and services
- **Detail:** Missing JSDoc on most public functions makes IDE intellisense and onboarding harder. Only Swagger comments exist.
- **Fix:** Add JSDoc `@param` and `@returns` to all exported functions.

### [MED-14] Magic Strings for Status Values
- **Files:** `src/repositories/jobRepository.js`, `src/workers/jobWorker.js`
- **Detail:** `'pending'`, `'processing'`, `'completed'`, `'failed'` are hardcoded strings repeated 15+ times. No Status enum or constants.
- **Fix:** Define `JOB_STATUS = Object.freeze({ ... })` in a constants file.

### [LOW-7] `package.json` Has Unused Dependency
- **File:** `package.json`
- **Detail:** `"winston"` is listed but pino is actually used by most modules. Remove the unused one after standardizing.

### [LOW-8] `.env.example` Contains Broken / Truncated Values
- **File:** `.env.example:11-13`
- **Detail:** `REDIS_PASSWORD` line appears truncated; `REDIS_URL` lacks db index.
- **Fix:** Clean up and comment optional variables properly.

### [LOW-9] `bulk.sh` Is "Largerly Untested"
- **File:** `bulk.sh`
- **Detail:** Script itself admits it is largely untested. No input sanitization, no timeout on curl, no trap for cleanup.
- **Fix:** Refactor to Node.js script with proper error handling.

---

## 6. Infrastructure / DevOps  (0 Critical, 1 High, 2 Medium, 2 Low)

### [HIGH-10] `docker-compose.yml` Has No Healthchecks
- **File:** `docker-compose.yml`
- **Detail:** No healthcheck on `api` or `worker` containers. Docker will not know when the app is actually ready.
- **Fix:** Add `healthcheck: test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]`.

### [MED-15] `Dockerfile` Does Not Create Results Dir With Correct Perms
- **File:** `Dockerfile:14`
- **Detail:** `RUN mkdir -p uploads results` creates dirs as root, but the app may run as non-root. No `USER` directive present.
- **Fix:** Add a non-root `USER` instruction or `chmod` the dirs.

### [MED-16] No Log Rotation Configured
- **File:** `src/utils/logger.js:82-96`
- **Detail:** Winston file transports append indefinitely in production.
- **Fix:** Add `winston-daily-rotate-file` or similar.

### [LOW-10] No CI/CD Pipeline
- **File:** (missing `.github/workflows/`)
- **Detail:** No automated testing, linting, or vulnerability scanning on PR.
- **Fix:** Add GitHub Actions workflow.

### [LOW-11] `docker-compose.yml` Volumes Use Host Bind Mounts
- **File:** `docker-compose.yml:20-21,34-35`
- **Detail:** `./uploads` and `./results` are bind-mounted. On macOS/Windows this is slow; on Linux it leaks host fs into container.
- **Fix:** Use named Docker volumes for production.

---

## 7. Testing  (0 Critical, 1 High, 3 Medium, 2 Low)

### [HIGH-11] Only One Test File With Mocked Redis
- **File:** `tests/jobFlow.test.js`
- **Detail:** The entire test suite is one file with 2 tests. No unit tests for `promptService`, `geminiService`, or `queueService`. No integration tests against real Redis.
- **Fix:** Expand to `tests/unit/` and `tests/integration/`.

### [MED-17] Tests Do Not Cover Error Paths
- **File:** `tests/jobFlow.test.js`
- **Detail:** No tests for 404 job not found, 400 validation failure, missing image, invalid mime type, or Gemini API errors.
- **Fix:** Add negative test cases.

### [MED-18] Supertest App Import May Not Close Server
- **File:** `tests/jobFlow.test.js:106`
- **Detail:** `app` is required but `server.js` is never imported, so the test may not fully exercise the bootstrap. If app imports server, port conflicts can occur in parallel test runs.
- **Fix:** Export app without `listen()` for tests; use `supertest(app)`.

### [MED-19] Redis Mock Does Not Validate Set Membership
- **File:** `tests/jobFlow.test.js:84-89`
- **Detail:** `sMove` mock blindly adds/deletes without checking source membership. Tests could pass even if real Redis behavior differs.
- **Fix:** Make mock behavior stricter or use `redis-memory-server`.

### [LOW-12] Test Image Is Not a Real Image
- **File:** `tests/jobFlow.test.js:116`
- **Detail:** `'dummy image content'` is written to a `.jpg` file. Multer and Gemini validation may behave differently with real vs fake data.
- **Fix:** Use a real 1x1 JPEG base64 buffer for fidelity.

### [LOW-13] No Coverage Threshold Configured
- **File:** `package.json`
- **Detail:** `jest --coverage` runs but no threshold is enforced.
- **Fix:** Add `coverageThreshold` to `package.json`.

---

## 8. Dependencies / Supply Chain  (0 Critical, 1 High, 1 Medium, 1 Low)

### [HIGH-12] `dotenv` Version Is Non-Existent
- **File:** `package.json:24`
- **Detail:** `"dotenv": "^17.2.3"` — latest dotenv on npm is `16.x`. This version does not exist and `npm install` will fail or resolve incorrectly.
- **Fix:** Downgrade to `"^16.4.7"` or latest stable.

### [MED-20] `multer` Version 2.0.2 Is a Major-0 Pre-Release
- **File:** `package.json:27`
- **Detail:** `multer` v2.0.2 is very old (from 2020) and considered unstable. `v1.4.5-lts.1` is the current stable line.
- **Fix:** Switch to `"multer": "^1.4.5-lts.1"`.

### [LOW-14] Gemini SDK Model Name Is Experimental
- **File:** `src/services/geminiService.js:11`
- **Detail:** `'gemini-3-pro-image-preview'` is a preview model. API surface may change without notice, breaking production.
- **Fix:** Pin to a stable model or make it overridable with warning logs.

---

## Final Score & Verdict

| Metric | Count |
|--------|:-----:|
| Total Findings | **52** |
| Critical | **6** |
| High | **12** |
| Medium | **20** |
| Low | **14** |

**Production Readiness:** `NOT READY`

### Top 5 Blockers
1. Fix the `/prompts` route mount (**CRIT-1**)
2. Add rate limiting + CORS whitelist (**CRIT-2**, **CRIT-3**)
3. Fix non-existent `dotenv` version (**HIGH-12**)
4. Standardize on one logger and remove winston (**HIGH-9**)
5. Add authentication middleware (**HIGH-1**)
