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
