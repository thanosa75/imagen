const redis = require('redis');
const logger = require('../utils/logger');

let client = null;

/**
 * Parse Redis URL or use individual host/port configuration
 * @returns {Object} Redis configuration object
 */
function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    // Parse REDIS_URL (e.g., redis://redis:6379 or redis://:password@redis:6379/0)
    logger.info(`Using REDIS_URL: ${redisUrl}`);
    
    try {
      const url = new URL(redisUrl);
      const config = {
        socket: {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection limit exceeded');
            }
            const delay = Math.min(retries * 100, 3000);
            logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
        },
      };
      
      // Extract password if present
      if (url.password) {
        config.password = url.password;
      }
      
      // Extract database number if present in pathname
      if (url.pathname && url.pathname.length > 1) {
        const dbNum = parseInt(url.pathname.substring(1), 10);
        if (!isNaN(dbNum)) {
          config.database = dbNum;
        }
      }
      
      return config;
    } catch (error) {
      logger.error('Failed to parse REDIS_URL, falling back to REDIS_HOST/PORT:', error);
    }
  }
  
  // Fallback to individual environment variables
  const config = {
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis reconnection failed after 10 attempts');
          return new Error('Redis reconnection limit exceeded');
        }
        const delay = Math.min(retries * 100, 3000);
        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
    },
    database: parseInt(process.env.REDIS_DB || '0', 10),
  };

  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }
  
  return config;
}

/**
 * Initialize Redis client connection with retry logic
 * @returns {Promise<RedisClientType>} Connected Redis client
 */
async function initRedis() {
  if (client) {
    return client;
  }

  const redisConfig = getRedisConfig();
  
  logger.info(`Connecting to Redis at ${redisConfig.socket.host}:${redisConfig.socket.port}`);

  client = redis.createClient(redisConfig);

  client.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  client.on('connect', () => {
    logger.info('Redis client connecting...');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting...');
  });

  client.on('end', () => {
    logger.info('Redis client connection closed');
  });

  // Retry logic for initial connection
  const maxRetries = 10;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      await client.connect();
      logger.info(`Redis connected to ${redisConfig.socket.host}:${redisConfig.socket.port}`);
      return client;
    } catch (error) {
      retryCount++;
      
      if (retryCount >= maxRetries) {
        logger.error(`Failed to connect to Redis after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      const delay = Math.min(retryCount * 1000, 5000);
      logger.warn(`Redis connection attempt ${retryCount} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return client;
}

/**
 * Get the Redis client instance
 * @returns {RedisClientType} Redis client
 * @throws {Error} If Redis is not initialized
 */
function getRedisClient() {
  if (!client) {
    initRedis();
    //throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return client;
}

/**
 * Close Redis connection gracefully
 * @returns {Promise<void>}
 */
async function closeRedis() {
  if (client) {
    logger.info('Closing Redis connection...');
    await client.quit();
    client = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Check if Redis is connected
 * @returns {boolean} Connection status
 */
function isConnected() {
  return client && client.isOpen;
}

module.exports = {
  initRedis,
  getRedisClient,
  closeRedis,
  isConnected,
};
