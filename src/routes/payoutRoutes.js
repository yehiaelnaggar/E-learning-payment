require("dotenv").config();
const express = require("express");
const router = express.Router();
const payoutController = require("../controllers/payoutController");
const { validate } = require("../middleware/validators");
const {
  validateToken,
  requireRole,
  mockEducatorAuthMiddleware,
} = require("../middleware/auth");

const payoutSchema = {
  amount: {
    type: "number",
    positive: true,
    required: true,
    errorMessage: "Valid payout amount is required",
  },
  paymentMethod: {
    type: "string",
    required: true,
    errorMessage: "Payment method is required",
  },
  bankDetails: {
    type: "object",
    optional: true,
  },
  description: {
    type: "string",
    optional: true,
    maxLength: 500,
  },
  periodStart: {
    type: "date",
    required: true,
    errorMessage: "Valid period start date is required",
  },
  periodEnd: {
    type: "date",
    required: true,
    errorMessage: "Valid period end date is required",
  },
  notes: {
    type: "string",
    optional: true,
    maxLength: 1000,
  },
};

// example of payout request json
//  { "amount": 100, "paymentMethod": "bank", "bankDetails": { "accountNumber": "1234567890", "routingNumber": "1234567890" }, "description": "Payout for the month of January", "periodStart": "2022-01-01", "periodEnd": "2022-01-31", "notes": "Please process this payout as soon as possible" }
/**
 * @route   GET /api/payouts/educators/:educatorId/pending
 * @desc    Get pending earnings for an educator
 * @access  Educator or Admin
 */
router.get(
  "/educators/:educatorId/pending",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  payoutController.getEducatorPendingEarnings
);

/**
 * @route   POST /api/payouts/educators/:educatorId/request
 * @desc    Request a payout
 * @access  Educator only
 */
router.post(
  "/educators/:educatorId/request",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  validate(payoutSchema),
  payoutController.requestPayout
);

/**
 * @route   GET /api/payouts/educators/:educatorId
 * @desc    Get educator's payouts
 * @access  Educator or Admin
 */
router.get(
  "/educators/:educatorId",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  payoutController.getEducatorPayouts
);

/**
 * @route   GET /api/payouts/:payoutId
 * @desc    Get payout by ID
 * @access  Educator (own payout) or Admin
 */
router.get(
  "/:payoutId",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  payoutController.getPayoutById
);

/**
 * @route   POST /api/payouts/:payoutId/process
 * @desc    Process a pending payout
 * @access  Admin only
 */
router.post(
  "/:payoutId/process",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  payoutController.processPayout
);

/**
 * @route   POST /api/payouts/:payoutId/cancel
 * @desc    Cancel a pending payout
 * @access  Educator (own payout) or Admin
 */
router.post(
  "/:payoutId/cancel",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  payoutController.cancelPayout
);

/**
 * @route   GET /api/payouts
 * @desc    Get all payouts
 * @access  Admin only
 */
router.get(
  "/",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  payoutController.getAllPayouts
);

router.post(
  "/create-account",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  payoutController.createEducatorAccount
);


router.delete(
  "/delete-account",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  payoutController.deleteEducatorAccount
);

// req example for create account { "email": "example@gmail.com"}

module.exports = router;
