const paymentService = require('../services/paymentService');
const { logger } = require('../utils/logger');

// Process payment
const processPayment = async (req, res) => {
  try {
    console.log(req.body);
    const result = await paymentService.processPayment(req.body, req.user);
    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: result
    });
  } catch (error) {
    logger.error(`Error processing payment: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to process payment',
    });
  }
};

// Process refund
const processRefund = async (req, res) => {
  try {
    const result = await paymentService.processRefund(req.body, req.user);
    
    return res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: result
    });
  } catch (error) {
    logger.error(`Error processing refund: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to process refund',
    });
  }
};

// Get user transactions
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await paymentService.getTransactionsByUser(userId, page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error(`Error fetching user transactions: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch transactions',
    });
  }
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await paymentService.getTransactionById(transactionId);
    
    // Check if user is authorized to view this transaction
    if (req.user.role !== 'ADMIN' && transaction.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this transaction'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error(`Error fetching transaction: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch transaction',
    });
  }
};

// Generate transaction report
const generateTransactionReport = async (req, res) => {
  try {
    // Only admins can access this endpoint
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access reports'
      });
    }
    
    const { startDate, endDate, type, status, educatorId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    
    const filters = {
      startDate,
      endDate,
      type,
      status,
      educatorId
    };
    
    const result = await paymentService.getTransactionsReport(filters, page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.transactions,
      summary: result.summary,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error(`Error generating transaction report: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate report',
    });
  }
};

module.exports = {
  processPayment,
  processRefund,
  getUserTransactions,
  getTransactionById,
  generateTransactionReport
};
