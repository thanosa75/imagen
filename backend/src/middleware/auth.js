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
