const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Create logs directory if it doesn't exist
const logDirectory = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'payment-service' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, service }) =>
            `${timestamp} [${service}] ${level}: ${message}`
        )
      ),
    }),
    // Write all logs with level info and below to combined.log
    new winston.transports.File({ filename: path.join(logDirectory, 'combined.log') }),
    // Write all logs with level error and below to error.log
    new winston.transports.File({ 
      filename: path.join(logDirectory, 'error.log'),
      level: 'error'
    }),
  ],
});

// Create a stream for Morgan HTTP request logging
const stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Specialized audit logger for payment-related activities
const auditLogger = {
  async log(action, userId, description, resourceId = null, metadata = {}) {
    try {
      // Create audit log entry in database if prisma is available
      // This is wrapped in try/catch because it might be called before prisma is initialized
      try {
        const prisma = require('../config/db');
        await prisma.auditLog.create({
          data: {
            action,
            userId,
            description,
            resourceId,
            metadata,
          },
        });
      } catch (dbError) {
        logger.error(`Failed to save audit log to database: ${dbError.message}`);
      }
      
      // Also log to Winston for visibility in log files
      logger.info(`AUDIT: ${action} by user ${userId}: ${description}`, { 
        audit: true, 
        userId, 
        resourceId,
        metadata
      });
    } catch (error) {
      logger.error(`Failed to create audit log: ${error.message}`, { error });
    }
  },
  
  // Generate a transaction ID for request tracking
  generateTransactionId() {
    return uuidv4();
  }
};

// If in production, don't log to console
if (process.env.NODE_ENV === 'production') {
  logger.remove(winston.transports.Console);
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }));
}

module.exports = {
  logger,
  auditLogger,
  stream,
};
