const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // Set API version for consistency
  timeout: 30000, // 30 seconds timeout
  maxNetworkRetries: 2, // Automatically retry failed requests
});
const { logger } = require('../utils/logger');

// Configure Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn('STRIPE_SECRET_KEY is not set. Stripe payments will not work correctly.');
}

module.exports = stripe;
