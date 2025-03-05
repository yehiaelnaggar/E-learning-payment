const stripe = require('../config/stripe');
const prisma = require('../config/db');
const { logger, auditLogger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { notifyUserService, notifyCourseService } = require('../utils/serviceNotifier');
const invoiceService = require('./invoiceService');

const PLATFORM_COMMISSION_PERCENTAGE = parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 20;

/**
 * Process a payment for a course purchase
 */
const processPayment = async (paymentData, user) => {
  const { courseId, amount, currency = 'USD', source, description } = paymentData;
  
  try {
    // 1. Create Stripe charge
    const stripeCharge = await stripe.charges.create({
      amount: Math.round(amount * 100), // Stripe requires cents
      currency,
      source,
      description,
      metadata: {
        courseId,
        userId: user.id,
      },
    });

    // 2. Calculate the revenue split
    const platformCommission = (amount * PLATFORM_COMMISSION_PERCENTAGE) / 100;
    const educatorEarnings = amount - platformCommission;

    // 3. Record the transaction
    const transaction = await prisma.transaction.create({
      data: {
        stripeChargeId: stripeCharge.id,
        amount,
        currency,
        status: 'COMPLETED',
        type: 'PAYMENT',
        platformCommission,
        educatorEarnings,
        userId: user.id,
        courseId,
        educatorId: paymentData.educatorId,
        description,
        metadata: {
          stripePaymentId: stripeCharge.id,
          paymentMethod: stripeCharge.payment_method_details?.type || 'card',
          last4: stripeCharge.payment_method_details?.card?.last4 || null,
        },
      },
    });

    // 4. Create an invoice
    const invoice = await invoiceService.createInvoice({
      transactionId: transaction.id,
      subtotal: amount,
      total: amount,
      status: 'PAID',
      paidAt: new Date(),
      billingInfo: {
        name: user.name,
        email: user.email,
      },
      notes: `Payment for course: ${description}`,
    });

    // 5. Update user enrollment status
    await notifyUserService({
      userId: user.id,
      action: 'ENROLL_USER',
      courseId,
      transactionId: transaction.id
    });

    // 6. Update course purchase stats
    await notifyCourseService({
      courseId,
      action: 'RECORD_PURCHASE',
      userId: user.id,
      amount,
      educatorEarnings
    });

    // 7. Log the audit
    auditLogger.log(
      'PAYMENT_PROCESSED',
      user.id,
      `Payment of ${amount} ${currency} processed for course ${courseId}`,
      transaction.id,
      { stripeChargeId: stripeCharge.id }
    );

    return {
      transaction,
      invoice,
      success: true,
    };
  } catch (error) {
    logger.error(`Payment processing error: ${error.message}`, { error });
    
    // Record failed transaction if we have enough information
    if (courseId && amount && user?.id) {
      await prisma.transaction.create({
        data: {
          amount,
          currency,
          status: 'FAILED',
          type: 'PAYMENT',
          platformCommission: 0,
          educatorEarnings: 0,
          userId: user.id,
          courseId,
          educatorId: paymentData.educatorId,
          description: description || 'Failed payment',
          metadata: { error: error.message },
        },
      });

      auditLogger.log(
        'PAYMENT_FAILED',
        user.id,
        `Payment of ${amount} ${currency} failed for course ${courseId}`,
        null,
        { error: error.message }
      );
    }

    throw new AppError('Payment processing failed: ' + error.message, 400);
  }
};

/**
 * Process a refund
 */
const processRefund = async (refundData, user) => {
  const { transactionId, amount, reason } = refundData;
  
  try {
    // 1. Find the original transaction
    const originalTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!originalTransaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (originalTransaction.status === 'REFUNDED') {
      throw new AppError('Transaction already refunded', 400);
    }

    // 2. Process the refund with Stripe
    const refundAmount = amount || originalTransaction.amount;
    const stripeRefund = await stripe.refunds.create({
      charge: originalTransaction.stripeChargeId,
      amount: Math.round(refundAmount * 100),
      reason: reason || 'requested_by_customer',
    });

    // 3. Calculate updated commission and earnings
    const refundRatio = refundAmount / originalTransaction.amount;
    const refundedCommission = originalTransaction.platformCommission * refundRatio;
    const refundedEarnings = originalTransaction.educatorEarnings * refundRatio;

    // 4. Create a refund transaction record
    const refundTransaction = await prisma.transaction.create({
      data: {
        stripeChargeId: stripeRefund.id,
        amount: refundAmount,
        currency: originalTransaction.currency,
        status: 'COMPLETED',
        type: 'REFUND',
        platformCommission: -refundedCommission,
        educatorEarnings: -refundedEarnings,
        userId: originalTransaction.userId,
        courseId: originalTransaction.courseId,
        educatorId: originalTransaction.educatorId,
        description: `Refund for transaction ${originalTransaction.id}`,
        metadata: {
          originalTransactionId: originalTransaction.id,
          reason,
          refundedBy: user.id,
        },
      },
    });

    // 5. Update original transaction
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'REFUNDED',
        refundId: refundTransaction.id,
      },
    });

    // 6. Update the invoice
    await invoiceService.updateInvoiceStatus(
      originalTransaction.id,
      'CANCELLED',
      `Refunded on ${new Date().toISOString().split('T')[0]}`
    );

    // 7. Notify other services
    await notifyUserService({
      userId: originalTransaction.userId,
      action: 'REMOVE_ENROLLMENT',
      courseId: originalTransaction.courseId,
      transactionId: refundTransaction.id
    });

    await notifyCourseService({
      courseId: originalTransaction.courseId,
      action: 'RECORD_REFUND',
      userId: originalTransaction.userId,
      amount: refundAmount,
      educatorEarnings: -refundedEarnings
    });

    // 8. Log the audit
    auditLogger.log(
      'REFUND_PROCESSED',
      user.id,
      `Refund of ${refundAmount} ${originalTransaction.currency} processed for transaction ${originalTransaction.id}`,
      refundTransaction.id,
      { originalTransactionId: originalTransaction.id, reason }
    );

    return {
      originalTransaction,
      refundTransaction,
      success: true,
    };
  } catch (error) {
    logger.error(`Refund processing error: ${error.message}`, { error });
    throw new AppError('Refund processing failed: ' + error.message, 400);
  }
};

/**
 * Get transaction by ID
 */
const getTransactionById = async (transactionId) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        invoice: true,
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    return transaction;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Error retrieving transaction: ${error.message}`, 500);
  }
};

/**
 * Get transactions by user ID
 */
const getTransactionsByUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      include: {
        invoice: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    const totalCount = await prisma.transaction.count({
      where: { userId },
    });

    return {
      transactions,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    throw new AppError(`Error retrieving transactions: ${error.message}`, 500);
  }
};

/**
 * Get transactions for reporting
 */
const getTransactionsReport = async (filters = {}, page = 1, limit = 50) => {
  const { startDate, endDate, type, status, educatorId } = filters;
  const skip = (page - 1) * limit;

  // Build where clause based on filters
  const where = {};
  
  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  } else if (startDate) {
    where.createdAt = { gte: new Date(startDate) };
  } else if (endDate) {
    where.createdAt = { lte: new Date(endDate) };
  }

  if (type) where.type = type;
  if (status) where.status = status;
  if (educatorId) where.educatorId = educatorId;

  try {
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    const totalCount = await prisma.transaction.count({ where });

    // Calculate summary stats with fix for proper column names and SQL injection protection
    const summary = await prisma.$queryRaw`
      SELECT 
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "totalRevenue",
        COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "totalRefunded",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END), 0) as "totalCommission",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END), 0) as "totalEducatorEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "successfulPayments",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "successfulRefunds"
      FROM "Transaction"
      ${Object.keys(where).length > 0 ? prisma.sql`WHERE ${prisma.sql(where)}` : prisma.sql``}
    `;

    return {
      transactions,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
      summary: summary[0],
    };
  } catch (error) {
    throw new AppError(`Error generating report: ${error.message}`, 500);
  }
};

module.exports = {
  processPayment,
  processRefund,
  getTransactionById,
  getTransactionsByUser,
  getTransactionsReport,
};
