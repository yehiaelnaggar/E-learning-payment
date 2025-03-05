const express = require('express');
const { verifyStripeSignature, processWebhookEvent } = require('../webhooks/stripeWebhookHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Handle Stripe webhooks
router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    logger.warn('Webhook received without Stripe signature');
    return res.status(400).send('Webhook signature missing');
  }
  
  try {
    // Make sure req.rawBody exists
    if (!req.rawBody) {
      logger.warn('Webhook raw body missing - did you set up the express.json middleware correctly?');
      return res.status(400).send('Webhook body missing');
    }
    
    const { verified, event, error } = verifyStripeSignature(req.rawBody, signature);
    
    if (!verified) {
      logger.warn(`Invalid webhook signature: ${error}`);
      return res.status(400).send(`Webhook signature verification failed: ${error}`);
    }
    
    // Process the event asynchronously
    processWebhookEvent(event)
      .catch(error => {
        logger.error(`Error processing webhook event: ${error.message}`, { error });
      });
    
    // Return a 200 response quickly to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`, { error });
    return res.status(500).send('Webhook error');
  }
});

module.exports = router;
