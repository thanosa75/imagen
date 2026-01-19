const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jobRoutes = require('./routes/jobRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Swagger Documentation
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/jobs', jobRoutes);
app.use('/prompts', jobRoutes);

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
