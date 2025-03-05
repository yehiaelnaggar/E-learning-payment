const stripe = require('../config/stripe');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create a payment intent with Stripe
 */
const createPaymentIntent = async (amount, currency = 'USD', metadata = {}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata,
    });
    
    return paymentIntent;
  } catch (error) {
    logger.error(`Error creating payment intent: ${error.message}`, { error });
    throw new AppError(`Payment processing failed: ${error.message}`, 400);
  }
};

/**
 * Create a direct charge with Stripe
 */
const createCharge = async (amount, currency = 'USD', source, description = '', metadata = {}) => {
  try {
    const charge = await stripe.charges.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      source,
      description,
      metadata,
    });
    
    return charge;
  } catch (error) {
    logger.error(`Error creating charge: ${error.message}`, { error });
    throw new AppError(`Payment processing failed: ${error.message}`, 400);
  }
};

/**
 * Process a refund with Stripe
 */
const processRefund = async (chargeId, amount = null, reason = 'requested_by_customer', metadata = {}) => {
  try {
    const refundParams = {
      charge: chargeId,
      reason,
      metadata,
    };
    
    // If amount specified, include it
    if (amount) {
      refundParams.amount = Math.round(amount * 100);
    }
    
    const refund = await stripe.refunds.create(refundParams);
    
    return refund;
  } catch (error) {
    logger.error(`Error processing refund: ${error.message}`, { error });
    throw new AppError(`Refund processing failed: ${error.message}`, 400);
  }
};

/**
 * Retrieve a charge from Stripe
 */
const retrieveCharge = async (chargeId) => {
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return charge;
  } catch (error) {
    logger.error(`Error retrieving charge: ${error.message}`, { error });
    throw new AppError(`Error retrieving charge: ${error.message}`, 400);
  }
};

/**
 * Retrieve a refund from Stripe
 */
const retrieveRefund = async (refundId) => {
  try {
    const refund = await stripe.refunds.retrieve(refundId);
    return refund;
  } catch (error) {
    logger.error(`Error retrieving refund: ${error.message}`, { error });
    throw new AppError(`Error retrieving refund: ${error.message}`, 400);
  }
};

/**
 * Create a checkout session
 */
const createCheckoutSession = async (items, successUrl, cancelUrl, metadata = {}) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
    
    return session;
  } catch (error) {
    logger.error(`Error creating checkout session: ${error.message}`, { error });
    throw new AppError(`Error creating checkout session: ${error.message}`, 400);
  }
};

module.exports = {
  createPaymentIntent,
  createCharge,
  processRefund,
  retrieveCharge,
  retrieveRefund,
  createCheckoutSession,
};
