const axios = require('axios');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Send internal notification to other microservices
 */
const notifyService = async (serviceUrl, data) => {
  try {
    const response = await axios.post(serviceUrl, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
      },
      timeout: 5000, // 5 second timeout
    });
    
    return response.data;
  } catch (error) {
    // Log the error but don't stop execution
    logger.error(`Service notification error: ${error.message}`, { 
      serviceUrl,
      error: error.response ? error.response.data : error.message,
      status: error.response ? error.response.status : 'No response'
    });
    
    // Return false to indicate failure but don't throw
    return {
      success: false,
      error: error.response ? error.response.data : error.message
    };
  }
};

/**
 * Send email notification to user about payment/refund
 */
const sendPaymentEmail = async (email, templateType, data) => {
  try {
    const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5003/api/notifications/email';
    
    const emailData = {
      to: email,
      templateType,
      data
    };
    
    const response = await axios.post(notificationServiceUrl, emailData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
      },
      timeout: 5000,
    });
    
    return response.data;
  } catch (error) {
    logger.error(`Email notification error: ${error.message}`, { 
      email, 
      templateType,
      error: error.response ? error.response.data : error.message 
    });
    
    // Return false but don't throw
    return {
      success: false,
      error: error.response ? error.response.data : error.message
    };
  }
};

/**
 * Notify user about successful payment
 */
const notifyPaymentSuccess = async (user, paymentDetails) => {
  return sendPaymentEmail(user.email, 'PAYMENT_SUCCESS', {
    userName: user.name,
    amount: paymentDetails.amount,
    courseName: paymentDetails.description || 'course',
    transactionId: paymentDetails.transactionId,
    date: new Date().toLocaleDateString(),
  });
};

/**
 * Notify user about successful refund
 */
const notifyRefundSuccess = async (user, refundDetails) => {
  return sendPaymentEmail(user.email, 'REFUND_SUCCESS', {
    userName: user.name,
    amount: refundDetails.amount,
    courseName: refundDetails.description || 'course',
    transactionId: refundDetails.transactionId,
    date: new Date().toLocaleDateString(),
  });
};

/**
 * Notify educator about new sale
 */
const notifyEducatorSale = async (educatorEmail, saleDetails) => {
  return sendPaymentEmail(educatorEmail, 'NEW_SALE', {
    amount: saleDetails.amount,
    earnings: saleDetails.educatorEarnings,
    courseName: saleDetails.description || 'your course',
    date: new Date().toLocaleDateString(),
  });
};

/**
 * Send notification about failed payment (internal system monitoring)
 */
const notifyPaymentFailure = async (paymentDetails, error) => {
  const monitoringUrl = process.env.MONITORING_SERVICE_URL || 'http://localhost:5100/api/monitoring/alert';
  
  return notifyService(monitoringUrl, {
    alertType: 'PAYMENT_FAILURE',
    severity: 'HIGH',
    message: `Payment processing failed: ${error.message}`,
    details: {
      userId: paymentDetails.userId,
      amount: paymentDetails.amount,
      courseId: paymentDetails.courseId,
      error: error.message,
      stack: error.stack,
    }
  });
};

module.exports = {
  notifyService,
  sendPaymentEmail,
  notifyPaymentSuccess,
  notifyRefundSuccess,
  notifyEducatorSale,
  notifyPaymentFailure,
};
