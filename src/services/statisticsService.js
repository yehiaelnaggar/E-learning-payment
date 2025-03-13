const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

/**
 * Get transaction volume metrics
 * @param {Object} filters - Filter parameters (startDate, endDate)
 * @returns {Promise<Object>} Transaction volume metrics
 */
const getTransactionVolumes = async (filters = {}) => {
  try {
    const { startDate, endDate } = filters;
    const dateWhere = buildDateFilter(startDate, endDate);

    // Get total count and monetary volume
    const volumeStats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as "totalCount",
        COALESCE(SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "totalVolume",
        AVG(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE NULL END) as "avgValue"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
    `;

    // Get peak transaction periods (grouped by hour)
    const peakPeriods = await prisma.$queryRaw`
      SELECT 
        EXTRACT(HOUR FROM "createdAt") as "hour",
        COUNT(*) as "count",
        COALESCE(SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "volume"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
      GROUP BY EXTRACT(HOUR FROM "createdAt")
      ORDER BY "count" DESC
      LIMIT 5
    `;

    // Format data for response
    return {
      totalTransactions: Number(volumeStats[0]?.totalCount) || 0,
      totalVolume: Number(volumeStats[0]?.totalVolume) || 0,
      averageValue: Number(volumeStats[0]?.avgValue) || 0,
      peakPeriods: peakPeriods.map(period => ({
        hour: Number(period.hour),
        count: Number(period.count),
        volume: Number(period.volume)
      }))
    };
  } catch (error) {
    logger.error(`Error fetching transaction volumes: ${error.message}`, { error });
    throw new AppError('Failed to fetch transaction volumes', 500);
  }
};

/**
 * Get performance metrics
 * @param {Object} filters - Filter parameters (startDate, endDate)
 * @returns {Promise<Object>} Performance metrics
 */
const getPerformanceMetrics = async (filters = {}) => {
  try {
    const { startDate, endDate } = filters;
    const dateWhere = buildDateFilter(startDate, endDate);

    // Get success vs failure rates
    const statusMetrics = await prisma.$queryRaw`
      SELECT
        "status",
        COUNT(*) as "count",
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Transaction" WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`})) as "percentage"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
      GROUP BY "status"
    `;

    // Get average processing time (based on metadata if available)
    // This assumes that metadata includes processingTime in milliseconds
    const processingTimeMetrics = await prisma.$queryRaw`
      SELECT
        AVG((metadata->>'processingTime')::float) as "avgProcessingTime"
      FROM "Transaction"
      WHERE metadata->>'processingTime' IS NOT NULL
      AND ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
    `;

    // Get error rates by payment method
    const errorRates = await prisma.$queryRaw`
      SELECT
        COALESCE(metadata->>'paymentMethod', 'unknown') as "paymentMethod",
        COUNT(*) as "totalCount",
        COUNT(CASE WHEN "status" = 'FAILED' THEN 1 END) as "failedCount",
        (COUNT(CASE WHEN "status" = 'FAILED' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as "errorRate"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
      GROUP BY metadata->>'paymentMethod'
    `;

    return {
      statusBreakdown: statusMetrics.map(metric => ({
        status: metric.status,
        count: Number(metric.count),
        percentage: Number(metric.percentage)
      })),
      avgProcessingTime: Number(processingTimeMetrics[0]?.avgProcessingTime) || 0,
      errorRatesByPaymentMethod: errorRates.map(rate => ({
        paymentMethod: rate.paymentMethod,
        totalCount: Number(rate.totalCount),
        failedCount: Number(rate.failedCount),
        errorRate: Number(rate.errorRate) || 0
      }))
    };
  } catch (error) {
    logger.error(`Error fetching performance metrics: ${error.message}`, { error });
    throw new AppError('Failed to fetch performance metrics', 500);
  }
};

/**
 * Get financial analysis
 * @param {Object} filters - Filter parameters (startDate, endDate, groupBy)
 * @returns {Promise<Object>} Financial analysis
 */
const getFinancialAnalysis = async (filters = {}) => {
  try {
    const { startDate, endDate, groupBy = 'daily' } = filters;
    const dateWhere = buildDateFilter(startDate, endDate);

    // Define grouping format based on groupBy parameter
    let timeFormat;
    let timeExtract;
    switch (groupBy.toLowerCase()) {
      case 'weekly':
        timeFormat = `TO_CHAR(DATE_TRUNC('week', "createdAt"), 'YYYY-MM-DD')`;
        timeExtract = `DATE_TRUNC('week', "createdAt")`;
        break;
      case 'monthly':
        timeFormat = `TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM')`;
        timeExtract = `DATE_TRUNC('month', "createdAt")`;
        break;
      case 'daily':
      default:
        timeFormat = `TO_CHAR("createdAt", 'YYYY-MM-DD')`;
        timeExtract = `DATE_TRUNC('day', "createdAt")`;
        break;
    }

    // Get revenue by time period
    const revenueByTimePeriod = await prisma.$queryRaw`
      SELECT
        ${prisma.raw(timeFormat)} as "period",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "revenue",
        COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "refunds",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END) - 
                 SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "netRevenue"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
      GROUP BY ${prisma.raw(timeExtract)}
      ORDER BY ${prisma.raw(timeExtract)}
    `;

    // Get revenue by payment method
    const revenueByPaymentMethod = await prisma.$queryRaw`
      SELECT
        COALESCE(metadata->>'paymentMethod', 'unknown') as "paymentMethod",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "revenue",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "count",
        (SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END) * 100.0 / 
          (SELECT NULLIF(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) FROM "Transaction" WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`})) as "percentage"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
      GROUP BY metadata->>'paymentMethod'
      ORDER BY "revenue" DESC
    `;

    return {
      revenueByTimePeriod: revenueByTimePeriod.map(item => ({
        period: item.period,
        revenue: Number(item.revenue),
        refunds: Number(item.refunds),
        netRevenue: Number(item.netRevenue)
      })),
      revenueByPaymentMethod: revenueByPaymentMethod.map(item => ({
        paymentMethod: item.paymentMethod,
        revenue: Number(item.revenue),
        count: Number(item.count),
        percentage: Number(item.percentage) || 0
      }))
    };
  } catch (error) {
    logger.error(`Error fetching financial analysis: ${error.message}`, { error });
    throw new AppError('Failed to fetch financial analysis', 500);
  }
};

/**
 * Get payment operations metrics
 * @param {Object} filters - Filter parameters (startDate, endDate)
 * @returns {Promise<Object>} Payment operations metrics
 */
const getPaymentOperations = async (filters = {}) => {
  try {
    const { startDate, endDate } = filters;
    const dateWhere = buildDateFilter(startDate, endDate);

    // Get refund metrics
    const refundMetrics = await prisma.$queryRaw`
      SELECT
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "refundCount",
        COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "refundVolume",
        (COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END), 0)) as "refundRate"
      FROM "Transaction"
      WHERE ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
    `;

    // Get payment method distribution
    const paymentMethodDist = await prisma.$queryRaw`
      SELECT
        COALESCE(metadata->>'paymentMethod', 'unknown') as "paymentMethod",
        COUNT(*) as "count",
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Transaction" WHERE "type" = 'PAYMENT' AND ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`})) as "percentage"
      FROM "Transaction"
      WHERE "type" = 'PAYMENT'
      AND ${dateWhere ? prisma.sql`${dateWhere}` : prisma.sql`1=1`}
      GROUP BY metadata->>'paymentMethod'
      ORDER BY "count" DESC
    `;

    return {
      refundMetrics: {
        count: Number(refundMetrics[0]?.refundCount) || 0,
        volume: Number(refundMetrics[0]?.refundVolume) || 0,
        rate: Number(refundMetrics[0]?.refundRate) || 0
      },
      paymentMethodDistribution: paymentMethodDist.map(method => ({
        method: method.paymentMethod,
        count: Number(method.count),
        percentage: Number(method.percentage) || 0
      }))
    };
  } catch (error) {
    logger.error(`Error fetching payment operations: ${error.message}`, { error });
    throw new AppError('Failed to fetch payment operations', 500);
  }
};

/**
 * Get comprehensive dashboard statistics
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Dashboard statistics
 */
const getDashboardStatistics = async (filters = {}) => {
  try {
    const [volumes, performance, financial, operations] = await Promise.all([
      getTransactionVolumes(filters),
      getPerformanceMetrics(filters),
      getFinancialAnalysis(filters),
      getPaymentOperations(filters)
    ]);

    return {
      transactionVolumes: volumes,
      performanceMetrics: performance,
      financialAnalysis: financial,
      paymentOperations: operations,
      generatedAt: new Date()
    };
  } catch (error) {
    logger.error(`Error generating dashboard statistics: ${error.message}`, { error });
    throw new AppError('Failed to generate dashboard statistics', 500);
  }
};

/**
 * Get educator payment analytics
 * @param {string} educatorId - Educator ID
 * @param {Object} filters - Filter parameters (startDate, endDate)
 * @returns {Promise<Object>} Educator payment analytics
 */
const getEducatorPaymentAnalytics = async (educatorId, filters = {}) => {
  try {
    const { startDate, endDate } = filters;
    const dateWhere = buildDateFilter(startDate, endDate);

    // Get overall earnings statistics
    const earningsStats = await prisma.$queryRaw`
      SELECT 
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) as "totalEarnings",
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN ABS("educatorEarnings") ELSE 0 END) as "totalRefunds",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "totalSales",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "totalRefundCount",
        AVG(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE NULL END) as "avgEarningsPerSale"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      ${dateWhere ? prisma.sql`AND ${dateWhere}` : prisma.sql``}
    `;

    // Get payout statistics
    const payoutStats = await prisma.$queryRaw`
      SELECT
        COUNT(*) as "totalPayouts",
        SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END) as "totalPaidOut",
        AVG(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE NULL END) as "avgPayoutAmount",
        AVG(CASE WHEN "status" = 'COMPLETED' THEN "processingFee" ELSE NULL END) as "avgProcessingFee"
      FROM "Payout"
      WHERE "educatorId" = ${educatorId}
      ${dateWhere ? prisma.sql`AND ("requestedAt" ${dateWhere})` : prisma.sql``}
    `;

    // Get earnings by month
    const monthlyEarnings = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as "month",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) -
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN ABS("educatorEarnings") ELSE 0 END) as "netEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "salesCount"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      ${dateWhere ? prisma.sql`AND ${dateWhere}` : prisma.sql``}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt")
    `;

    // Get earnings by course
    const courseEarnings = await prisma.$queryRaw`
      SELECT
        "courseId",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) -
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN ABS("educatorEarnings") ELSE 0 END) as "netEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "salesCount",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "refundCount"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      ${dateWhere ? prisma.sql`AND ${dateWhere}` : prisma.sql``}
      GROUP BY "courseId"
      ORDER BY "netEarnings" DESC
    `;

    return {
      earnings: {
        totalEarnings: Number(earningsStats[0]?.totalEarnings) || 0,
        totalRefunds: Number(earningsStats[0]?.totalRefunds) || 0,
        netEarnings: (Number(earningsStats[0]?.totalEarnings) || 0) - (Number(earningsStats[0]?.totalRefunds) || 0),
        totalSales: Number(earningsStats[0]?.totalSales) || 0,
        totalRefundCount: Number(earningsStats[0]?.totalRefundCount) || 0,
        avgEarningsPerSale: Number(earningsStats[0]?.avgEarningsPerSale) || 0,
        refundRate: Number(earningsStats[0]?.totalSales) > 0 
          ? (Number(earningsStats[0]?.totalRefundCount) / Number(earningsStats[0]?.totalSales)) * 100 
          : 0
      },
      payouts: {
        totalPayouts: Number(payoutStats[0]?.totalPayouts) || 0,
        totalPaidOut: Number(payoutStats[0]?.totalPaidOut) || 0,
        avgPayoutAmount: Number(payoutStats[0]?.avgPayoutAmount) || 0,
        avgProcessingFee: Number(payoutStats[0]?.avgProcessingFee) || 0,
        pendingEarnings: (Number(earningsStats[0]?.totalEarnings) || 0) - (Number(earningsStats[0]?.totalRefunds) || 0) - (Number(payoutStats[0]?.totalPaidOut) || 0)
      },
      monthlyEarnings: monthlyEarnings.map(month => ({
        month: month.month,
        netEarnings: Number(month.netEarnings) || 0,
        salesCount: Number(month.salesCount) || 0
      })),
      courseEarnings: courseEarnings.map(course => ({
        courseId: course.courseId,
        netEarnings: Number(course.netEarnings) || 0,
        salesCount: Number(course.salesCount) || 0,
        refundCount: Number(course.refundCount) || 0,
        refundRate: Number(course.salesCount) > 0 
          ? (Number(course.refundCount) / Number(course.salesCount)) * 100 
          : 0
      }))
    };
  } catch (error) {
    logger.error(`Error fetching educator payment analytics: ${error.message}`, { error });
    throw new AppError('Failed to fetch educator payment analytics', 500);
  }
};

/**
 * Helper function to build date filter SQL condition
 */
const buildDateFilter = (startDate, endDate) => {
  if (startDate && endDate) {
    return prisma.sql`"createdAt" BETWEEN ${new Date(startDate)} AND ${new Date(endDate)}`;
  } else if (startDate) {
    return prisma.sql`"createdAt" >= ${new Date(startDate)}`;
  } else if (endDate) {
    return prisma.sql`"createdAt" <= ${new Date(endDate)}`;
  }
  return null;
};

module.exports = {
  getTransactionVolumes,
  getPerformanceMetrics,
  getFinancialAnalysis,
  getPaymentOperations,
  getDashboardStatistics,
  getEducatorPaymentAnalytics
};
