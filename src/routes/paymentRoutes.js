const express = require("express");
const router = express.Router();
const {
  mockAuthMiddleware,
  requireRole,
} = require("../middleware/auth");
const { validate } = require("../middleware/validators");
const paymentController = require("../controllers/paymentController");
const app = require("..");

// Schema validation for payment requests
const paymentSchema = {
  courseId: { type: "string", required: true },
  amount: { type: "number", required: true, min: 0.01 },
  currency: { type: "string", required: true, enum: ["USD", "EUR", "GBP"] },
  source: { type: "string", required: true },
  educatorId: { type: "string", required: true },
  description: { type: "string", required: false },
};

// request json example

// Schema validation for refund requests
const refundSchema = {
  transactionId: { type: "string", required: true },
  reason: { type: "string", required: false },
};



// Process payment
router.post(
  "/",
  mockAuthMiddleware(),
  validate(paymentSchema),
  paymentController.processPayment
);

// Process refund
router.post(
  "/refund",
  mockAuthMiddleware(),
  validate(refundSchema),
  paymentController.processRefund
);
// refund json example 

// Get user transactions
router.get("/user", mockAuthMiddleware(), paymentController.getUserTransactions);

// Get transaction by ID
router.get(
  "/:transactionId",
  mockAuthMiddleware(),
  paymentController.getTransactionById
);

// Generate transaction report (admin only)
router.get(
  "/report/transactions",
  mockAuthMiddleware(),
  requireRole("ADMIN"),
  paymentController.generateTransactionReport
);

module.exports = router;
