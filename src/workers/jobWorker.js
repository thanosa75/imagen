const { initRedis, closeRedis } = require('../config/redis');
const { dequeueJob } = require('../services/queueService');
const {
  getJobById,
  updateJobStatus,
  updateJobResults,
  updateJobError,
} = require('../repositories/jobRepository');
const logger = require('../utils/logger');
const geminiService = require('../services/geminiService');
const promptService = require('../services/promptService');
const fs = require('fs').promises;
const path = require('path');

// Worker state
let isShuttingDown = false;
let currentJobId = null;

/**
 * Process job with real Gemini API
 * @param {Object} job - Job data
 * @returns {Promise<Object>} Processing result
 */
async function processJobWithGemini(job, jobLogger) {
  const startTime = Date.now();

  jobLogger.debug(`Processing job with promptId: ${job.promptId}`);

  try {
    // Parse variables if stored as JSON string
    const variables = typeof job.variables === 'string'
      ? JSON.parse(job.variables)
      : job.variables || {};

    // Get and resolve the prompt
    const { prompt: resolvedPrompt, metadata } = await promptService.getResolvedPrompt(
      job.promptId,
      variables,
      job.expectedOutcome
    );

    jobLogger.debug(`Resolved prompt: ${resolvedPrompt.substring(0, 100)}...`);

    // Read the image data
    let imageBuffer;
    let mimeType = job.imageMimeType || 'image/jpeg';

    if (job.imageData) {
      // Image data is stored as base64 string
      imageBuffer = Buffer.from(job.imageData, 'base64');
    } else if (job.imagePath) {
      // Image is stored as file
      imageBuffer = await fs.readFile(job.imagePath);
    } else {
      throw new Error('No image data or path found in job');
    }

    // Validate the image
    geminiService.validateImage(imageBuffer, mimeType);

    // Process with Gemini
    const geminiResult = await geminiService.processImage(
      imageBuffer,
      resolvedPrompt,
      variables,
      job.expectedOutcome,
      mimeType
    );

    //logger.info(`process returned result ${JSON.stringify(geminiResult)}`);

    if (!geminiResult.success) {
      throw new Error(geminiResult.error.message);
    }

    const processingTime = Date.now() - startTime;

    // Prepare results based on outcome
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

      // Save the image and store the path
      // this is a base64 string
      const img = decodeBase64Image(geminiResult.result.image);

      const imagePath = path.join('results', `${job.jobId}${extFromMimeType(geminiResult.result.mimeType)}`);
      logger.info(`about to write ${img.length} bytes of ${geminiResult.result.mimeType} to ${imagePath}`);
      await fs.writeFile(imagePath, img.data );
      results.resultImagePath = imagePath;
    }

    jobLogger.debug(`Job processed internally in ${processingTime}ms`);

    return results;

  } catch (error) {
    // Error is logged by the caller
    throw error;
  }
}

function extFromMimeType(mimeType) {
  const mimeToExtension = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/json': '.json'
  };
  
  const normalizedMime = mimeType?.toLowerCase().trim();
  const extension = mimeToExtension[normalizedMime];
  
  if (!extension) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
  
  return extension;
}


function decodeBase64Image(dataString) {
  if (!dataString || typeof dataString !== 'string') {
    throw new Error('Input must be a non-empty string');
  }
  
  try {
    const decoded = Buffer.from(dataString, 'base64');
    return {
      data: decoded,
      length: decoded.length
    };
  } catch (error) {
    throw error;
  }
}
/**
 * Process a single job
 * @param {string} jobId - Job identifier
 * @returns {Promise<boolean>} True if processed successfully
 */
async function processJob(jobId) {
  currentJobId = jobId;
  const jobLogger = logger.child({ jobId });
  
  try {
    // Fetch job details
    const job = await getJobById(jobId);
    
    if (!job) {
      jobLogger.error(`Job not found in database`);
      return false;
    }
    
    if (job.status !== 'pending') {
      jobLogger.warn(`Job is not in pending state (current: ${job.status})`);
      return false;
    }
    
    // Update status to processing
    await updateJobStatus(jobId, 'processing', 'pending');
    jobLogger.info(`Started processing job`);
    
    try {
      // Process the job with real Gemini API
      const results = await processJobWithGemini(job, jobLogger);
      
      // Check if shutdown was requested during processing
      if (isShuttingDown) {
        jobLogger.warn(`Job interrupted by shutdown, will be requeued`);
        await updateJobStatus(jobId, 'pending', 'processing');
        return false;
      }
      
      // Update job with results
      await updateJobResults(jobId, results);
      
      // Mark as completed
      await updateJobStatus(jobId, 'completed', 'processing');
      
      jobLogger.info(`Job completed successfully in ${results.processingTime}ms`);
      return true;
      
    } catch (processingError) {
      jobLogger.error(`Error processing job:`, processingError);
      
      // Update job with error
      await updateJobError(
        jobId,
        processingError.message,
        processingError.code || 'PROCESSING_ERROR'
      );
      
      // Mark as failed
      await updateJobStatus(jobId, 'failed', 'processing');
      
      return false;
    }
    
  } catch (error) {
    jobLogger.error(`Fatal error processing job:`, error);
    return false;
  } finally {
    currentJobId = null;
  }
}

/**
 * Main worker loop
 */
async function startWorker() {
  logger.info('Job worker starting...');
  
  try {
    // Initialize Redis connection
    await initRedis();
    logger.info('Job worker connected to Redis');
    
    // Main processing loop
    while (!isShuttingDown) {
      try {
        // Wait for next job (5 second timeout to allow checking shutdown flag)
        const jobId = await dequeueJob(5);
        
        if (jobId) {
          await processJob(jobId);
        }
        
        // Small delay between jobs to prevent tight loops
        if (!isShuttingDown) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        if (isShuttingDown) {
          break;
        }
        
        logger.error('Error in worker loop:', error);
        
        // Back off on errors to prevent rapid failure loops
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    logger.info('Worker loop ended');
    
  } catch (error) {
    logger.error('Fatal error in worker:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }
  
  logger.info('Shutdown signal received, starting graceful shutdown...');
  isShuttingDown = true;
  
  // Wait for current job to finish (with timeout)
  if (currentJobId) {
    logger.info(`Waiting for current job ${currentJobId} to finish...`);
    
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    let waited = 0;
    
    while (currentJobId && waited < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    if (currentJobId) {
      logger.warn(`Job ${currentJobId} did not finish within timeout, forcing shutdown`);
    } else {
      logger.info('Current job finished successfully');
    }
  }
  
  // Close Redis connection
  try {
    await closeRedis();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
  
  logger.info('Worker shutdown complete');
  process.exit(0);
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
  // Handle SIGTERM (Docker stop, Kubernetes termination)
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    shutdown();
  });
  
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received');
    shutdown();
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown();
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
  });
}

/**
 * Main entry point
 */
async function main() {
  logger.info('=== Job Worker Starting ===');
  logger.info(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Redis host: ${process.env.REDIS_HOST || 'localhost'}`);
  logger.info(`Redis port: ${process.env.REDIS_PORT || '6379'}`);
  
  // Setup signal handlers
  setupSignalHandlers();
  
  // Start worker
  await startWorker();
}

// Start the worker if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  });
}

module.exports = {
  startWorker,
  shutdown,
  processJob,
};
