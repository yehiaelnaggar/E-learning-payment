const axios = require('axios');
const { logger } = require('./logger');

/**
 * Send notification to user service
 */
const notifyUserService = async (data) => {
  try {
    if (!process.env.USER_SERVICE_URL) {
      logger.warn('USER_SERVICE_URL not set. Notification not sent.');
      return;
    }
    
    await axios.post(`${process.env.USER_SERVICE_URL}/api/notifications`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.INTERNAL_API_KEY
      }
    });
    
    logger.info(`User service notified: ${data.action} for user ${data.userId}`);
  } catch (error) {
    logger.error(`Failed to notify user service: ${error.message}`, { 
      error, 
      data 
    });
    // Fail silently - don't break the main flow
  }
};

/**
 * Send notification to course service
 */
const notifyCourseService = async (data) => {
  try {
    if (!process.env.COURSE_SERVICE_URL) {
      logger.warn('COURSE_SERVICE_URL not set. Notification not sent.');
      return;
    }
    
    await axios.post(`${process.env.COURSE_SERVICE_URL}/api/notifications`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.INTERNAL_API_KEY
      }
    });
    
    logger.info(`Course service notified: ${data.action} for course ${data.courseId}`);
  } catch (error) {
    logger.error(`Failed to notify course service: ${error.message}`, { 
      error, 
      data 
    });
    // Fail silently - don't break the main flow
  }
};

/**
 * Send notification to educator dashboard
 */
const notifyEducatorDashboard = async (data) => {
  try {
    if (!process.env.EDUCATOR_DASHBOARD_URL) {
      logger.warn('EDUCATOR_DASHBOARD_URL not set. Notification not sent.');
      return;
    }
    
    await axios.post(`${process.env.EDUCATOR_DASHBOARD_URL}/api/notifications`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.INTERNAL_API_KEY
      }
    });
    
    logger.info(`Educator dashboard notified: ${data.action} for educator ${data.educatorId}`);
  } catch (error) {
    logger.error(`Failed to notify educator dashboard: ${error.message}`, { 
      error, 
      data 
    });
    // Fail silently - don't break the main flow
  }
};

module.exports = {
  notifyUserService,
  notifyCourseService,
  notifyEducatorDashboard
};
