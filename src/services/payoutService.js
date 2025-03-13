const prisma = require("../config/db");
const stripe = require("../config/stripe");
const { AppError } = require("../middleware/errorHandler");
const { logger, auditLogger } = require("../utils/logger");
const { notifyUserService } = require("../utils/serviceNotifier");

/**
 * Get pending earnings for an educator that haven't been paid out
 * @param {string} educatorId - Educator ID
 * @returns {Promise<Object>} Pending earnings data
 */
const getEducatorPendingEarnings = async (educatorId) => {
  try {
    // Get earnings from completed transactions that haven't been paid out
    const earnings = await prisma.$queryRaw`
      SELECT
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) -
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'REFUNDED' THEN ABS("educatorEarnings") ELSE 0 END) as "pendingAmount",
        COUNT(DISTINCT CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' AND "payoutId" IS NULL THEN id END) as "pendingTransactions",
        MIN(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' AND "payoutId" IS NULL THEN "createdAt" END) as "oldestTransaction"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      AND ("payoutId" IS NULL)
      AND (
        ("type" = 'PAYMENT' AND "status" = 'COMPLETED') OR
        ("type" = 'REFUND' AND "status" = 'REFUNDED')
      )
    `;

    // Get transactions grouped by month to show earnings timeline
    const earningsByMonth = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as "month",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) -
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'REFUNDED' THEN ABS("educatorEarnings") ELSE 0 END) as "netAmount",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "salesCount",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'REFUNDED' THEN 1 END) as "refundCount"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      AND "payoutId" IS NULL
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt") DESC
    `;

    return {
      pendingAmount: Number(earnings[0]?.pendingAmount) || 0,
      pendingTransactions: Number(earnings[0]?.pendingTransactions) || 0,
      oldestTransaction: earnings[0]?.oldestTransaction,
      earningsByMonth: earningsByMonth.map((month) => ({
        month: month.month,
        netAmount: Number(month.netAmount) || 0,
        salesCount: Number(month.salesCount) || 0,
        refundCount: Number(month.refundCount) || 0,
      })),
    };
  } catch (error) {
    logger.error(`Error fetching educator pending earnings: ${error.message}`, {
      error,
    });
    throw new AppError("Failed to fetch educator pending earnings", 500);
  }
};

/**
 * Request a payout for an educator
 * @param {string} educatorId - Educator ID
 * @param {Object} payoutData - Payout request data
 * @returns {Promise<Object>} Payout request information
 */
const requestPayout = async (educatorId, payoutData) => {
  try {
    const checkForExistingPayout = await prisma.payout.findFirst({
      where: { educatorId, status: "PENDING" },
    });

    if (checkForExistingPayout) {
      throw new AppError("You already have a pending payout request", 400);
    }

    const {
      amount,
      bankDetails,
      paymentMethod = "bank_transfer",
      notes,
    } = payoutData;

    // Check if there's enough pending balance
    const { pendingAmount } = await getEducatorPendingEarnings(educatorId);

    if (pendingAmount < amount) {
      throw new AppError(
        `Insufficient balance. Available: $${pendingAmount}`,
        400
      );
    }

    // Generate payout number
    const currentYear = new Date().getFullYear();
    const payoutCount = await prisma.payout.count({
      where: {
        payoutNumber: {
          startsWith: `PAYOUT-${currentYear}-`,
        },
      },
    });

    const sequentialNumber = (payoutCount + 1).toString().padStart(6, "0");
    const payoutNumber = `PAYOUT-${currentYear}-${sequentialNumber}`;

    // Calculate the payout period (from oldest unpaid transaction to now)
    const periodStart = await prisma.transaction.findFirst({
      where: {
        educatorId,
        payoutId: null,
        status: "COMPLETED",
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        createdAt: true,
      },
    });

    // Create the payout record
    const payout = await prisma.payout.create({
      data: {
        payoutNumber,
        educatorId,
        amount,
        status: "PENDING",
        processingFee: calculateProcessingFee(amount, paymentMethod),
        paymentMethod,
        bankDetails,
        periodStart: periodStart?.createdAt || new Date(),
        periodEnd: new Date(),
        notes,
        metadata: {
          requestedBy: educatorId,
          ipAddress: payoutData.ipAddress,
        },
      },
    });

    // Log the payout request
    auditLogger.log(
      "PAYOUT_REQUESTED",
      educatorId,
      `Payout of $${amount} requested by educator ${educatorId}`,
      null,
      { payoutId: payout.id }
    );

    return payout;
  } catch (error) {
    logger.error(`Error requesting payout: ${error.message}`, { error });
    throw error instanceof AppError
      ? error
      : new AppError("Failed to request payout", 500);
  }
};

/**
 * Process a pending payout (Admin action)
 * @param {string} payoutId - Payout ID
 * @param {string} adminId - Admin user ID
 * @returns {Promise<Object>} Processed payout information
 */
const processPayout = async (payoutId, adminId) => {
  try {
    // Check if payout exists and is in PENDING status
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new AppError("Payout not found", 404);
    }

    if (payout.status !== "PENDING") {
      throw new AppError(
        `Cannot process a payout with status: ${payout.status}`,
        400
      );
    }

    // Find all unpaid transactions for this educator up to the payout amount
    const transactions = await prisma.transaction.findMany({
      where: {
        educatorId: payout.educatorId,
        payoutId: null,
        status: "COMPLETED",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Calculate the total amount to be included in this payout
    let runningTotal = 0;
    const transactionsToInclude = [];

    for (const tx of transactions) {
      // For payments, add the educator earnings
      if (tx.type === "PAYMENT") {
        runningTotal += tx.educatorEarnings;
        transactionsToInclude.push(tx.id);
      }
      // For refunds, subtract the educator earnings
      else if (tx.type === "REFUND") {
        runningTotal -= Math.abs(tx.educatorEarnings);
        transactionsToInclude.push(tx.id);
      }

      // Stop when we reach the requested amount
      if (runningTotal >= payout.amount) {
        break;
      }
    }

    // Process the payout through your payment processor (e.g., Stripe)
    // This is a placeholder - you would use your actual payment processor
    let paymentProcessorResult;

    try {
      // Update payout status to PROCESSING
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: "PROCESSING" },
      });

      if (payout.paymentMethod === "stripe") {
        // Example Stripe transfer - you need to set up the Connect platform first
        paymentProcessorResult = await stripe.payouts.create(
          {
            amount: Math.round(payout.amount * 100), // Stripe uses cents
            currency: payout.currency,
          },
          { stripeAccount: payout.stripeAccountId }
        );
      } else {
        // Simulate processing for other payment methods
        // In a real application, you would integrate with your banking API
        paymentProcessorResult = {
          id: `sim_${Date.now()}`,
          status: "succeeded",
        };
      }

      // Link the transactions to this payout and mark payout as completed
      await prisma.$transaction([
        // Update the transactions with the payout ID
        prisma.transaction.updateMany({
          where: {
            id: {
              in: transactionsToInclude,
            },
          },
          data: {
            payoutId: payout.id,
          },
        }),

        // Update the payout status to COMPLETED
        prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: "COMPLETED",
            processedAt: new Date(),
            metadata: {
              ...payout.metadata,
              paymentProcessorResult,
              processedBy: adminId,
            },
          },
        }),
      ]);

      // Get the updated payout with transactions
      const updatedPayout = await prisma.payout.findUnique({
        where: { id: payout.id },
        include: {
          transactions: true,
        },
      });

      // Notify the educator that the payout has been processed
      await notifyUserService({
        userId: payout.educatorId,
        action: "PAYOUT_COMPLETED",
        data: {
          payoutId: payout.id,
          amount: payout.amount,
          payoutNumber: payout.payoutNumber,
        },
      });

      // Log the payout processing
      auditLogger.log(
        "PAYOUT_PROCESSED",
        adminId,
        `Payout ${payout.payoutNumber} of $${payout.amount} for educator ${payout.educatorId} has been processed`,
        null,
        { payoutId: payout.id }
      );

      return updatedPayout;
    } catch (processingError) {
      // Mark the payout as failed if processing failed
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          notes: `${payout.notes ? payout.notes + "\n" : ""}Failed: ${
            processingError.message
          }`,
          metadata: {
            ...payout.metadata,
            error: processingError.message,
            processedBy: adminId,
          },
        },
      });

      logger.error(`Payout processing failed: ${processingError.message}`, {
        processingError,
      });
      throw new AppError(
        `Payout processing failed: ${processingError.message}`,
        500
      );
    }
  } catch (error) {
    logger.error(`Error processing payout: ${error.message}`, { error });
    throw error instanceof AppError
      ? error
      : new AppError("Failed to process payout", 500);
  }
};

/**
 * Get payout by ID
 * @param {string} payoutId - Payout ID
 * @returns {Promise<Object>} Payout information
 */
const getPayoutById = async (payoutId) => {
  try {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        transactions: {
          select: {
            id: true,
            amount: true,
            educatorEarnings: true,
            type: true,
            status: true,
            createdAt: true,
            courseId: true,
            description: true,
          },
        },
      },
    });

    if (!payout) {
      throw new AppError("Payout not found", 404);
    }

    return payout;
  } catch (error) {
    logger.error(`Error fetching payout: ${error.message}`, { error });
    throw error instanceof AppError
      ? error
      : new AppError("Failed to fetch payout", 500);
  }
};

/**
 * Get educator payouts
 * @param {string} educatorId - Educator ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Payout list with pagination
 */
const getEducatorPayouts = async (educatorId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  try {
    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where: { educatorId },
        orderBy: { requestedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.payout.count({
        where: { educatorId },
      }),
    ]);

    return {
      payouts,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    logger.error(`Error fetching educator payouts: ${error.message}`, {
      error,
    });
    throw new AppError("Failed to fetch educator payouts", 500);
  }
};

/**
 * Get all payouts (admin function)
 * @param {Object} filters - Filter parameters
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Payout list with pagination
 */
const getAllPayouts = async (filters = {}, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const { status, educatorId, startDate, endDate } = filters;

  const where = {};
  if (status) where.status = status;
  if (educatorId) where.educatorId = educatorId;

  if (startDate && endDate) {
    where.requestedAt = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  } else if (startDate) {
    where.requestedAt = { gte: new Date(startDate) };
  } else if (endDate) {
    where.requestedAt = { lte: new Date(endDate) };
  }

  try {
    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.payout.count({ where }),
    ]);

    return {
      payouts,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    logger.error(`Error fetching all payouts: ${error.message}`, { error });
    throw new AppError("Failed to fetch payouts", 500);
  }
};

/**
 * Cancel a pending payout
 * @param {string} payoutId - Payout ID
 * @param {string} userId - User ID (educator or admin)
 * @param {boolean} isAdmin - Whether the user is an admin
 * @returns {Promise<Object>} Cancelled payout information
 */
const cancelPayout = async (payoutId, userId, isAdmin = false) => {
  try {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new AppError("Payout not found", 404);
    }

    // Only allow cancellation of PENDING payouts
    if (payout.status !== "PENDING") {
      throw new AppError(
        `Cannot cancel a payout with status: ${payout.status}`,
        400
      );
    }

    // Check authorization - only allow educator to cancel their own payouts or admins
    if (!isAdmin && payout.educatorId !== userId) {
      throw new AppError("You are not authorized to cancel this payout", 403);
    }

    // Cancel the payout
    const cancelledPayout = await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "CANCELLED",
        notes: `${payout.notes ? payout.notes + "\n" : ""}Cancelled by ${
          isAdmin ? "admin" : "educator"
        } on ${new Date().toISOString()}`,
        metadata: {
          ...payout.metadata,
          cancelledBy: userId,
          cancelledAt: new Date(),
        },
      },
    });

    // Log the cancellation
    auditLogger.log(
      "PAYOUT_CANCELLED",
      userId,
      `Payout ${payout.payoutNumber} of $${payout.amount} cancelled by ${
        isAdmin ? "admin" : "educator"
      }`,
      null,
      { payoutId }
    );

    return cancelledPayout;
  } catch (error) {
    logger.error(`Error cancelling payout: ${error.message}`, { error });
    throw error instanceof AppError
      ? error
      : new AppError("Failed to cancel payout", 500);
  }
};

/**
 * Calculate the processing fee based on amount and payment method
 * @param {number} amount - Payout amount
 * @param {string} paymentMethod - Payment method
 * @returns {number} Processing fee
 */
const calculateProcessingFee = (amount, paymentMethod) => {
  // These fee calculations are examples - you would configure these based on your business model
  switch (paymentMethod) {
    case "paypal":
      // PayPal typically charges ~2.9% + $0.30
      return Math.max(0.029 * amount + 0.3, 1);

    case "stripe":
      // Stripe might be slightly different
      return Math.max(0.025 * amount, 1);

    case "bank_transfer":
      // Bank transfers often have fixed fees
      return amount >= 1000 ? 0 : 2.5;

    case "express":
      // Express payouts might have a premium fee
      return Math.max(0.035 * amount, 5);

    default:
      return Math.max(0.02 * amount, 1); // Default 2% fee, minimum $1
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
        first_name: "Test",
        last_name: "User",
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
        ssn_last_4: "0000", // Use "0000" in test mode
      },
      business_profile: {
        mcc: "8299", // Education services
        product_description: "Online education",
      },
      company: {
        name: "Test Business2",
        tax_id: "000000000", // Use "000000000" for test purposes
      },
      tos_acceptance: {
        service_agreement: "full",
        date: Math.floor(Date.now() / 1000),
        ip: "127.0.0.1", // Simulated IP
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
  getEducatorPendingEarnings,
  requestPayout,
  processPayout,
  getPayoutById,
  getEducatorPayouts,
  getAllPayouts,
  cancelPayout,
};
