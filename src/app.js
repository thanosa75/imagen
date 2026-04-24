const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jobRoutes = require('./routes/jobRoutes');
const promptRoutes = require('./routes/promptRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { isConnected } = require('./config/redis');

const app = express();

// Security middleware
app.use(helmet());

// CORS whitelist (CRIT-3)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));

// Body parsing with strict limits (HIGH-3)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Request logging
app.use(requestLogger);

// Rate limiting (CRIT-2)
app.use(rateLimiter);

// Authentication (HIGH-1)
app.use(authMiddleware);

// Swagger Documentation — only in non-production
if (process.env.NODE_ENV !== 'production') {
  app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Health check with Redis verification (bonus robustness)
app.get('/health', async (req, res) => {
  const redisOk = isConnected();
  const statusCode = redisOk ? 200 : 503;
  res.status(statusCode).json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    app: 'imagen'
  });
});

// API Routes
app.use('/jobs', jobRoutes);
app.use('/prompts', promptRoutes); // fixed: now uses dedicated router (CRIT-1)

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
