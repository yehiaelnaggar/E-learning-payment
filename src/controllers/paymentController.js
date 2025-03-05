const stripe = require('../config/stripe');
const prisma = require('../config/db');
const { logger } = require('../utils/logger');
const { notifyUserService, notifyCourseService } = require('../utils/serviceNotifier');
const invoiceService = require('../services/invoiceService');

// Calculate platform commission (20%)
const calculateCommission = (amount) => {
  const commission = amount * 0.2;
  return {
    commission: parseFloat(commission.toFixed(2)),
    educatorEarnings: parseFloat((amount - commission).toFixed(2))
  };
};

// Process payment
const processPayment = async (req, res) => {
  try {
    const { courseId, amount, currency, source, educatorId, description } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!courseId || !amount || !currency || !source || !educatorId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Convert amount to cents for Stripe
    const amountInCents = Math.round(amount * 100);
    
    // Process payment with Stripe
    const charge = await stripe.charges.create({
      amount: amountInCents,
      currency: currency.toUpperCase(),
      source,
      description,
      metadata: {
        courseId,
        userId
      }
    });
    
    // Calculate platform commission
    const { commission, educatorEarnings } = calculateCommission(amount);
    
    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        stripeChargeId: charge.id,
        amount,
        currency: currency.toUpperCase(),
        status: 'COMPLETED',
        type: 'PAYMENT',
        platformCommission: commission,
        educatorEarnings,
        userId,
        courseId,
        educatorId,
        description,
        paymentMethod: charge.payment_method_details.type,
        last4: charge.payment_method_details.card?.last4
      }
    });
    
    // Create invoice
    const invoice = await invoiceService.createInvoice({
      userId,
      educatorId,
      courseId,
      transactionId: transaction.id,
      amount,
      description,
      status: 'PAID'
    });
    
    // Notify user service about successful purchase
    await notifyUserService({
      userId,
      action: 'COURSE_PURCHASED',
      data: { 
        courseId, 
        transactionId: transaction.id 
      }
    });
    
    // Notify course service about new enrollment
    await notifyCourseService({
      courseId,
      userId,
      action: 'NEW_ENROLLMENT',
      data: { 
        transactionId: transaction.id 
      }
    });
    
    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        transaction,
        invoice,
        charge: {
          id: charge.id,
          status: charge.status
        }
      }
    });
  } catch (error) {
    logger.error(`Error processing payment: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to process payment',
    });
  }
};

// Process refund
const processRefund = async (req, res) => {
  try {
    const { transactionId, reason } = req.body;
    
    // Find the original transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    // Check if refund is within the allowed time window (24 hours)
    const refundTimeLimit = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const currentTime = new Date();
    const transactionTime = new Date(transaction.createdAt);
    const timeDifference = currentTime - transactionTime;

    if (timeDifference > refundTimeLimit) {
      return res.status(400).json({
        success: false,
        message: 'Refund window expired. Refunds are only allowed within 24 hours of purchase.'
      });
    }
    // Check if already refunded
    if (transaction.status === 'REFUNDED') {
      return res.status(400).json({
        success: false,
        message: 'Transaction already refunded'
      });
    }
    
    // Process refund with Stripe
    const refund = await stripe.refunds.create({
      charge: transaction.stripeChargeId,
      reason: reason || 'requested_by_customer'
    });
    
    // Update the original transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'REFUNDED',
        refundId: refund.id,
        updatedAt: new Date()
      }
    });
    
    // Update invoice status
    await invoiceService.updateInvoiceStatus(transactionId, 'CANCELLED');
    
    // Notify services about refund
    await notifyUserService({
      userId: transaction.userId,
      action: 'PAYMENT_REFUNDED',
      data: {
        courseId: transaction.courseId,
        transactionId
      }
    });
    
    await notifyCourseService({
      courseId: transaction.courseId,
      userId: transaction.userId,
      action: 'ENROLLMENT_CANCELLED',
      data: {
        transactionId
      }
    });
    
    return res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        originalTransaction: transaction,
        refundTransaction: updatedTransaction
      }
    });
  } catch (error) {
    logger.error(`Error processing refund: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to process refund',
    });
  }
};

// Get user transactions
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    
    return res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (error) {
    logger.error(`Error fetching user transactions: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
    });
  }
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
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
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
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
    
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get transactions in date range
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Get stats
    const stats = await prisma.$queryRaw`
      SELECT 
        SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) AS totalRevenue,
        SUM(CASE WHEN status = 'REFUNDED' THEN amount ELSE 0 END) AS totalRefunded,
        SUM(CASE WHEN status = 'COMPLETED' THEN platformCommission ELSE 0 END) AS totalCommission,
        SUM(CASE WHEN status = 'COMPLETED' THEN educatorEarnings ELSE 0 END) AS totalEducatorEarnings,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS successfulPayments,
        COUNT(CASE WHEN status = 'REFUNDED' THEN 1 END) AS successfulRefunds
      FROM "Transaction"
      WHERE createdAt BETWEEN ${start} AND ${end}
    `;
    
    return res.status(200).json({
      success: true,
      data: transactions,
      summary: stats[0]
    });
  } catch (error) {
    logger.error(`Error generating transaction report: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate report',
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
