const express = require('express');
const router = express.Router();
const paymentRoutes = require('./paymentRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const reportRoutes = require('./reportRoutes');
const statisticsRoutes = require('./statisticsRoutes');
const payoutRoutes = require('./payoutRoutes');

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'payment-service' });
});

// Mount routes
router.use('/payments', paymentRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/reports', reportRoutes);
router.use('/statistics', statisticsRoutes);
router.use('/payouts', payoutRoutes);

module.exports = router;
