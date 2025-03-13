const winston = require('winston');
const path = require('path');
const fs = require('fs');

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
const baseLogger = winston.createLogger({
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
    baseLogger.http(message.trim());
  },
};

// If in production, don't log to console
if (process.env.NODE_ENV === 'production') {
  baseLogger.remove(winston.transports.Console);
  baseLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }));
}

module.exports = baseLogger;
