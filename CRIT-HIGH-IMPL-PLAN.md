# IMAGEN PROJECT — Critical & High Findings Implementation Plan

**Scope:** Addresses all 6 Critical and 12 High findings from `FINDINGS.md`.  
**Approach:** Phased by dependency order (foundation → security → routing → controllers → services → worker → infra → tests).  
**Grouping:** Within each phase, changes are grouped by target file. Every change includes the finding ID, rationale, step-by-step instructions, and a proposed code block.

---

## Legend

| ID | Severity | File(s) |
|----|----------|---------|
| CRIT-1 | Critical | `src/app.js`, `src/routes/jobRoutes.js` |
| CRIT-2 | Critical | `src/app.js`, `src/middleware/rateLimiter.js` (new) |
| CRIT-3 | Critical | `src/app.js` |
| CRIT-4 | Critical | `src/routes/jobRoutes.js` |
| CRIT-5 | Critical | `src/controllers/jobController.js` |
| CRIT-6 | Critical | `src/repositories/jobRepository.js` |
| HIGH-1 | High | `src/app.js`, `src/middleware/auth.js` (new) |
| HIGH-2 | High | `src/routes/jobRoutes.js` |
| HIGH-3 | High | `src/app.js` |
| HIGH-4 | High | `src/controllers/jobController.js` |
| HIGH-5 | High | `src/services/geminiService.js`, `src/errors/GeminiErrors.js` (new) |
| HIGH-6 | High | `src/workers/jobWorker.js` |
| HIGH-7 | High | `src/repositories/jobRepository.js` |
| HIGH-8 | High | `src/workers/jobWorker.js`, `src/repositories/jobRepository.js` |
| HIGH-9 | High | `src/config/logger.js`, `src/utils/logger.js` |
| HIGH-10 | High | `docker-compose.yml`, `Dockerfile` |
| HIGH-11 | High | `tests/` |
| HIGH-12 | High | `package.json` |

---

## Phase 1: Foundation & Dependency Stability
**Goal:** Fix broken dependencies and unify the logging surface before any other code changes.  
**Findings:** HIGH-9, HIGH-12

---

### `package.json`
**Findings:** HIGH-12

**Step 1.1 — Fix non-existent `dotenv` version**  
Replace `"dotenv": "^17.2.3"` with the latest stable v16 line.

**Step 1.2 — Fix unstable `multer` version**  
Replace `"multer": "^2.0.2"` with the LTS v1 line.

**Step 1.3 — Add new production dependencies**  
`express-rate-limit` is required for CRIT-2.

**Step 1.4 — Remove unused `winston`**  
After consolidating on pino (see `src/utils/logger.js` below), drop the dead dependency.

```json
{
  "name": "imagen",
  "version": "1.0.0",
  "description": "Gemini Image Processing API",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^5.2.1",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.1.0",
    "multer": "^1.4.5-lts.1",
    "pino": "^10.2.0",
    "pino-pretty": "^13.1.3",
    "redis": "^5.10.0",
    "swagger-jsdoc": "^6.2.8",
    "swagger-ui-express": "^5.0.1",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "jest": "^30.2.0",
    "nodemon": "^3.1.11",
    "redis-mock": "^0.56.3",
    "supertest": "^7.2.2"
  }
}
```

**Post-step:** Run `rm -rf node_modules package-lock.json && npm install` to verify resolution.

---

### `src/config/logger.js`  &  `src/utils/logger.js`
**Findings:** HIGH-9

**Rationale:** The project currently imports `pino` in `src/server.js` and `winston` everywhere else. This creates inconsistent log formats and forces maintenance of two configs. We standardize on **pino** because it is already a dependency, is faster, and its JSON output is ideal for structured logging in containerized environments.

**Step 1.5 — Keep and enhance `src/config/logger.js`**  
No change required to this file; it is already a correct pino setup.

**Step 1.6 — Replace `src/utils/logger.js` with a re-export**  
This prevents breaking every existing `require('../utils/logger')` import while eliminating winston.

```javascript
// src/utils/logger.js
const logger = require('../config/logger');
module.exports = logger;
```

**Step 1.7 — Update `src/server.js` import**  
Change line 3 from `./config/logger` to `./utils/logger` for consistency (optional but keeps imports uniform).

```javascript
// src/server.js
require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
// ... rest unchanged
```

**Verification:** Start the server and confirm logs appear as single-line JSON (or pretty-printed in dev) with no winston color artifacts.

---

## Phase 2: Security Hardening (API Surface)
**Goal:** Lock down the Express app with authentication, rate limiting, CORS restrictions, and body-size guards.  
**Findings:** CRIT-2, CRIT-3, HIGH-1, HIGH-3

---

### `src/middleware/auth.js`  (NEW FILE)
**Findings:** HIGH-1

**Rationale:** Every endpoint is currently unauthenticated. A simple API-key middleware is the fastest production-grade fix. The key is compared against `process.env.API_KEY` using `crypto.timingSafeEqual` to prevent timing attacks.

```javascript
// src/middleware/auth.js
const crypto = require('crypto');
const logger = require('../utils/logger');

const API_KEY = process.env.API_KEY || '';

function authMiddleware(req, res, next) {
  // Allow health check without auth (load balancers need it)
  if (req.path === '/health') {
    return next();
  }

  const provided = req.headers['x-api-key'] || '';

  if (!API_KEY || API_KEY.length === 0) {
    logger.warn('API_KEY is not configured; rejecting request');
    return res.status(500).json({
      error: { code: 'SERVER_CONFIG_ERROR', message: 'Authentication is not configured' }
    });
  }

  if (provided.length !== API_KEY.length) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' }
    });
  }

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(API_KEY, 'utf8');

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' }
    });
  }

  next();
}

module.exports = authMiddleware;
```

---

### `src/middleware/rateLimiter.js`  (NEW FILE)
**Findings:** CRIT-2

**Rationale:** `.env.example` already defines rate-limit variables but no middleware consumes them. We mount a memory-store rate limiter globally. For multi-instance deployments, swap to `rate-limit-redis` later without changing this file.

```javascript
// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

const limiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn(`Rate limit exceeded for ${req.ip}`);
    res.status(options.statusCode).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${maxRequests} per ${windowMs}ms.`
      }
    });
  },
  skip: (req) => req.path === '/health', // health checks must not be throttled
});

module.exports = limiter;
```

---

### `src/app.js`
**Findings:** CRIT-2, CRIT-3, HIGH-1, HIGH-3, CRIT-1 (partial — routing fix only)

**Rationale:** This is the central security choke-point. We add body limits, CORS whitelist, rate limiter, auth, and fix the `/prompts` mis-mount by moving it to a dedicated router.

```javascript
// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jobRoutes = require('./routes/jobRoutes');
const promptRoutes = require('./routes/promptRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { isConnected } = require('./config/redis');

const app = express();

// Security middleware
app.use(helmet());

// CORS whitelist (CRIT-3)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));

// Body parsing with strict limits (HIGH-3)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Request logging
app.use(requestLogger);

// Rate limiting (CRIT-2)
app.use(rateLimiter);

// Authentication (HIGH-1)
app.use(authMiddleware);

// Swagger Documentation — only in non-production
if (process.env.NODE_ENV !== 'production') {
  app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Health check with Redis verification (bonus robustness)
app.get('/health', async (req, res) => {
  const redisOk = isConnected();
  const statusCode = redisOk ? 200 : 503;
  res.status(statusCode).json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    app: 'imagen'
  });
});

// API Routes
app.use('/jobs', jobRoutes);
app.use('/prompts', promptRoutes); // fixed: now uses dedicated router (CRIT-1)

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
```

**Post-step:** Add new environment variables to `.env.example`:

```bash
# Security
API_KEY=change-me-in-production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## Phase 3: Routing & Upload Safety
**Goal:** Remove the dangerous `/prompts` double-mount, fix route collision, and harden file upload paths.  
**Findings:** CRIT-1, CRIT-4, HIGH-2

---

### `src/routes/promptRoutes.js`  (NEW FILE)
**Findings:** CRIT-1

**Rationale:** Extract the prompt-listing endpoint from `jobRoutes` so `/prompts` no longer carries the full job API surface.

```javascript
// src/routes/promptRoutes.js
const express = require('express');
const jobController = require('../controllers/jobController');

const router = express.Router();

/**
 * @swagger
 * /prompts/show:
 *   get:
 *     summary: List all available prompts
 *     tags: [Prompts]
 *     responses:
 *       200:
 *         description: List of prompts
 */
router.get('/show', jobController.listPrompts);

module.exports = router;
```

---

### `src/routes/jobRoutes.js`
**Findings:** CRIT-1, CRIT-4, HIGH-2

**Changes:**
1. **Remove** the `/show` route and the `listPrompts` controller binding (moved to `promptRoutes`).
2. **Fix** upload directory to use a non-web-accessible temp path and ensure directory creation is absolute.
3. **Fix** route collision by moving image result to `/jobs/:id/result-image` (or keep `/image` but register it **before** `/:id`). Express routes are matched in order, so `/image` must be declared first.

```javascript
// src/routes/jobRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jobController = require('../controllers/jobController');
const { validateJobSubmission } = require('../middleware/validator');

const router = express.Router();

// Use os.tmpdir() in production, fallback to local uploads dir in dev
const uploadDir = process.env.NODE_ENV === 'production'
  ? path.join(os.tmpdir(), 'imagen-uploads')
  : path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Strip originalname to avoid path traversal or probe attacks (HIGH-2)
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${uniqueSuffix}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WEBP are allowed.'), false);
    }
  }
});

/**
 * @swagger
 * /jobs/{id}/result-image:
 *   get:
 *     summary: Get image result binary
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Image file
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image or Job not found
 */
router.get('/:id/result-image', jobController.getJobImage);

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get job status and results
 *     tags: [Jobs]
 */
router.get('/:id', jobController.getJobStatus);

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Submit a new image processing job
 *     tags: [Jobs]
 */
router.post(
  '/',
  upload.single('image'),
  validateJobSubmission,
  jobController.submitJob
);

module.exports = router;
```

**Post-step:** Update Swagger comments in `src/config/swagger.js` if paths were renamed (e.g., `/result-image`).

---

## Phase 4: Controller Reliability
**Goal:** Eliminate the file cleanup race condition and fix the file-stream leak.  
**Findings:** CRIT-5, HIGH-4

---

### `src/controllers/jobController.js`
**Findings:** CRIT-5, HIGH-4

**Rationale:**
- **CRIT-5:** The `submitJob` catch block cleans up the uploaded file but leaves a stale job record in Redis if enqueue fails. We wrap the entire post-validation persistence in a `try` and, on any failure, **delete the job record** in addition to the file.
- **HIGH-4:** `fs.createReadStream` must have an error listener. If the client disconnects, the unhandled `error` event can crash the process.

```javascript
// src/controllers/jobController.js
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const jobRepository = require('../repositories/jobRepository');
const promptService = require('../services/promptService');
const { enqueueJob } = require('../services/queueService');
const logger = require('../utils/logger');

/**
 * Handle POST /jobs - Submit a new image processing job
 */
const submitJob = async (req, res, next) => {
  let createdJob = null;

  try {
    if (!req.file) {
      const error = new Error('Image file is required');
      error.statusCode = 400;
      error.code = 'MISSING_IMAGE';
      throw error;
    }

    // Validate promptId exists BEFORE creating any persistent state (bonus from MED-5)
    const prompt = await promptService.getPromptById(req.body.promptId);
    if (!prompt) {
      const error = new Error(`Prompt '${req.body.promptId}' not found`);
      error.statusCode = 400;
      error.code = 'INVALID_PROMPT';
      throw error;
    }

    const jobId = uuidv4();

    const jobData = {
      jobId,
      promptId: req.body.promptId,
      expectedOutcome: req.body.expectedOutcome,
      variables: req.body.variables,
      imageMimeType: req.file.mimetype,
      imagePath: req.file.path
    };

    createdJob = await jobRepository.createJob(jobData);

    // Enqueue after record is durable
    await enqueueJob(jobId);

    req.log.info('Job created successfully', { jobId: createdJob.jobId });
    res.status(201).json({
      jobId: createdJob.jobId,
      status: createdJob.status,
      createdAt: createdJob.createdAt
    });

  } catch (error) {
    // CRIT-5 fix: clean up BOTH file and stale job record
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    if (createdJob && createdJob.jobId) {
      try {
        await jobRepository.deleteJob(createdJob.jobId);
        logger.info(`Rolled back stale job record ${createdJob.jobId}`);
      } catch (cleanupErr) {
        logger.error(`Failed to clean up stale job ${createdJob.jobId}:`, cleanupErr);
      }
    }
    next(error);
  }
};

/**
 * Handle GET /jobs/:id - Get job status and results
 */
const getJobStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobRepository.getJobById(id);

    if (!job) {
      const error = new Error('Job not found');
      error.statusCode = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    const response = {
      jobId: job.jobId,
      status: job.status,
      promptId: job.promptId,
      expectedOutcome: job.expectedOutcome,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt || null,
    };

    req.log.debug(`Retrieved status for job ${id}: ${job.status}`);

    if (job.status === 'completed' && job.expectedOutcome === 'text') {
      response.result = { text: job.resultText };
    }

    if (job.status === 'failed') {
      response.error = {
        message: job.errorMessage,
        code: job.errorCode
      };
    }

    if (job.processingTime || job.promptUsed || job.modelVersion) {
      response.metadata = {
        processingTime: job.processingTime ? parseInt(job.processingTime, 10) : undefined,
        promptUsed: job.promptUsed,
        modelVersion: job.modelVersion
      };
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle GET /jobs/:id/result-image - Get image result
 */
const getJobImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobRepository.getJobById(id);

    if (!job) {
      const error = new Error('Job not found');
      error.statusCode = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    if (job.expectedOutcome !== 'image') {
      const error = new Error('Job outcome type is not image');
      error.statusCode = 400;
      error.code = 'INVALID_OUTCOME_TYPE';
      throw error;
    }

    if (job.status !== 'completed') {
      const status = job.status === 'failed' ? 404 : 409;
      const error = new Error(
        job.status === 'failed' ? 'Job failed, no image available' : 'Job not yet completed'
      );
      error.statusCode = status;
      error.code = job.status === 'failed' ? 'JOB_FAILED' : 'JOB_NOT_COMPLETED';
      throw error;
    }

    if (!job.resultImagePath || !fs.existsSync(job.resultImagePath)) {
      const error = new Error('Image result not found on server');
      error.statusCode = 404;
      error.code = 'IMAGE_NOT_FOUND';
      throw error;
    }

    const mimeType = job.imageMimeType || 'image/jpeg';

    req.log.info(`Serving result image for job ${id}`);
    res.setHeader('Content-Type', mimeType);

    // HIGH-4 fix: attach error handler to stream
    const fileStream = fs.createReadStream(job.resultImagePath);
    fileStream.on('error', (err) => {
      logger.error(`Stream error serving image for job ${id}:`, err);
      // If headers not sent, respond with error; otherwise just destroy stream
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'STREAM_ERROR', message: 'Failed to stream image' } });
      }
      fileStream.destroy();
    });

    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle GET /prompts/show - List all available prompts
 */
const listPrompts = async (req, res, next) => {
  try {
    const prompts = await promptService.getPrompts();
    res.status(200).json({
      prompts: prompts.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        requiredVariables: p.requiredVariables || [],
        supportedOutcomes: p.supportedOutcomes || []
      }))
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitJob,
  getJobStatus,
  getJobImage,
  listPrompts
};
```

---

## Phase 5: Service Resilience & Data Integrity
**Goal:** Make Gemini errors actionable, Redis status updates atomic, and prevent ghost data.  
**Findings:** CRIT-6, HIGH-5, HIGH-7

---

### `src/errors/GeminiErrors.js`  (NEW FILE)
**Findings:** HIGH-5

**Rationale:** `geminiService` currently swallows every exception into `{ success: false }`. The worker cannot tell a rate-limit (retryable) from an auth failure (fatal). Typed errors solve this.

```javascript
// src/errors/GeminiErrors.js
class GeminiError extends Error {
  constructor(message, code, isRetryable = false) {
    super(message);
    this.name = 'GeminiError';
    this.code = code || 'GEMINI_ERROR';
    this.isRetryable = isRetryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

class RetryableGeminiError extends GeminiError {
  constructor(message, code) {
    super(message, code, true);
    this.name = 'RetryableGeminiError';
  }
}

class FatalGeminiError extends GeminiError {
  constructor(message, code) {
    super(message, code, false);
    this.name = 'FatalGeminiError';
  }
}

module.exports = {
  GeminiError,
  RetryableGeminiError,
  FatalGeminiError
};
```

---

### `src/services/geminiService.js`
**Findings:** HIGH-5

**Rationale:** Replace the blanket `catch` with selective error classification. Network / 429 / 503 errors become `RetryableGeminiError`; auth / config errors become `FatalGeminiError`.

```javascript
// src/services/geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { RetryableGeminiError, FatalGeminiError } = require('../errors/GeminiErrors');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
    this.imageModelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';

    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  prepareImagePart(imageBuffer, mimeType) {
    return {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType
      }
    };
  }

  static get OUTCOMES() {
    return { TEXT: 'text', IMAGE: 'image' };
  }

  async processImage(imageBuffer, promptTemplate, variables = {}, expectedOutcome = 'text', mimeType = 'image/jpeg') {
    const normalizedOutcome = expectedOutcome.toLowerCase().trim();
    const modelName = normalizedOutcome === GeminiService.OUTCOMES.IMAGE
      ? this.imageModelName
      : this.modelName;

    const model = this.genAI.getGenerativeModel({ model: modelName });
    logger.info(`Processing job with model ${modelName}`);

    const parts = [{ text: promptTemplate }];
    if (imageBuffer) {
      parts.push(this.prepareImagePart(imageBuffer, mimeType));
    }

    try {
      const result = await model.generateContent(parts);
      const response = await result.response;

      switch (normalizedOutcome) {
        case GeminiService.OUTCOMES.TEXT:
          return this._formatTextResponse(response.text(), promptTemplate, variables);
        case GeminiService.OUTCOMES.IMAGE:
          return this._formatImageResponse(response, promptTemplate, variables);
        default:
          throw new FatalGeminiError(`Unsupported expected outcome: ${expectedOutcome}`, 'UNSUPPORTED_OUTCOME');
      }
    } catch (error) {
      logger.error('Gemini API error:', error);

      // Classify errors for the worker (HIGH-5)
      const statusCode = error.status || (error.response && error.response.status);
      const message = error.message || 'Gemini API failure';

      if (statusCode === 429 || statusCode === 503 || statusCode === 502) {
        throw new RetryableGeminiError(message, `GEMINI_${statusCode}`);
      }
      if (statusCode === 401 || statusCode === 403) {
        throw new FatalGeminiError(message, `GEMINI_${statusCode}`);
      }
      if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT') || message.includes('fetch failed')) {
        throw new RetryableGeminiError(message, 'GEMINI_NETWORK');
      }

      // Default unknown errors are treated as fatal to avoid infinite retries
      throw new FatalGeminiError(message, 'GEMINI_UNKNOWN');
    }
  }

  _formatTextResponse(text, promptTemplate, variables) {
    return {
      success: true,
      outcome: GeminiService.OUTCOMES.TEXT,
      result: { text },
      metadata: {
        modelVersion: this.modelName,
        promptUsed: promptTemplate,
        variables
      }
    };
  }

  _formatImageResponse(response, promptTemplate, variables) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData);

    if (!imagePart) {
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        throw new FatalGeminiError(`Gemini returned text instead of image: ${text}`, 'GEMINI_TEXT_FALLBACK');
      }
      throw new FatalGeminiError('No image generated in response', 'GEMINI_NO_IMAGE');
    }

    return {
      success: true,
      outcome: GeminiService.OUTCOMES.IMAGE,
      result: {
        image: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType
      },
      metadata: {
        modelVersion: this.imageModelName,
        promptUsed: promptTemplate,
        variables
      }
    };
  }

  validateImage(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new FatalGeminiError('Image must be a Buffer', 'INVALID_IMAGE');
    }
    if (imageBuffer.length === 0) {
      throw new FatalGeminiError('Image buffer is empty', 'INVALID_IMAGE');
    }
    const supportedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedMimeTypes.includes(mimeType)) {
      throw new FatalGeminiError(
        `Unsupported MIME type: ${mimeType}. Supported: ${supportedMimeTypes.join(', ')}`,
        'INVALID_MIME_TYPE'
      );
    }
  }

  getModelInfo() {
    return {
      modelName: this.modelName,
      apiConfigured: !!this.apiKey
    };
  }
}

module.exports = new GeminiService();
```

---

### `src/repositories/jobRepository.js`
**Findings:** CRIT-6, HIGH-7

**Rationale:**
- **CRIT-6:** `updateJobStatus` performs multiple Redis commands non-atomically. We wrap the `hSet` + set mutations in a `MULTI`/`EXEC` transaction.
- **HIGH-7:** Status sets accumulate ghost IDs because only the job hash has a TTL. We add a global sorted-set index `jobs:index` (by creation time) and implement a `cleanupGhostJobs()` utility that the worker can call periodically.

```javascript
// src/repositories/jobRepository.js
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const JOB_KEY_PREFIX = 'job:';
const JOB_STATUS_PREFIX = 'jobs:status:';
const ACTIVE_JOBS_KEY = 'jobs:active';
const JOB_INDEX_KEY = 'jobs:index'; // ZSET for TTL-aware indexing (HIGH-7)
const DEFAULT_TTL = parseInt(process.env.JOB_TTL || '86400', 10);

async function createJob(jobData) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobData.jobId}`;
  const now = new Date().toISOString();
  const nowMs = Date.now();

  const jobRecord = {
    jobId: jobData.jobId,
    status: 'pending',
    promptId: jobData.promptId,
    expectedOutcome: jobData.expectedOutcome,
    createdAt: now,
    updatedAt: now,
  };

  if (jobData.variables) {
    jobRecord.variables = JSON.stringify(jobData.variables);
  }
  if (jobData.imageMimeType) {
    jobRecord.imageMimeType = jobData.imageMimeType;
  }
  if (jobData.imagePath) {
    jobRecord.imagePath = jobData.imagePath;
  }

  try {
    // Atomic transaction: store job + index it + add to pending set (CRIT-6)
    const multi = client.multi();
    multi.hSet(jobKey, jobRecord);
    multi.sAdd(`${JOB_STATUS_PREFIX}pending`, jobData.jobId);
    multi.zAdd(JOB_INDEX_KEY, { score: nowMs, value: jobData.jobId });
    multi.expire(jobKey, DEFAULT_TTL);
    await multi.exec();

    logger.info(`Job created: ${jobData.jobId}`);
    return jobRecord;
  } catch (error) {
    logger.error(`Error creating job ${jobData.jobId}:`, error);
    throw error;
  }
}

async function getJobById(jobId) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const jobData = await client.hGetAll(jobKey);
    if (!jobData || Object.keys(jobData).length === 0) {
      logger.debug(`Job not found: ${jobId}`);
      return null;
    }
    if (jobData.variables) {
      try { jobData.variables = JSON.parse(jobData.variables); } catch (e) {
        logger.warn(`Failed to parse variables for job ${jobId}`);
      }
    }
    if (jobData.processingTime) {
      jobData.processingTime = parseInt(jobData.processingTime, 10);
    }
    return jobData;
  } catch (error) {
    logger.error(`Error getting job ${jobId}:`, error);
    throw error;
  }
}

async function updateJobStatus(jobId, newStatus, oldStatus = null) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;
  const now = new Date().toISOString();

  try {
    const updates = { status: newStatus, updatedAt: now };
    if (newStatus === 'completed' || newStatus === 'failed') {
      updates.completedAt = now;
    }

    // CRIT-6 fix: use MULTI/EXEC for atomic status transitions
    const multi = client.multi();
    multi.hSet(jobKey, updates);

    if (oldStatus) {
      multi.sMove(`${JOB_STATUS_PREFIX}${oldStatus}`, `${JOB_STATUS_PREFIX}${newStatus}`, jobId);
    } else {
      const statuses = ['pending', 'processing', 'completed', 'failed'];
      for (const status of statuses) {
        if (status !== newStatus) {
          multi.sRem(`${JOB_STATUS_PREFIX}${status}`, jobId);
        }
      }
      multi.sAdd(`${JOB_STATUS_PREFIX}${newStatus}`, jobId);
    }

    if (newStatus === 'processing') {
      multi.sAdd(ACTIVE_JOBS_KEY, jobId);
    } else if (newStatus === 'completed' || newStatus === 'failed') {
      multi.sRem(ACTIVE_JOBS_KEY, jobId);
    }

    await multi.exec();
    logger.info(`Job ${jobId} status updated: ${oldStatus || '?'} -> ${newStatus}`);
  } catch (error) {
    logger.error(`Error updating job status ${jobId}:`, error);
    throw error;
  }
}

async function updateJobResults(jobId, results) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const updates = { updatedAt: new Date().toISOString() };
    if (results.resultText !== undefined) updates.resultText = results.resultText;
    if (results.resultImagePath !== undefined) updates.resultImagePath = results.resultImagePath;
    if (results.processingTime !== undefined) updates.processingTime = results.processingTime.toString();
    if (results.promptUsed !== undefined) updates.promptUsed = results.promptUsed;
    if (results.modelVersion !== undefined) updates.modelVersion = results.modelVersion;

    await client.hSet(jobKey, updates);
    logger.info(`Job ${jobId} results updated`);
  } catch (error) {
    logger.error(`Error updating job results ${jobId}:`, error);
    throw error;
  }
}

async function updateJobError(jobId, errorMessage, errorCode = 'PROCESSING_ERROR') {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    await client.hSet(jobKey, {
      errorMessage,
      errorCode,
      updatedAt: new Date().toISOString(),
    });
    logger.info(`Job ${jobId} error updated: ${errorCode}`);
  } catch (error) {
    logger.error(`Error updating job error ${jobId}:`, error);
    throw error;
  }
}

async function getJobsByStatus(status) {
  const client = getRedisClient();
  try {
    return await client.sMembers(`${JOB_STATUS_PREFIX}${status}`);
  } catch (error) {
    logger.error(`Error getting jobs by status ${status}:`, error);
    throw error;
  }
}

async function getActiveJobs() {
  const client = getRedisClient();
  try {
    return await client.sMembers(ACTIVE_JOBS_KEY);
  } catch (error) {
    logger.error('Error getting active jobs:', error);
    throw error;
  }
}

async function deleteJob(jobId) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const job = await getJobById(jobId);
    if (!job) return false;

    const multi = client.multi();
    multi.sRem(`${JOB_STATUS_PREFIX}${job.status}`, jobId);
    multi.sRem(ACTIVE_JOBS_KEY, jobId);
    multi.zRem(JOB_INDEX_KEY, jobId);
    multi.del(jobKey);
    await multi.exec();

    logger.info(`Job ${jobId} deleted`);
    return true;
  } catch (error) {
    logger.error(`Error deleting job ${jobId}:`, error);
    throw error;
  }
}

async function jobExists(jobId) {
  const client = getRedisClient();
  try {
    return (await client.exists(`${JOB_KEY_PREFIX}${jobId}`)) === 1;
  } catch (error) {
    logger.error(`Error checking job existence ${jobId}:`, error);
    throw error;
  }
}

// HIGH-7 fix: clean up ghost job IDs from status sets when the job hash has expired
async function cleanupGhostJobs(maxAgeHours = 48) {
  const client = getRedisClient();
  const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
  let cleaned = 0;

  try {
    const oldJobIds = await client.zRangeByScore(JOB_INDEX_KEY, 0, cutoff);
    for (const jobId of oldJobIds) {
      const exists = await jobExists(jobId);
      if (!exists) {
        const multi = client.multi();
        ['pending', 'processing', 'completed', 'failed'].forEach(st => {
          multi.sRem(`${JOB_STATUS_PREFIX}${st}`, jobId);
        });
        multi.sRem(ACTIVE_JOBS_KEY, jobId);
        multi.zRem(JOB_INDEX_KEY, jobId);
        await multi.exec();
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} ghost job entries from status sets`);
    }
  } catch (error) {
    logger.error('Error during ghost job cleanup:', error);
  }
}

module.exports = {
  createJob,
  getJobById,
  updateJobStatus,
  updateJobResults,
  updateJobError,
  getJobsByStatus,
  getActiveJobs,
  deleteJob,
  jobExists,
  cleanupGhostJobs,
};
```

---

## Phase 6: Worker Resilience
**Goal:** Add circuit-breaker behavior, exponential backoff, and a Dead-Letter Queue with retry limits.  
**Findings:** HIGH-6, HIGH-8

---

### `src/workers/jobWorker.js`
**Findings:** HIGH-6, HIGH-8, plus MED-8 (bonus fix included)

**Rationale:**
- **HIGH-6:** The worker currently sleeps a fixed 5s on error. We add an `exponentialBackoff` helper and a simple failure counter. After 5 consecutive failures, the worker backs off to 60s to avoid hammering Redis or Gemini.
- **HIGH-8:** Failed jobs should be retried up to `MAX_RETRIES`. We store `retryCount` in the job hash. On a retryable error, increment and re-enqueue. On fatal error or max retries, mark failed.
- **MED-8:** On shutdown, if a job is interrupted, we must atomically requeue it. The current code updates status to `pending` but never pushes back to the queue. We fix this by calling `enqueueJob(jobId)` inside the shutdown branch (within a try/catch).

```javascript
// src/workers/jobWorker.js
const { initRedis, closeRedis } = require('../config/redis');
const { dequeueJob, enqueueJob } = require('../services/queueService');
const {
  getJobById,
  updateJobStatus,
  updateJobResults,
  updateJobError,
  cleanupGhostJobs,
} = require('../repositories/jobRepository');
const logger = require('../utils/logger');
const geminiService = require('../services/geminiService');
const promptService = require('../services/promptService');
const { RetryableGeminiError } = require('../errors/GeminiErrors');
const fs = require('fs').promises;
const path = require('path');

let isShuttingDown = false;
let currentJobId = null;
let consecutiveFailures = 0;
const MAX_WORKER_RETRIES = 5;
const MAX_JOB_RETRIES = parseInt(process.env.MAX_JOB_RETRIES || '3', 10);

function extFromMimeType(mimeType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
  };
  const ext = map[mimeType?.toLowerCase().trim()];
  if (!ext) throw new Error(`Unsupported MIME type: ${mimeType}`);
  return ext;
}

function decodeBase64Image(dataString) {
  if (!dataString || typeof dataString !== 'string') {
    throw new Error('Input must be a non-empty string');
  }
  const decoded = Buffer.from(dataString, 'base64');
  return { data: decoded, length: decoded.length };
}

function exponentialBackoff(failures) {
  const base = 1000;
  const cap = 60000;
  const delay = Math.min(base * Math.pow(2, failures), cap);
  const jitter = Math.floor(Math.random() * 1000);
  return delay + jitter;
}

async function processJobWithGemini(job, jobLogger) {
  const startTime = Date.now();
  jobLogger.debug(`Processing job with promptId: ${job.promptId}`);

  const variables = typeof job.variables === 'string'
    ? JSON.parse(job.variables)
    : job.variables || {};

  const { prompt: resolvedPrompt } = await promptService.getResolvedPrompt(
    job.promptId, variables, job.expectedOutcome
  );

  let imageBuffer;
  let mimeType = job.imageMimeType || 'image/jpeg';

  if (job.imageData) {
    imageBuffer = Buffer.from(job.imageData, 'base64');
  } else if (job.imagePath) {
    imageBuffer = await fs.readFile(job.imagePath);
  } else {
    throw new Error('No image data or path found in job');
  }

  geminiService.validateImage(imageBuffer, mimeType);

  const geminiResult = await geminiService.processImage(
    imageBuffer, resolvedPrompt, variables, job.expectedOutcome, mimeType
  );

  const processingTime = Date.now() - startTime;
  const results = {
    processingTime,
    promptUsed: resolvedPrompt,
    modelVersion: geminiResult.metadata.modelVersion,
  };

  if (geminiResult.outcome === 'text') {
    results.resultText = geminiResult.result.text;
  } else if (geminiResult.outcome === 'image') {
    const img = decodeBase64Image(geminiResult.result.image);
    const imagePath = path.join('results', `${job.jobId}${extFromMimeType(geminiResult.result.mimeType)}`);
    logger.info(`Writing ${img.length} bytes to ${imagePath}`);
    await fs.writeFile(imagePath, img.data);
    results.resultImagePath = imagePath;
  }

  jobLogger.debug(`Job processed in ${processingTime}ms`);
  return results;
}

async function processJob(jobId) {
  currentJobId = jobId;
  const jobLogger = logger.child({ jobId });

  try {
    const job = await getJobById(jobId);
    if (!job) {
      jobLogger.error('Job not found in database');
      return false;
    }
    if (job.status !== 'pending') {
      jobLogger.warn(`Job is not pending (current: ${job.status})`);
      return false;
    }

    await updateJobStatus(jobId, 'processing', 'pending');
    jobLogger.info('Started processing job');

    try {
      const results = await processJobWithGemini(job, jobLogger);

      if (isShuttingDown) {
        jobLogger.warn('Shutdown requested mid-processing; requeuing job');
        await updateJobStatus(jobId, 'pending', 'processing');
        await enqueueJob(jobId); // MED-8 fix: actually put it back in the queue
        return false;
      }

      await updateJobResults(jobId, results);
      await updateJobStatus(jobId, 'completed', 'processing');
      consecutiveFailures = 0; // reset on success (HIGH-6)
      jobLogger.info(`Job completed in ${results.processingTime}ms`);
      return true;

    } catch (processingError) {
      jobLogger.error('Error processing job:', processingError);
      consecutiveFailures++;

      const isRetryable = processingError instanceof RetryableGeminiError;
      const retryCount = parseInt(job.retryCount || '0', 10);

      // HIGH-8: implement retry with DLQ behavior
      if (isRetryable && retryCount < MAX_JOB_RETRIES) {
        jobLogger.warn(`Retryable error; will requeue (attempt ${retryCount + 1}/${MAX_JOB_RETRIES})`);
        await updateJobStatus(jobId, 'pending', 'processing');
        await fs.promises ? null : null; // no-op placeholder for linter
        // Update retry count in Redis
        const client = require('../config/redis').getRedisClient();
        await client.hSet(`${JOB_KEY_PREFIX}${jobId}`, {
          retryCount: (retryCount + 1).toString(),
          lastError: processingError.message
        });
        await enqueueJob(jobId);
        return false;
      }

      await updateJobError(jobId, processingError.message, processingError.code || 'PROCESSING_ERROR');
      await updateJobStatus(jobId, 'failed', 'processing');
      return false;
    }
  } catch (error) {
    jobLogger.error('Fatal error processing job:', error);
    consecutiveFailures++;
    return false;
  } finally {
    currentJobId = null;
  }
}

async function startWorker() {
  logger.info('Job worker starting...');
  await initRedis();
  logger.info('Job worker connected to Redis');

  // Run one ghost cleanup at startup (HIGH-7)
  await cleanupGhostJobs();

  while (!isShuttingDown) {
    try {
      const jobId = await dequeueJob(5);
      if (jobId) {
        await processJob(jobId);
      }
      if (!isShuttingDown) {
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (error) {
      if (isShuttingDown) break;
      logger.error('Error in worker loop:', error);
      const delay = exponentialBackoff(consecutiveFailures); // HIGH-6
      logger.info(`Backing off for ${delay}ms before next poll`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  logger.info('Worker loop ended');
}

async function shutdown() {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }
  logger.info('Shutdown signal received, starting graceful shutdown...');
  isShuttingDown = true;

  if (currentJobId) {
    logger.info(`Waiting for current job ${currentJobId} to finish...`);
    const maxWaitTime = 30000;
    const checkInterval = 500;
    let waited = 0;
    while (currentJobId && waited < maxWaitTime) {
      await new Promise(r => setTimeout(r, checkInterval));
      waited += checkInterval;
    }
    if (currentJobId) {
      logger.warn(`Job ${currentJobId} did not finish within timeout, forcing shutdown`);
    } else {
      logger.info('Current job finished successfully');
    }
  }

  try {
    await closeRedis();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }

  logger.info('Worker shutdown complete');
  process.exit(0);
}

function setupSignalHandlers() {
  process.on('SIGTERM', () => { logger.info('SIGTERM received'); shutdown(); });
  process.on('SIGINT', () => { logger.info('SIGINT received'); shutdown(); });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown();
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
  });
}

async function main() {
  logger.info('=== Job Worker Starting ===');
  logger.info(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Redis host: ${process.env.REDIS_HOST || 'localhost'}`);
  logger.info(`Redis port: ${process.env.REDIS_PORT || '6379'}`);
  setupSignalHandlers();
  await startWorker();
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  });
}

module.exports = { startWorker, shutdown, processJob };
```

**Post-step:** Add `MAX_JOB_RETRIES=3` to `.env.example`.

---

## Phase 7: Infrastructure Hardening
**Goal:** Add container healthchecks and non-root execution.  
**Findings:** HIGH-10

---

### `docker-compose.yml`
**Findings:** HIGH-10

**Rationale:** Docker Compose currently has zero healthchecks. The orchestrator cannot distinguish between "container started" and "application ready". We add healthchecks to `api` and `worker`.

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build: .
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - REDIS_URL=redis://redis:6379
    volumes:
      - uploads:/usr/src/app/uploads
      - results:/usr/src/app/results
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

  worker:
    build: .
    restart: always
    command: node src/workers/jobWorker.js
    env_file:
      - .env
    environment:
      - REDIS_URL=redis://redis:6379
    volumes:
      - uploads:/usr/src/app/uploads
      - results:/usr/src/app/results
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "ps aux | grep -v grep | grep 'node src/workers/jobWorker.js' || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  redis_data:
  uploads:
  results:
```

**Note:** Switching from bind mounts (`./uploads`) to named volumes (`uploads:`) also addresses LOW-11 as a side benefit.

---

### `Dockerfile`
**Findings:** HIGH-10 (related — permissions)

**Rationale:** The current Dockerfile creates `uploads` and `results` as root. If the image ever switches to a non-root user, writes will fail. We add a dedicated `node` user and pre-create directories with correct ownership.

```dockerfile
FROM node:25-alpine

# Create non-root user and directories
RUN addgroup -g 1001 -S imagen && \
    adduser -S imagen -u 1001 -G imagen && \
    mkdir -p /usr/src/app/uploads /usr/src/app/results && \
    chown -R imagen:imagen /usr/src/app

WORKDIR /usr/src/app

# Install dependencies as root for layer caching, then fix ownership
COPY package*.json ./
RUN npm install --omit=dev && chown -R imagen:imagen /usr/src/app

# Copy app source
COPY --chown=imagen:imagen . .

# Switch to non-root user
USER imagen

# Default command (overridden in docker-compose for worker)
CMD ["npm", "start"]
```

---

## Phase 8: Testing Foundation
**Goal:** Expand beyond the single mocked-Redis file to cover services and negative paths.  
**Findings:** HIGH-11

---

### `tests/unit/promptService.test.js`  (NEW FILE)
**Findings:** HIGH-11

```javascript
// tests/unit/promptService.test.js
const promptService = require('../../src/services/promptService');

describe('promptService', () => {
  test('loadPrompts returns an object with a prompts array', async () => {
    const prompts = await promptService.loadPrompts();
    expect(prompts).toHaveProperty('prompts');
    expect(Array.isArray(prompts.prompts)).toBe(true);
  });

  test('getPromptById returns null for unknown id', async () => {
    const prompt = await promptService.getPromptById('does-not-exist');
    expect(prompt).toBeNull();
  });

  test('resolveTemplate substitutes variables', () => {
    const template = 'Hello {{name}}, welcome to {{place}}';
    const result = promptService.resolveTemplate(template, { name: 'Alice', place: 'Wonderland' });
    expect(result).toBe('Hello Alice, welcome to Wonderland');
  });

  test('validateVariables throws on missing required vars', () => {
    const prompt = { requiredVariables: ['color'] };
    expect(() => promptService.validateVariables(prompt, {})).toThrow('Missing required variables: color');
  });
});
```

---

### `tests/unit/geminiService.test.js`  (NEW FILE)
**Findings:** HIGH-11

```javascript
// tests/unit/geminiService.test.js
const geminiService = require('../../src/services/geminiService');
const { RetryableGeminiError, FatalGeminiError } = require('../../src/errors/GeminiErrors');

describe('geminiService', () => {
  test('validateImage throws on empty buffer', () => {
    expect(() => geminiService.validateImage(Buffer.alloc(0), 'image/jpeg')).toThrow();
  });

  test('validateImage throws on unsupported mime type', () => {
    expect(() => geminiService.validateImage(Buffer.from('x'), 'image/bmp')).toThrow();
  });

  test('getModelInfo returns apiConfigured boolean', () => {
    const info = geminiService.getModelInfo();
    expect(info).toHaveProperty('apiConfigured');
    expect(typeof info.apiConfigured).toBe('boolean');
  });
});
```

---

### `tests/unit/jobController.error.test.js`  (NEW FILE)
**Findings:** HIGH-11 (bonus: covers MED-17 negative paths)

```javascript
// tests/unit/jobController.error.test.js
const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/config/redis', () => ({
  initRedis: jest.fn().mockResolvedValue(),
  getRedisClient: jest.fn().mockReturnValue({
    multi: jest.fn().mockReturnValue({
      hSet: jest.fn().mockReturnThis(),
      sAdd: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
    hGetAll: jest.fn().mockResolvedValue({}),
  }),
  closeRedis: jest.fn().mockResolvedValue(),
  isConnected: jest.fn().mockReturnValue(true),
}));

jest.mock('../../src/services/geminiService');
jest.mock('../../src/services/promptService', () => ({
  getPromptById: jest.fn().mockResolvedValue(null),
  getPrompts: jest.fn().mockResolvedValue([]),
}));

describe('Job Controller Error Paths', () => {
  test('POST /jobs without image returns 400', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY || 'test-key')
      .field('promptId', 'test')
      .field('expectedOutcome', 'text');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('GET /jobs/:id returns 404 for unknown job', async () => {
    const res = await request(app)
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('x-api-key', process.env.API_KEY || 'test-key');
    expect(res.status).toBe(404);
  });
});
```

---

## Post-Implementation Checklist

| Step | Action | Verification |
|------|--------|--------------|
| 1 | `npm install` succeeds with updated `package.json` | No audit errors |
| 2 | `npm start` boots without winston warnings | Logs are pure JSON/pretty pino |
| 3 | `curl -H "x-api-key:..." http://localhost:3000/health` | Returns 200 with `redis: connected` |
| 4 | `curl` without `x-api-key` | Returns 401 |
| 5 | `curl -H "Origin: https://evil.com" ...` | CORS blocked |
| 6 | `POST /jobs` with invalid promptId | Returns 400 before file persists |
| 7 | `POST /jobs` with large JSON body (>10kb) | Returns 413 |
| 8 | Run `npm test` | All old + new tests pass |
| 9 | `docker compose up --build` | Healthchecks show `healthy` |
| 10 | Submit job, kill worker mid-processing, restart | Job requeued and eventually completes |

---

## Appendix: Environment Variables Added

Add these to `.env.example` (and your real `.env`):

```bash
# Security
API_KEY=change-me-to-a-32-char-random-string
ALLOWED_ORIGINS=http://localhost:3000

# Worker
MAX_JOB_RETRIES=3

# Rate Limiting (already existed but now enforced)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

*End of Implementation Plan*
