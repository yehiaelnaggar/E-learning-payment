const axios = require('axios');
const { logger } = require('./logger');

/**
 * Notify user service about payment events
 */
const notifyUserService = async (data) => {
  try {
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:5001';
    const response = await axios.post(`${userServiceUrl}/api/internal/enrollment`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
      },
      timeout: 5000,
    });
    
    logger.info(`User service notified successfully: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to notify user service: ${error.message}`, {
      error: error.response ? error.response.data : error.message,
    });
    
    // Return the error but don't throw, as this shouldn't stop the payment process
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
    };
  }
};

/**
 * Notify course service about payment events
 */
const notifyCourseService = async (data) => {
  try {
    const courseServiceUrl = process.env.COURSE_SERVICE_URL || 'http://localhost:5000';
    const response = await axios.post(`${courseServiceUrl}/api/internal/purchase`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
      },
      timeout: 5000,
    });
    
    logger.info(`Course service notified successfully: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to notify course service: ${error.message}`, {
      error: error.response ? error.response.data : error.message,
    });
    
    // Return the error but don't throw, as this shouldn't stop the payment process
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
    };
  }
};

/**
 * Notify notification service to send email
 */
const notifyEmailService = async (emailData) => {
  try {
    const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5003';
    const response = await axios.post(`${notificationServiceUrl}/api/notifications/email`, emailData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
      },
      timeout: 5000,
    });
    
    logger.info(`Email notification sent successfully`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to send email notification: ${error.message}`, {
      error: error.response ? error.response.data : error.message,
    });
    
    // Return the error but don't throw
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
    };
  }
};

module.exports = {
  notifyUserService,
  notifyCourseService,
  notifyEmailService,
};
