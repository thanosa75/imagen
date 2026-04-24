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

const JOB_KEY_PREFIX = 'job:';

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
    if (geminiResult.result.note) {
      results.note = geminiResult.result.note;
    }
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

  // Run one ghost cleanup at startup (HIGH-7 / HIGH-8)
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
