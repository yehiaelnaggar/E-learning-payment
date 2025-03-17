const stripe = require("../config/stripe");
const prisma = require("../config/db");
const { logger, auditLogger } = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");
const {
  notifyUserService,
  notifyCourseService,
} = require("../utils/serviceNotifier");
const invoiceService = require("./invoiceService");
const { application } = require("express");
const app = require("..");

const PLATFORM_COMMISSION_PERCENTAGE =
  parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 20;

/**
 * Process a payment for a course purchase
 */
const processPayment = async (paymentData, user) => {
  const startTime = Date.now();
  const {
    courseId,
    amount,
    currency = "USD",
    source,
    description,
    educatorId,
  } = paymentData;

  try {
    const dublucationCheck = await prisma.transaction.findFirst({
      where: {
        courseId,
        userId: user.id,
        status: "COMPLETED",
      },
    });

    const educatorAccount = await prisma.stripeAccount.findFirst({
      where: {
        educatorId: educatorId,
      },
    });

    if (!educatorAccount) {
      throw new AppError("Error happened", 400);
    }

    if (dublucationCheck) {
      throw new AppError("User already enrolled in this course", 400);
    }
    // 1. Calculate revenue split between platform and educator
    const { platformCommission, educatorEarnings } =
      await calculatePlatformCommission(amount, educatorId);

    logger.info(
      `Payment split: Amount: $${amount}, Platform: $${platformCommission}, Educator: $${educatorEarnings}`
    );

    // 2. Create Stripe charge
    const stripeCharge = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe requires cents
      currency: currency || "USD",
      payment_method: source,
      description: description || `Payment for course: ${courseId}`,
      metadata: {
        courseId,
        userId: user.id,
        educatorId,
      },
      application_fee_amount: platformCommission * 100,
      transfer_data: {
        destination: educatorAccount.stripeAccountId,
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never", // Disable redirect-based payment methods
      },
    });

    await stripe.paymentIntents.confirm(stripeCharge.id);

    // 3. Record the transaction with revenue split details
    const transaction = await prisma.transaction.create({
      data: {
        stripeChargeId: stripeCharge.id,
        amount,
        currency,
        status: "COMPLETED",
        type: "PAYMENT",
        platformCommission,
        educatorEarnings,
        userId: user.id,
        courseId,
        educatorId,
        description,
        metadata: {
          stripePaymentId: stripeCharge.id,
          paymentMethod: stripeCharge.payment_method_details?.type || "card",
          last4: stripeCharge.payment_method_details?.card?.last4 || null,
          processingTime: Date.now() - startTime,
        },
      },
    });

    // 4. Create an invoice
    const invoice = await invoiceService.createInvoice({
      transactionId: transaction.id,
      subtotal: amount,
      total: amount,
      status: "PAID",
      paidAt: new Date(),
      billingInfo: {
        name: user.name,
        email: user.email,
      },
      notes: `Payment for course: ${description}`,
    });

    // 5. Update user enrollment status
    await notifyUserService({
      userId: user.id,
      action: "ENROLL_USER",
      courseId,
      transactionId: transaction.id,
    });

    // 6. Update course purchase stats
    await notifyCourseService({
      courseId,
      action: "RECORD_PURCHASE",
      userId: user.id,
      amount,
      educatorEarnings,
    });

    // Add a notification about new earnings available for payout
    await notifyUserService({
      userId: educatorId,
      action: "NEW_EARNINGS",
      data: {
        courseId,
        transactionId: transaction.id,
        amount: educatorEarnings,
        totalPendingEarnings: getTotalEarningsForEducator(educatorId),
      },
    });

    // 7. Log the audit
    auditLogger.log(
      "PAYMENT_PROCESSED",
      user.id,
      `Payment of ${amount} ${currency} processed for course ${courseId}`,
      transaction.id,
      { stripeChargeId: stripeCharge.id }
    );

    return {
      transaction,
      invoice,
      success: true,
    };
  } catch (error) {
    logger.error(`Payment processing error: ${error.message}`, { error });

    // Record failed transaction if we have enough information
    if (courseId && amount && user?.id) {
      await prisma.transaction.create({
        data: {
          amount,
          currency,
          status: "FAILED",
          type: "PAYMENT",
          platformCommission: 0,
          educatorEarnings: 0,
          userId: user.id,
          courseId,
          educatorId: paymentData.educatorId,
          description: description || "Failed payment",
          metadata: { error: error.message },
        },
      });

      auditLogger.log(
        "PAYMENT_FAILED",
        user.id,
        `Payment of ${amount} ${currency} failed for course ${courseId}`,
        null,
        { error: error.message }
      );
    }

    throw new AppError("Payment processing failed: " + error.message, 400);
  }
};

/**
 * Get total pending earnings for an educator
 * @param {string} educatorId - Educator ID
 * @throws {AppError} If an error occurs while fetching earnings
 * @returns {number} Total earnings for the educator
 */
const getTotalEarningsForEducator = async (educatorId) => {
  try {
    const totalEarnings = await prisma.transaction.aggregate({
      where: {
        educatorId,
        status: { in: ["COMPLETED", "REFUNDED"] },
      },
      _sum: {
        educatorEarnings: true,
      },
    });

    return totalEarnings._sum?.educatorEarnings || 0;
  } catch (error) {
    throw new AppError(`Error fetching total earnings: ${error.message}`, 500);
  }
};

/**
 *
 * @param {string} educatorId
 * @throws {AppError} If an error occurs while fetching earnings
 * @returns {number} Current balance for the educator
 */
const getCurrentBalanceForEducator = async (educatorId) => {
  try {
    const stripeAccount = await prisma.stripeAccount.findFirst({
      where: {
        educatorId,
      },
    });
    const earnings = await stripe.balance.retrieve({
      stripeAccount: stripeAccount.stripeAccountId,
    });

    return earnings.pending[0] ;
  } catch (error) {
    throw AppError(`Error fetching total earnings: ${error.message}`, 500);
  }
};

/**
 * Calculate platform commission based on amount and educator tier
 * @param {number} amount - Payment amount
 * @param {string} educatorId - Educator ID to check for special rates
 * @returns {number} Platform commission amount
 */
const calculatePlatformCommission = async (amount, educatorId) => {
  try {
    // Get educator details to check if they have a custom commission rate
    // This would require a call to a user/educator service or database
    let commissionPercentage = PLATFORM_COMMISSION_PERCENTAGE; // Default percentage

    // Optional: Check if educator has special rate
    // const educator = await getEducatorDetails(educatorId);
    // if (educator && educator.customCommissionRate) {
    //   commissionPercentage = educator.customCommissionRate;
    // }

    // Apply tiered commission structure (optional)
    if (amount >= 500) {
      // Lower commission for high-value courses
      commissionPercentage = PLATFORM_COMMISSION_PERCENTAGE - 5;
    } else if (amount >= 200) {
      // Slightly lower commission for medium-value courses
      commissionPercentage = PLATFORM_COMMISSION_PERCENTAGE - 2;
    }

    // Calculate commission amount

    const stripeFee = 0.3 + 0.029 * amount; // Stripe fee for payment
    const netAmount = amount - stripeFee; // Amount after Stripe fee
    let platformCommission = Math.round(
      (netAmount * commissionPercentage) / 100
    ); // Commission based on net amount
    const educatorEarnings = Math.round(netAmount - platformCommission);
    // Ensure commission is within reasonable bounds
    platformCommission = Math.min(
      Math.max(platformCommission, 1),
      amount * 0.5
    );
    return { platformCommission, educatorEarnings }; // Min $1, max 50% of payment
  } catch (error) {
    logger.error(`Error calculating commission: ${error.message}`);
    // Fall back to default commission calculation
    return { platformCommission, educatorEarnings };
  }
};

/**
 * Process a refund
 */
const processRefund = async (refundData, user) => {
  const startTime = Date.now();
  const { transactionId, amount, reason } = refundData;

  try {
    // 1. Find the original transaction
    const originalTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!originalTransaction) {
      throw new AppError("Transaction not found", 404);
    }

    if (originalTransaction.status === "REFUNDED") {
      throw new AppError("Transaction already refunded", 400);
    }

    // 2. Process the refund with Stripe
    const refundAmount = amount || originalTransaction.amount;

    const paymentIntent = await stripe.paymentIntents.retrieve(
      originalTransaction.stripeChargeId
    );

    const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

    const stripeRefund = await stripe.refunds.create({
      charge: paymentIntent.latest_charge,
      amount: Math.round(refundAmount * 100),
      reason: reason || "requested_by_customer",
    });

    const reversal = await stripe.transfers.createReversal(charge.transfer, {
      amount: originalTransaction.educatorEarnings * 100,
    });

    // 3. Calculate updated commission and earnings
    const refundRatio = refundAmount / originalTransaction.amount;
    const refundedCommission =
      originalTransaction.platformCommission * refundRatio;
    const refundedEarnings = originalTransaction.educatorEarnings * refundRatio;

    // 4. Create a refund transaction record
    const refundTransaction = await prisma.transaction.create({
      data: {
        stripeChargeId: stripeRefund.id,
        amount: refundAmount,
        currency: originalTransaction.currency,
        status: "COMPLETED",
        type: "REFUND",
        platformCommission: -refundedCommission,
        educatorEarnings: -refundedEarnings,
        userId: originalTransaction.userId + "_REFUND",
        courseId: originalTransaction.courseId,
        educatorId: originalTransaction.educatorId,
        description: `Refund for transaction ${originalTransaction.id}`,
        metadata: {
          originalTransactionId: originalTransaction.id,
          reason,
          refundedBy: user.id,
          processingTime: Date.now() - startTime,
        },
      },
    });

    // 5. Update original transaction
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "REFUNDED",
        refundId: refundTransaction.id,
      },
    });

    // 6. Update the invoice
    await invoiceService.updateInvoiceStatus(
      originalTransaction.id,
      "CANCELLED",
      `Refunded on ${new Date().toISOString().split("T")[0]}`
    );

    // 7. Notify other services
    await notifyUserService({
      userId: originalTransaction.userId,
      action: "REMOVE_ENROLLMENT",
      courseId: originalTransaction.courseId,
      transactionId: refundTransaction.id,
    });

    await notifyCourseService({
      courseId: originalTransaction.courseId,
      action: "RECORD_REFUND",
      userId: originalTransaction.userId,
      amount: refundAmount,
      educatorEarnings: -refundedEarnings,
    });

    // Notify educator about refunded earnings
    await notifyUserService({
      userId: originalTransaction.educatorId,
      action: "EARNINGS_REFUNDED",
      data: {
        courseId: originalTransaction.courseId,
        transactionId: refundTransaction.id,
        amount: refundedEarnings,
        reason,
      },
    });

    // 8. Log the audit
    auditLogger.log(
      "REFUND_PROCESSED",
      user.id,
      `Refund of ${refundAmount} ${originalTransaction.currency} processed for transaction ${originalTransaction.id}`,
      refundTransaction.id,
      { originalTransactionId: originalTransaction.id, reason }
    );

    return {
      originalTransaction,
      refundTransaction,
      success: true,
    };
  } catch (error) {
    logger.error(`Refund processing error: ${error.message}`, { error });
    throw new AppError("Refund processing failed: " + error.message, 400);
  }
};

/**
 * Get transaction by ID
 */
const getTransactionById = async (transactionId) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        invoice: true,
      },
    });

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    return transaction;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Error retrieving transaction: ${error.message}`, 500);
  }
};

/**
 * Get transactions by user ID
 */
const getTransactionsByUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      include: {
        invoice: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    const totalCount = await prisma.transaction.count({
      where: { userId },
    });

    return {
      transactions,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    throw new AppError(`Error retrieving transactions: ${error.message}`, 500);
  }
};

/**
 * Get transactions for reporting
 */
const getTransactionsReport = async (filters = {}, page = 1, limit = 50) => {
  const { startDate, endDate, type, status, educatorId } = filters;
  const skip = (page - 1) * limit;

  // Build where clause based on filters
  const where = {};

  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  } else if (startDate) {
    where.createdAt = { gte: new Date(startDate) };
  } else if (endDate) {
    where.createdAt = { lte: new Date(endDate) };
  }

  if (type) where.type = type;
  if (status) where.status = status;
  if (educatorId) where.educatorId = educatorId;

  try {
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    const totalCount = await prisma.transaction.count({ where });

    // Calculate summary stats with fix for proper column names and SQL injection protection
    const summary = await prisma.$queryRaw`
      SELECT 
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "totalRevenue",
        COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "totalRefunded",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END), 0) as "totalCommission",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END), 0) as "totalEducatorEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "successfulPayments",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "successfulRefunds"
      FROM "Transaction"
      ${
        Object.keys(where).length > 0
          ? prisma.sql`WHERE ${prisma.sql(where)}`
          : prisma.sql``
      }
    `;

    return {
      transactions,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
      summary: summary[0],
    };
  } catch (error) {
    throw new AppError(`Error generating report: ${error.message}`, 500);
  }
};

const createEducatorStripeAccount = async (req) => {
  try {
    // Validate required fields
    if (!req.body.email) {
      throw new AppError("Email is required for Stripe account creation", 400);
    }

    // Create the Stripe Connect Express account
    const account = await stripe.accounts.create({
      type: "custom",
      country: "US",
      email: req.body.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      individual: {
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email: "test@example.com",
        phone: "+18885551234",
        address: {
          line1: "123 Test St",
          city: "San Francisco",
          state: "CA",
          postal_code: "94103",
          country: "US",
        },
        dob: {
          day: 15,
          month: 6,
          year: 1985,
        },
        ssn_last_4: "0000",
      },
      business_profile: {
        mcc: "8299", // Education services
        product_description: "Online education",
      },
      company: {
        name: `${req.body.first_name} ${req.body.last_name}`,
        tax_id: "000000000", // Use "000000000" for test purposes
      },
      tos_acceptance: {
        service_agreement: "full",
        date: Math.floor(Date.now() / 1000),
        ip: req.ip,
      },
    });

    const bank_account = await stripe.accounts.createExternalAccount(
      account.id,
      {
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          routing_number: "110000000",
          account_number: "000123456789",
        },
      }
    );

    const educatorStripeAccount = await prisma.stripeAccount.create({
      data: {
        educatorId: req.user.id,
        email: req.body.email,
        stripeAccountId: account.id,
        stripeBankAccount: bank_account.id,
      },
    });

    auditLogger.log(
      "STRIPE_ACCOUNT_CREATED",
      req.user.id,
      `Stripe Connect account created for educator ${req.user.id}`,
      null,
      { accountId: account.id }
    );

    return { account };
  } catch (error) {
    logger.error(`Error creating Stripe account: ${error.message}`, { error });
    if (
      error.type === "StripePermissionError" ||
      error.message.includes("Connect")
    ) {
      throw new AppError(
        "To create Stripe Connect accounts, you need to sign up for Stripe Connect first. Learn more: https://stripe.com/docs/connect",
        400
      );
    }
    throw new AppError(`Error creating Stripe account: ${error.message}`, 400);
  }
};

const deleteEducatorStripeAccount = async (req, account) => {
  try {
    const educatorId = req.user.id;
    const educatorStripeAccount = await prisma.stripeAccount.findFirst({
      where: { educatorId },
    });

    if (!educatorStripeAccount) {
      throw new AppError("Educator Stripe account not found", 404);
    }

    // Delete the Stripe account
    await stripe.accounts.del(account);

    // Delete the local Stripe account record
    await prisma.stripeAccount.delete({
      where: { educatorId },
    });

    auditLogger.log(
      "STRIPE_ACCOUNT_DELETED",
      educatorId,
      `Stripe Connect account deleted for educator ${educatorId}`,
      null,
      { accountId: account }
    );
  } catch (error) {
    logger.error(`Error deleting educator account: ${error.message}`, {
      error,
    });
    throw new AppError(
      `Error deleting educator account: ${error.message}`,
      400
    );
  }
};

module.exports = {
  deleteEducatorStripeAccount,
  createEducatorStripeAccount,
  getCurrentBalanceForEducator,
  processPayment,
  processRefund,
  getTransactionById,
  getTransactionsByUser,
  getTransactionsReport,
  getTotalEarningsForEducator,
};
