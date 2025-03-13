const { v4: uuidv4 } = require('uuid');
const baseLogger = require('./baseLogger');

// Reuse the base logger
const logger = baseLogger;

// Create a stream for Morgan HTTP request logging (if needed)
const stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Audit logger to track important actions with lazy DB loading
 * to avoid circular dependency
 */
const auditLogger = {
  /**
   * Log an auditable action
   * @param {string} action - Action being performed (e.g., PAYMENT_PROCESSED)
   * @param {string} actor - User ID or system identifier performing the action
   * @param {string} details - Human-readable description of the action
   * @param {string} transactionId - Related transaction ID (optional)
   * @param {Object} metadata - Additional structured data (optional)
   */
  log: async (action, actor, details, transactionId = null, metadata = null) => {
    try {
      // Log to standard logger first
      logger.info(`AUDIT: ${action} by ${actor} - ${details}`, {
        action,
        actor,
        transactionId,
        metadata
      });
      
      // Lazy-load prisma to avoid circular dependency
      const prisma = require('../config/db');
      
      // Log to database
      await prisma.auditLog.create({
        data: {
          action,
          actor,
          details,
          transactionId,
          metadata,
          ipAddress: metadata?.ipAddress || null,
          userAgent: metadata?.userAgent || null
        }
      });
    } catch (error) {
      logger.error(`Failed to create audit log: ${error.message}`, { error });
    }
  }
};

module.exports = {
  logger,
  auditLogger,
  stream,
};
