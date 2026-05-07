const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  // Generate Request ID
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Attach context-aware logger to request
  req.log = logger.child({ requestId });

  // Log Request Start
  req.log.info(`Incoming ${req.method} ${req.originalUrl}`);

  // Log Request Completion
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    req.log.info(`Completed ${req.method} ${req.originalUrl} ${res.statusCode} in ${duration}ms`);
  });

  next();
};

module.exports = requestLogger;
