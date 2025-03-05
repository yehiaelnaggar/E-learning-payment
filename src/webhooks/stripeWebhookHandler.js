const stripe = require('../config/stripe');
const invoiceService = require('../services/invoiceService');
const { logger, auditLogger } = require('../utils/logger');
const { notifyUserService, notifyCourseService } = require('../utils/serviceNotifier');
const prisma = require('../config/db');

/**
 * Verify the Stripe webhook signature
 */
const verifyStripeSignature = (rawBody, signature) => {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      logger.error('Missing Stripe webhook secret. Cannot verify webhook signatures.');
      return { verified: false, error: 'Missing webhook secret' };
    }
    
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
    
    return { verified: true, event };
  } catch (error) {
    return { verified: false, error: error.message };
  }
};

/**
 * Handle payment_intent.succeeded event
 */
const handlePaymentIntentSucceeded = async (event) => {
  const paymentIntent = event.data.object;
  logger.info(`Payment intent succeeded: ${paymentIntent.id}`);
  
  try {
    // Get transaction by Stripe ID
    const transaction = await prisma.transaction.findFirst({
      where: { 
        stripeChargeId: paymentIntent.id,
        // Or the payment intent ID if you store that instead
        // OR metadata.paymentIntentId: paymentIntent.id
      }
    });
    
    // If no transaction found, this might be a duplicate event or
    // the transaction was created through another method
    if (!transaction) {
      logger.warn(`No matching transaction found for payment intent ${paymentIntent.id}`);
      return { success: false, reason: 'Transaction not found' };
    }
    
    // If the transaction is not already marked as completed
    if (transaction.status !== 'COMPLETED') {
      // Update transaction status
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' }
      });
      
      // Update invoice status
      await invoiceService.updateInvoiceStatus(transaction.id, 'PAID');
      
      // Notify other services about successful payment
      await notifyUserService({
        userId: transaction.userId,
        action: 'ENROLL_USER',
        courseId: transaction.courseId,
        transactionId: transaction.id
      });
      
      await notifyCourseService({
        courseId: transaction.courseId,
        action: 'RECORD_PURCHASE',
        userId: transaction.userId,
        amount: transaction.amount,
        educatorEarnings: transaction.educatorEarnings
      });
      
      // Log audit entry
      auditLogger.log(
        'WEBHOOK_PAYMENT_COMPLETED',
        transaction.userId,
        `Payment of ${transaction.amount} ${transaction.currency} completed via webhook for course ${transaction.courseId}`,
        transaction.id,
        { paymentIntentId: paymentIntent.id }
      );
    }
    
    return { success: true, transactionId: transaction.id };
  } catch (error) {
    logger.error(`Error handling payment_intent.succeeded: ${error.message}`, { error });
    return { success: false, error: error.message };
  }
};

/**
 * Handle charge.succeeded event
 */
const handleChargeSucceeded = async (event) => {
  const charge = event.data.object;
  logger.info(`Charge succeeded: ${charge.id}`);
  
  try {
    // Similar to handlePaymentIntentSucceeded but for charges
    const transaction = await prisma.transaction.findFirst({
      where: { stripeChargeId: charge.id }
    });
    
    if (!transaction) {
      logger.warn(`No matching transaction found for charge ${charge.id}`);
      return { success: false, reason: 'Transaction not found' };
    }
    
    // Update if needed
    if (transaction.status !== 'COMPLETED') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' }
      });
      
      // Update invoice and notify services as above
      // ...
    }
    
    return { success: true, transactionId: transaction.id };
  } catch (error) {
    logger.error(`Error handling charge.succeeded: ${error.message}`, { error });
    return { success: false, error: error.message };
  }
};

/**
 * Handle charge.refunded event
 */
const handleChargeRefunded = async (event) => {
  const charge = event.data.object;
  logger.info(`Charge refunded: ${charge.id}`);
  
  try {
    // Find the original transaction
    const originalTransaction = await prisma.transaction.findFirst({
      where: { stripeChargeId: charge.id }
    });
    
    if (!originalTransaction) {
      logger.warn(`No matching transaction found for refunded charge ${charge.id}`);
      return { success: false, reason: 'Transaction not found' };
    }
    
    // If not already refunded
    if (originalTransaction.status !== 'REFUNDED') {
      // Get refund amount from the Stripe event
      const refundAmount = charge.amount_refunded / 100; // Convert from cents
      
      // Calculate refunded earnings and commission
      const refundRatio = refundAmount / originalTransaction.amount;
      const refundedCommission = originalTransaction.platformCommission * refundRatio;
      const refundedEarnings = originalTransaction.educatorEarnings * refundRatio;
      
      // Create refund transaction
      const refundTransaction = await prisma.transaction.create({
        data: {
          stripeChargeId: charge.refunds.data[0].id, // Get first refund ID
          amount: refundAmount,
          currency: originalTransaction.currency,
          status: 'COMPLETED',
          type: 'REFUND',
          platformCommission: -refundedCommission,
          educatorEarnings: -refundedEarnings,
          userId: originalTransaction.userId,
          courseId: originalTransaction.courseId,
          educatorId: originalTransaction.educatorId,
          description: `Refund for transaction ${originalTransaction.id} via webhook`,
          metadata: {
            originalTransactionId: originalTransaction.id,
            refundedBy: 'stripe_webhook',
          },
        },
      });
      
      // Update original transaction
      await prisma.transaction.update({
        where: { id: originalTransaction.id },
        data: { status: 'REFUNDED', refundId: refundTransaction.id }
      });
      
      // Log audit entry
      auditLogger.log(
        'WEBHOOK_REFUND_COMPLETED',
        originalTransaction.userId,
        `Refund of ${refundAmount} ${originalTransaction.currency} completed via webhook for transaction ${originalTransaction.id}`,
        refundTransaction.id,
        { originalTransactionId: originalTransaction.id, refundId: refundTransaction.id }
      );
    }
    
    return { success: true, transactionId: originalTransaction.id };
  } catch (error) {
    logger.error(`Error handling charge.refunded: ${error.message}`, { error });
    return { success: false, error: error.message };
  }
};

/**
 * Handle charge failed event
 */
const handleChargeFailed = async (event) => {
  const charge = event.data.object;
  
  try {
    // Find the transaction by Stripe charge ID
    const transaction = await prisma.transaction.findUnique({
      where: { stripeChargeId: charge.id }
    });
    
    if (!transaction) {
      logger.warn(`No transaction found for Stripe charge ID: ${charge.id}`);
      return;
    }
    
    // Update transaction status to failed
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' }
    });
    
    logger.info(`Transaction ${transaction.id} marked as failed via webhook`);
    
    // Log the audit event
    auditLogger.log(
      'PAYMENT_FAILED_VIA_WEBHOOK',
      'system',
      `Payment of ${transaction.amount} ${transaction.currency} failed via webhook for course ${transaction.courseId}`,
      transaction.id,
      { stripeChargeId: charge.id, failureReason: charge.failure_message }
    );
  } catch (error) {
    logger.error(`Error handling charge.failed webhook: ${error.message}`, { error });
  }
};

/**
 * Handle charge disputed event (chargeback)
 */
const handleChargeDisputed = async (event) => {
  const dispute = event.data.object;
  const charge = dispute.charge;
  
  try {
    // Find the transaction by Stripe charge ID
    const transaction = await prisma.transaction.findUnique({
      where: { stripeChargeId: charge }
    });
    
    if (!transaction) {
      logger.warn(`No transaction found for Stripe charge ID: ${charge}`);
      return;
    }
    
    // Update transaction status to disputed
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'DISPUTED' }
    });
    
    logger.info(`Transaction ${transaction.id} marked as disputed via webhook`);
    
    // Log the audit event
    auditLogger.log(
      'PAYMENT_DISPUTED_VIA_WEBHOOK',
      'system',
      `Payment of ${transaction.amount} ${transaction.currency} disputed via webhook for course ${transaction.courseId}`,
      transaction.id,
      { stripeChargeId: charge, disputeId: dispute.id, reason: dispute.reason }
    );
    
    // Update course stats (decrement sales, revenue) since it's being disputed
    await notifyCourseService({
      courseId: transaction.courseId,
      action: 'RECORD_DISPUTE',
      userId: transaction.userId,
      amount: transaction.amount,
      educatorEarnings: -transaction.educatorEarnings
    });
  } catch (error) {
    logger.error(`Error handling charge.dispute.created webhook: ${error.message}`, { error });
  }
};

/**
 * Handle refund updated event
 */
const handleRefundUpdated = async (event) => {
  const refund = event.data.object;
  
  try {
    // Find the refund transaction by Stripe refund ID
    const refundTransaction = await prisma.transaction.findFirst({
      where: { stripeChargeId: refund.id, type: 'REFUND' }
    });
    
    if (!refundTransaction) {
      logger.warn(`No refund transaction found for Stripe refund ID: ${refund.id}`);
      return;
    }
    
    if (refund.status === 'succeeded' && refundTransaction.status !== 'COMPLETED') {
      // Update refund transaction status to completed
      await prisma.transaction.update({
        where: { id: refundTransaction.id },
        data: { status: 'COMPLETED' }
      });
      
      logger.info(`Refund transaction ${refundTransaction.id} marked as completed via webhook`);
      
      // Log the audit event
      auditLogger.log(
        'REFUND_COMPLETED_VIA_WEBHOOK',
        'system',
        `Refund of ${refundTransaction.amount} ${refundTransaction.currency} completed via webhook`,
        refundTransaction.id,
        { stripeRefundId: refund.id }
      );
    } else if (refund.status === 'failed' && refundTransaction.status !== 'FAILED') {
      // Update refund transaction status to failed
      await prisma.transaction.update({
        where: { id: refundTransaction.id },
        data: { status: 'FAILED' }
      });
      
      logger.info(`Refund transaction ${refundTransaction.id} marked as failed via webhook`);
      
      // Find the original transaction and revert its status from REFUNDED back to COMPLETED
      const originalTransactionId = refundTransaction.metadata?.originalTransactionId;
      if (originalTransactionId) {
        await prisma.transaction.update({
          where: { id: originalTransactionId },
          data: { status: 'COMPLETED', refundId: null }
        });
        
        logger.info(`Original transaction ${originalTransactionId} status reverted to COMPLETED due to failed refund`);
      }
      
      // Log the audit event
      auditLogger.log(
        'REFUND_FAILED_VIA_WEBHOOK',
        'system',
        `Refund of ${refundTransaction.amount} ${refundTransaction.currency} failed via webhook`,
        refundTransaction.id,
        { stripeRefundId: refund.id, failureReason: refund.failure_reason }
      );
    }
  } catch (error) {
    logger.error(`Error handling refund.updated webhook: ${error.message}`, { error });
  }
};

/**
 * Process webhook event
 */
const processWebhookEvent = async (event) => {
  const eventType = event.type;
  
  logger.info(`Processing webhook event: ${eventType}`, { eventId: event.id });
  
  switch (eventType) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event);
      break;
    
    case 'charge.succeeded':
      await handleChargeSucceeded(event);
      break;
    
    case 'charge.failed':
      await handleChargeFailed(event);
      break;
    
    case 'charge.refunded':
      await handleChargeRefunded(event);
      break;
    
    case 'charge.dispute.created':
      await handleChargeDisputed(event);
      break;
    
    case 'refund.updated':
      await handleRefundUpdated(event);
      break;
    
    default:
      logger.info(`Ignoring unhandled webhook event type: ${eventType}`);
  }
};

module.exports = {
  verifyStripeSignature,
  processWebhookEvent,
};
