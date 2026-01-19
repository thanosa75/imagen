const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const JOB_KEY_PREFIX = 'job:';
const JOB_STATUS_PREFIX = 'jobs:status:';
const ACTIVE_JOBS_KEY = 'jobs:active';
const DEFAULT_TTL = parseInt(process.env.JOB_TTL || '86400', 10); // 24 hours

/**
 * Create a new job in Redis
 * @param {Object} jobData - Job data
 * @param {string} jobData.jobId - Unique job identifier
 * @param {string} jobData.promptId - Prompt identifier
 * @param {string} jobData.expectedOutcome - Expected outcome type (text|image)
 * @param {Object} [jobData.variables] - Prompt variables
 * @param {string} [jobData.imageMimeType] - Image MIME type
 * @returns {Promise<Object>} Created job data
 */
async function createJob(jobData) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobData.jobId}`;
  const now = new Date().toISOString();

  const jobRecord = {
    jobId: jobData.jobId,
    status: 'pending',
    promptId: jobData.promptId,
    expectedOutcome: jobData.expectedOutcome,
    createdAt: now,
    updatedAt: now,
  };

  // Add optional fields
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
    // Store job as hash
    await client.hSet(jobKey, jobRecord);

    // Add to status index
    await client.sAdd(`${JOB_STATUS_PREFIX}pending`, jobData.jobId);

    // Set TTL
    await client.expire(jobKey, DEFAULT_TTL);

    logger.info(`Job created: ${jobData.jobId}`);
    return jobRecord;
  } catch (error) {
    logger.error(`Error creating job ${jobData.jobId}:`, error);
    throw error;
  }
}

/**
 * Get job by ID
 * @param {string} jobId - Job identifier
 * @returns {Promise<Object|null>} Job data or null if not found
 */
async function getJobById(jobId) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const jobData = await client.hGetAll(jobKey);

    if (!jobData || Object.keys(jobData).length === 0) {
      logger.debug(`Job not found: ${jobId}`);
      return null;
    }

    // Parse JSON fields
    if (jobData.variables) {
      try {
        jobData.variables = JSON.parse(jobData.variables);
      } catch (e) {
        logger.warn(`Failed to parse variables for job ${jobId}`);
      }
    }

    // Convert numeric fields
    if (jobData.processingTime) {
      jobData.processingTime = parseInt(jobData.processingTime, 10);
    }

    return jobData;
  } catch (error) {
    logger.error(`Error getting job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Update job status
 * @param {string} jobId - Job identifier
 * @param {string} newStatus - New status (pending|processing|completed|failed)
 * @param {string} [oldStatus] - Old status for index update
 * @returns {Promise<void>}
 */
async function updateJobStatus(jobId, newStatus, oldStatus = null) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;
  const now = new Date().toISOString();

  try {
    const updates = {
      status: newStatus,
      updatedAt: now,
    };

    // Add completedAt timestamp for completed/failed jobs
    if (newStatus === 'completed' || newStatus === 'failed') {
      updates.completedAt = now;
    }

    await client.hSet(jobKey, updates);

    // Update status index
    if (oldStatus) {
      await client.sMove(
        `${JOB_STATUS_PREFIX}${oldStatus}`,
        `${JOB_STATUS_PREFIX}${newStatus}`,
        jobId
      );
    } else {
      // If oldStatus not provided, try to remove from all possible statuses
      const statuses = ['pending', 'processing', 'completed', 'failed'];
      for (const status of statuses) {
        if (status !== newStatus) {
          await client.sRem(`${JOB_STATUS_PREFIX}${status}`, jobId);
        }
      }
      await client.sAdd(`${JOB_STATUS_PREFIX}${newStatus}`, jobId);
    }

    // Manage active jobs set
    if (newStatus === 'processing') {
      await client.sAdd(ACTIVE_JOBS_KEY, jobId);
    } else if (newStatus === 'completed' || newStatus === 'failed') {
      await client.sRem(ACTIVE_JOBS_KEY, jobId);
    }

    logger.info(`Job ${jobId} status updated: ${oldStatus || '?'} -> ${newStatus}`);
  } catch (error) {
    logger.error(`Error updating job status ${jobId}:`, error);
    throw error;
  }
}

/**
 * Update job with results
 * @param {string} jobId - Job identifier
 * @param {Object} results - Job results
 * @param {string} [results.resultText] - Text result
 * @param {string} [results.resultImagePath] - Image result path
 * @param {number} [results.processingTime] - Processing time in milliseconds
 * @param {string} [results.promptUsed] - Resolved prompt text
 * @param {string} [results.modelVersion] - Model version used
 * @returns {Promise<void>}
 */
async function updateJobResults(jobId, results) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const updates = {
      updatedAt: new Date().toISOString(),
    };

    if (results.resultText !== undefined) {
      updates.resultText = results.resultText;
    }
    if (results.resultImagePath !== undefined) {
      updates.resultImagePath = results.resultImagePath;
    }
    if (results.processingTime !== undefined) {
      updates.processingTime = results.processingTime.toString();
    }
    if (results.promptUsed !== undefined) {
      updates.promptUsed = results.promptUsed;
    }
    if (results.modelVersion !== undefined) {
      updates.modelVersion = results.modelVersion;
    }

    await client.hSet(jobKey, updates);
    logger.info(`Job ${jobId} results updated`);
  } catch (error) {
    logger.error(`Error updating job results ${jobId}:`, error);
    throw error;
  }
}

/**
 * Update job with error information
 * @param {string} jobId - Job identifier
 * @param {string} errorMessage - Error message
 * @param {string} [errorCode] - Error code
 * @returns {Promise<void>}
 */
async function updateJobError(jobId, errorMessage, errorCode = 'PROCESSING_ERROR') {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const updates = {
      errorMessage,
      errorCode,
      updatedAt: new Date().toISOString(),
    };

    await client.hSet(jobKey, updates);
    logger.info(`Job ${jobId} error updated: ${errorCode}`);
  } catch (error) {
    logger.error(`Error updating job error ${jobId}:`, error);
    throw error;
  }
}

/**
 * Get jobs by status
 * @param {string} status - Job status
 * @returns {Promise<string[]>} Array of job IDs
 */
async function getJobsByStatus(status) {
  const client = getRedisClient();

  try {
    const jobIds = await client.sMembers(`${JOB_STATUS_PREFIX}${status}`);
    return jobIds;
  } catch (error) {
    logger.error(`Error getting jobs by status ${status}:`, error);
    throw error;
  }
}

/**
 * Get active jobs
 * @returns {Promise<string[]>} Array of active job IDs
 */
async function getActiveJobs() {
  const client = getRedisClient();

  try {
    const jobIds = await client.sMembers(ACTIVE_JOBS_KEY);
    return jobIds;
  } catch (error) {
    logger.error('Error getting active jobs:', error);
    throw error;
  }
}

/**
 * Delete a job
 * @param {string} jobId - Job identifier
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteJob(jobId) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    // Get job to determine status
    const job = await getJobById(jobId);
    if (!job) {
      return false;
    }

    // Remove from status index
    await client.sRem(`${JOB_STATUS_PREFIX}${job.status}`, jobId);

    // Remove from active jobs if present
    await client.sRem(ACTIVE_JOBS_KEY, jobId);

    // Delete job hash
    const deleted = await client.del(jobKey);

    logger.info(`Job ${jobId} deleted`);
    return deleted > 0;
  } catch (error) {
    logger.error(`Error deleting job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Check if job exists
 * @param {string} jobId - Job identifier
 * @returns {Promise<boolean>} True if exists
 */
async function jobExists(jobId) {
  const client = getRedisClient();
  const jobKey = `${JOB_KEY_PREFIX}${jobId}`;

  try {
    const exists = await client.exists(jobKey);
    return exists === 1;
  } catch (error) {
    logger.error(`Error checking job existence ${jobId}:`, error);
    throw error;
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
};
