require('dotenv').config();
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { validateToken, requireRole,mockEducatorAuthMiddleware } = require('../middleware/auth');

/**
 * @route   GET /api/reports/financial
 * @desc    Generate financial report with optional filters
 * @access  Admin and Educators (with restrictions)
 */
router.get(
  '/financial',
  mockEducatorAuthMiddleware,
  requireRole('ADMIN', 'EDUCATOR'),
  reportController.generateFinancialReport
);

/**
 * @route   GET /api/reports/financial/pdf
 * @desc    Generate and download financial report as PDF with optional filters
 * @access  Admin and Educators (with restrictions)
 */
router.get(
  '/financial/pdf',
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware : validateToken,
  requireRole('ADMIN', 'EDUCATOR'),
  reportController.downloadFinancialReportPDF
);

/**
 * @route   GET /api/reports/educators/:educatorId/earnings
 * @desc    Get earnings report for a specific educator
 * @access  Admin and the specific Educator
 */
router.get(
  '/educators/:educatorId/earnings',
  process.env.NODE_ENV === "development"
  ? mockEducatorAuthMiddleware : validateToken,
  reportController.getEducatorEarningsReport
);

/**
 * @route   GET /api/reports/commission-analysis
 * @desc    Get commission analysis report
 * @access  Admin can view all, Educators can view their own
 */
router.get(
  '/commission-analysis',
  process.env.NODE_ENV === "development"
  ? mockEducatorAuthMiddleware : validateToken,
  reportController.getCommissionAnalysisReport
);

module.exports = router;
