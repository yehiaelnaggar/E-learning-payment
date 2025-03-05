const axios = require('axios');
const { logger } = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * Validate the authentication token
 */
const validateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token is missing', 401);
    }

    const token = authHeader.split(' ')[1];
    
    // Typically, we would validate the token against the user service
    try {
      const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:5001';
      const response = await axios.post(`${userServiceUrl}/api/auth/validate`, { token }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
        },
        timeout: 5000,
      });
      
      if (!response.data.valid) {
        throw new AppError('Invalid or expired token', 401);
      }
      
      // Attach user info to request
      req.user = response.data.user;
      next();
    } catch (axiosError) {
      // Handle network errors or service unavailable scenarios
      if (!axiosError.response) {
        logger.error(`Auth service unavailable: ${axiosError.message}`);
        return next(new AppError('Authentication service unavailable', 503));
      }
      
      // Handle error response from auth service
      logger.error(`Auth validation error: ${axiosError.response.data?.message || axiosError.message}`);
      return next(new AppError('Authentication failed', axiosError.response.status || 401));
    }
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      // Network error or internal error
      logger.error(`Auth middleware error: ${error.message}`);
      next(new AppError('Authentication failed due to server issue', 500));
    }
  }
};

/**
 * Check if user has required role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    // Ensure roles is an array
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }
    
    if (!requiredRoles.includes(req.user.role)) {
      return next(new AppError('Access denied: insufficient permissions', 403));
    }
    
    next();
  };
};

/**
 * Create middleware for testing without actual authentication
 */
const mockAuthMiddleware = (role = 'USER') => {
  return (req, res, next) => {
    req.user = {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      role: role,
    };
    next();
  };
};



module.exports = {
  validateToken,
  requireRole,
  mockAuthMiddleware,
};
