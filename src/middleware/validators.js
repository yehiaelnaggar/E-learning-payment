const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');
const { logger } = require('../utils/logger');

// Common validation rules
const paymentValidation = [
  body('courseId')
    .notEmpty().withMessage('Course ID is required')
    .isString().withMessage('Course ID must be a string'),
  
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  
  body('currency')
    .optional()
    .isString().withMessage('Currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  
  body('source')
    .notEmpty().withMessage('Payment source is required')
    .isString().withMessage('Payment source must be a string'),
  
  body('educatorId')
    .notEmpty().withMessage('Educator ID is required')
    .isString().withMessage('Educator ID must be a string'),
];

const refundValidation = [
  body('transactionId')
    .notEmpty().withMessage('Transaction ID is required')
    .isString().withMessage('Transaction ID must be a string'),
  
  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  
  body('reason')
    .optional()
    .isString().withMessage('Reason must be a string')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

const reportFilterValidation = [
  query('startDate')
    .optional()
    .isISO8601().withMessage('Start date must be a valid date'),
  
  query('endDate')
    .optional()
    .isISO8601().withMessage('End date must be a valid date'),
  
  query('type')
    .optional()
    .isIn(['PAYMENT', 'REFUND']).withMessage('Type must be PAYMENT or REFUND'),
  
  query('status')
    .optional()
    .isIn(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'DISPUTED'])
    .withMessage('Invalid status value')
];

// Validate schema middleware (simple version that returns 400 instead of 422)
const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];
    
    // Validate each field in schema
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip validation for undefined optional fields
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      if (rules.type && typeof value !== rules.type) {
        if (rules.type === 'number' && !isNaN(Number(value))) {
          // Convert string numbers to actual numbers
          req.body[field] = Number(value);
        } else if (rules.type === 'boolean' && ['true', 'false'].includes(value)) {
          // Convert string booleans to actual booleans
          req.body[field] = value === 'true';
        } else if (rules.type === 'date') {
          // Date validation is handled separately below
          continue;
        }
        else {
          errors.push(`${field} must be a ${rules.type}`);
        }

      }
      
      // Min/max validation for numbers
      if (typeof value === 'number' || rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${field} must be at most ${rules.max}`);
        }
      }
      
      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      // Length validation for strings
      if (typeof value === 'string' && rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      // positive validation for numbers
      if (rules.positive && value <= 0) {
        errors.push(`${field} must be greater than 0`);
      }

      // Date validation
      if (rules.type === 'date') {
        // If value is already a Date object
        if (value instanceof Date) {
          if (!isNaN(value.getTime())) {
            continue; // Valid Date object, skip further validation
          } else {
            errors.push(`${field} must be a valid date`);
            continue;
          }
        }
        
        try {
          // Try to parse the date
          const dateObj = new Date(value);
          
          // Check if it's a valid date
          if (isNaN(dateObj.getTime())) {
            errors.push(`${field} must be a valid date`);
          } else {
            // Successfully parsed, store the Date object
            req.body[field] = dateObj;
            console.log(1);
          }
        } catch (e) {
          errors.push(`${field} must be a valid date`);
        }
      }

    }
    
    // Return validation errors if any
    if (errors.length > 0) {
      logger.warn(`Validation failed: ${errors.join(', ')}`);
      return res.status(400).json({ // Use 400 instead of 422
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    next();
  };
};

module.exports = {
  paymentValidation,
  refundValidation,
  paginationValidation,
  reportFilterValidation,
  validate
};
