require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const { initRedis } = require('./config/redis');

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await initRedis();
    logger.info('Redis connected — starting HTTP server');
  } catch (err) {
    logger.error('Failed to connect to Redis, exiting:', err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  module.exports = server;
})();
