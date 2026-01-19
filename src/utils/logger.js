const winston = require('winston');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Determine log level from environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
};

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, requestId, jobId, ...meta } = info;
      
      let correlationId = '';
      if (requestId) correlationId += ` [ReqID:${requestId}]`;
      if (jobId) correlationId += ` [JobID:${jobId}]`;

      let msg = `${timestamp} [${level}]${correlationId}: ${message}`;
      
      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        // Filter out empty objects and internal winston properties
        const filteredMeta = Object.keys(meta)
          .filter(key => !['Symbol(level)', 'Symbol(message)', 'Symbol(splat)'].includes(key))
          .reduce((obj, key) => {
            obj[key] = meta[key];
            return obj;
          }, {});
        
        if (Object.keys(filteredMeta).length > 0) {
          msg += ` ${JSON.stringify(filteredMeta)}`;
        }
      }
      
      return msg;
    }
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? format : consoleFormat,
  }),
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format,
    }),
    // Combined log file
    new winston.transports.File({
      filename: 'logs/combined.log',
      format,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled rejections
if (process.env.NODE_ENV === 'production') {
  logger.exceptions.handle(
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  );
  
  logger.rejections.handle(
    new winston.transports.File({ filename: 'logs/rejections.log' })
  );
}

// Create a stream object for Morgan HTTP logger integration
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

module.exports = logger;
