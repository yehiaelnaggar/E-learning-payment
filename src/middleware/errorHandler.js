const { logger } = require('../utils/logger');

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, meta = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.meta = meta;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Default error status and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorDetails = {};
  
  // Log the error
  if (statusCode >= 500) {
    // Log server errors with full stack trace
    logger.error(`${statusCode} - ${message}`, { 
      error: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query
    });
  } else {
    // Log client errors (4xx) with less detail
    logger.warn(`${statusCode} - ${message}`, { 
      path: req.path,
      method: req.method,
      params: req.params
    });
  }
  
  // Handle different types of errors
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = 'Validation Error';
    errorDetails = err.errors;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized: Invalid or expired token';
  } else if (err.name === 'PrismaClientKnownRequestError') {
    // Handle Prisma errors
    statusCode = 400;
    
    // P2002 is a unique constraint violation
    if (err.code === 'P2002') {
      message = `Duplicate entry for ${err.meta.target.join(', ')}`;
    } else if (err.code === 'P2025') {
      // P2025 is a record not found error
      statusCode = 404;
      message = 'Record not found';
    }
    
    errorDetails = { prismaCode: err.code };
  } else if (err.isOperational) {
    // Our custom AppError
    errorDetails = err.meta;
  }
  
  // Don't expose stack traces in production
  const error = process.env.NODE_ENV === 'production'
    ? { message, ...errorDetails }
    : { message, ...errorDetails, stack: err.stack };
  
  // Send the error response
  res.status(statusCode).json({
    success: false,
    message: error.message, 
  });
};

module.exports = { 
  AppError,
  errorHandler
};
