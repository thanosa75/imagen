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
