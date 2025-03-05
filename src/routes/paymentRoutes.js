const express = require('express');
const router = express.Router();
const { validateToken, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const paymentController = require('../controllers/paymentController');

// Schema validation for payment requests
const paymentSchema = {
  courseId: { type: 'string', required: true },
  amount: { type: 'number', required: true, min: 0.01 },
  currency: { type: 'string', required: true, enum: ['USD', 'EUR', 'GBP'] },
  source: { type: 'string', required: true },
  educatorId: { type: 'string', required: true },
  description: { type: 'string', required: false }
};

// Schema validation for refund requests
const refundSchema = {
  transactionId: { type: 'string', required: true },
  reason: { type: 'string', required: false }
};

// Process payment
router.post('/', validateToken, validate(paymentSchema), paymentController.processPayment);

// Process refund
router.post('/refund', validateToken, validate(refundSchema), paymentController.processRefund);

// Get user transactions
router.get('/user', validateToken, paymentController.getUserTransactions);

// Get transaction by ID
router.get('/:transactionId', validateToken, paymentController.getTransactionById);

// Generate transaction report (admin only)
router.get('/report/transactions', validateToken, requireRole('ADMIN'), paymentController.generateTransactionReport);

module.exports = router;
