const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const QUEUE_KEY = 'queue:jobs';
const PROCESSING_QUEUE_KEY = 'queue:processing';

/**
 * Add a job to the queue
 * @param {string} jobId - Job identifier
 * @returns {Promise<number>} Queue length after push
 */
async function enqueueJob(jobId) {
  const client = getRedisClient();

  try {
    // LPUSH adds to the left (head) of the list
    const queueLength = await client.lPush(QUEUE_KEY, jobId);
    logger.info(`Job ${jobId} enqueued (queue length: ${queueLength})`);
    return queueLength;
  } catch (error) {
    logger.error(`Error enqueuing job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Get the next job from the queue (blocking)
 * @param {number} [timeout=0] - Timeout in seconds (0 = wait indefinitely)
 * @returns {Promise<string|null>} Job ID or null if timeout
 */
async function dequeueJob(timeout = 0) {
  const client = getRedisClient();

  try {
    // BRPOP removes from the right (tail) of the list - FIFO behavior
    // Returns array: [key, value] or null if timeout
    const result = await client.brPop(QUEUE_KEY, timeout);
    
    if (result) {
      const jobId = result.element;
      logger.info(`Job ${jobId} dequeued`);
      return jobId;
    }
    
    return null;
  } catch (error) {
    logger.error('Error dequeuing job:', error);
    throw error;
  }
}

/**
 * Get the next job from the queue (non-blocking)
 * @returns {Promise<string|null>} Job ID or null if queue is empty
 */
async function dequeueJobNonBlocking() {
  const client = getRedisClient();

  try {
    // RPOP removes from the right (tail) of the list - FIFO behavior
    const jobId = await client.rPop(QUEUE_KEY);
    
    if (jobId) {
      logger.info(`Job ${jobId} dequeued (non-blocking)`);
    }
    
    return jobId;
  } catch (error) {
    logger.error('Error dequeuing job (non-blocking):', error);
    throw error;
  }
}

/**
 * Get queue length
 * @returns {Promise<number>} Number of jobs in queue
 */
async function getQueueLength() {
  const client = getRedisClient();

  try {
    const length = await client.lLen(QUEUE_KEY);
    return length;
  } catch (error) {
    logger.error('Error getting queue length:', error);
    throw error;
  }
}

/**
 * Peek at jobs in the queue without removing them
 * @param {number} [start=0] - Start index
 * @param {number} [stop=-1] - Stop index (-1 = end of list)
 * @returns {Promise<string[]>} Array of job IDs
 */
async function peekQueue(start = 0, stop = -1) {
  const client = getRedisClient();

  try {
    const jobs = await client.lRange(QUEUE_KEY, start, stop);
    return jobs;
  } catch (error) {
    logger.error('Error peeking queue:', error);
    throw error;
  }
}

/**
 * Remove a specific job from the queue
 * @param {string} jobId - Job identifier
 * @returns {Promise<number>} Number of removed elements
 */
async function removeFromQueue(jobId) {
  const client = getRedisClient();

  try {
    // LREM removes all occurrences of the value
    // count = 0 means remove all occurrences
    const removed = await client.lRem(QUEUE_KEY, 0, jobId);
    
    if (removed > 0) {
      logger.info(`Job ${jobId} removed from queue (${removed} occurrence(s))`);
    }
    
    return removed;
  } catch (error) {
    logger.error(`Error removing job ${jobId} from queue:`, error);
    throw error;
  }
}

/**
 * Clear the entire queue
 * @returns {Promise<boolean>} True if queue was deleted
 */
async function clearQueue() {
  const client = getRedisClient();

  try {
    const deleted = await client.del(QUEUE_KEY);
    logger.info('Queue cleared');
    return deleted > 0;
  } catch (error) {
    logger.error('Error clearing queue:', error);
    throw error;
  }
}

/**
 * Move job to processing queue (for reliable queue pattern)
 * @param {string} jobId - Job identifier
 * @returns {Promise<void>}
 */
async function moveToProcessing(jobId) {
  const client = getRedisClient();

  try {
    await client.lPush(PROCESSING_QUEUE_KEY, jobId);
    logger.debug(`Job ${jobId} moved to processing queue`);
  } catch (error) {
    logger.error(`Error moving job ${jobId} to processing:`, error);
    throw error;
  }
}

/**
 * Remove job from processing queue
 * @param {string} jobId - Job identifier
 * @returns {Promise<number>} Number of removed elements
 */
async function removeFromProcessing(jobId) {
  const client = getRedisClient();

  try {
    const removed = await client.lRem(PROCESSING_QUEUE_KEY, 0, jobId);
    
    if (removed > 0) {
      logger.debug(`Job ${jobId} removed from processing queue`);
    }
    
    return removed;
  } catch (error) {
    logger.error(`Error removing job ${jobId} from processing:`, error);
    throw error;
  }
}

/**
 * Get all jobs in processing queue
 * @returns {Promise<string[]>} Array of job IDs
 */
async function getProcessingJobs() {
  const client = getRedisClient();

  try {
    const jobs = await client.lRange(PROCESSING_QUEUE_KEY, 0, -1);
    return jobs;
  } catch (error) {
    logger.error('Error getting processing jobs:', error);
    throw error;
  }
}

/**
 * Atomically move job from main queue to processing queue
 * @param {number} [timeout=0] - Timeout in seconds
 * @returns {Promise<string|null>} Job ID or null if timeout
 */
async function dequeueToProcessing(timeout = 0) {
  const client = getRedisClient();

  try {
    // BRPOPLPUSH atomically pops from source and pushes to destination
    const jobId = await client.brPopLPush(QUEUE_KEY, PROCESSING_QUEUE_KEY, timeout);
    
    if (jobId) {
      logger.info(`Job ${jobId} moved from queue to processing`);
    }
    
    return jobId;
  } catch (error) {
    // brPopLPush might not be available in all Redis versions
    // Fall back to separate operations
    logger.warn('BRPOPLPUSH not available, using fallback');
    const jobId = await dequeueJob(timeout);
    if (jobId) {
      await moveToProcessing(jobId);
    }
    return jobId;
  }
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue statistics
 */
async function getQueueStats() {
  try {
    const [queueLength, processingLength] = await Promise.all([
      getQueueLength(),
      getProcessingJobs().then(jobs => jobs.length),
    ]);

    return {
      pending: queueLength,
      processing: processingLength,
      total: queueLength + processingLength,
    };
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    throw error;
  }
}

module.exports = {
  enqueueJob,
  dequeueJob,
  dequeueJobNonBlocking,
  getQueueLength,
  peekQueue,
  removeFromQueue,
  clearQueue,
  moveToProcessing,
  removeFromProcessing,
  getProcessingJobs,
  dequeueToProcessing,
  getQueueStats,
};
