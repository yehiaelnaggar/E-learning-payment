const express = require('express');
const { param, query } = require('express-validator');
const { validateToken,mockAuthMiddleware, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const invoiceController = require('../controllers/invoiceController');

const router = express.Router();

// Middleware to protect all invoice routes
router.use(validateToken);

// Get user's invoices
router.get(
  '/user',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  ],
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  invoiceController.getUserInvoices
);

// Get specific invoice
router.get(
  '/:invoiceId',
  [
    param('invoiceId').notEmpty().withMessage('Invoice ID is required'),
  ],
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  invoiceController.getInvoice
);

// Download invoice PDF
router.get(
  '/:invoiceId/pdf',
  [
    param('invoiceId').notEmpty().withMessage('Invoice ID is required'),
  ],
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  invoiceController.downloadInvoicePdf
);

// Admin routes
// router.get(
//   '/admin/all',
//   [
//     query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
//     query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
//     query('status').optional().isString().withMessage('Status must be a string'),
//   ],
//   process.env.NODE_ENV === "development"
//     // ? mockAuthMiddleware() : validateToken,
//   requireRole('ADMIN'),
//   invoiceController.getAllInvoices
// );

module.exports = router;
