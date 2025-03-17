const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");
const prisma = require("../config/db");
const { Prisma } = require("@prisma/client");
const { AppError } = require("../middleware/errorHandler");
const { logger } = require("../utils/logger");

/**
 * Generate financial report with optional filters
 */
const generateFinancialReport = async (filters = {}) => {
  try {
    // Extract filters
    const { startDate, endDate, educatorId } = filters;

    // Build date filter condition for SQL queries

    let dateCondition = Prisma.empty;
    if (startDate && endDate) {
      dateCondition = Prisma.sql`AND t."createdAt" BETWEEN ${new Date(
        startDate
      )} AND ${new Date(endDate)}`;
    } else if (startDate) {
      dateCondition = Prisma.sql`AND t."createdAt" >= ${new Date(startDate)}`;
    } else if (endDate) {
      dateCondition = Prisma.sql`AND t."createdAt" <= ${new Date(endDate)}`;
    }

    // Build educator filter condition
    let educatorCondition = Prisma.empty;
    if (educatorId) {
      educatorCondition = Prisma.sql`AND t."educatorId" = ${educatorId}`;
    }

    // Query for summary statistics

    const summaryQuery = Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" END)::numeric, 0) as "totalPayments",
      COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" END)::numeric, 0) as "totalRefunds",
      COALESCE(SUM(CASE WHEN t."status" = 'COMPLETED' THEN t."platformCommission" END)::numeric, 0) as "totalCommission",
      COALESCE(SUM(CASE WHEN t."status" = 'COMPLETED' THEN t."educatorEarnings" END)::numeric, 0) as "totalEducatorEarnings",
      COUNT(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN 1 END)::integer as "successfulPayments",
      COUNT(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN 1 END)::integer as "successfulRefunds"
    FROM "Transaction" t
    WHERE 1=1 ${dateCondition} ${educatorCondition}
  `;
    // Query for daily statistics
    const dailyStatsQuery = Prisma.sql`
      SELECT
        DATE_TRUNC('day', t."createdAt") as "date",
        COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END),0)::numeric as "dailyRevenue",
        COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END),0)::numeric as "dailyRefunds",
        COUNT(*)::integer as "dailyTransactions"
      FROM "Transaction" t
      WHERE 1=1 ${dateCondition} ${educatorCondition}
      GROUP BY DATE_TRUNC('day', t."createdAt")
      ORDER BY "date"
    `;

    // Query for top courses by revenue
    const topCoursesQuery = Prisma.sql`
      SELECT
        t."courseId",
        COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END)::numeric,0) as "totalRevenue",
        COUNT(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN 1 END)::integer as "totalSales"
      FROM "Transaction" t
      WHERE 1=1 ${dateCondition} ${educatorCondition}
      GROUP BY t."courseId"
      ORDER BY "totalRevenue" DESC
      LIMIT 10
    `;

    // Execute all queries in parallel
    const [summaryResults, dailyStats, topCourses] = await Promise.all([
      prisma.$queryRaw(summaryQuery),
      prisma.$queryRaw(dailyStatsQuery),
      prisma.$queryRaw(topCoursesQuery),
    ]);

    // Get educator specific stats if educatorId is provided
    let educatorStats = null;
    if (educatorId) {
      const educatorStatsQuery = Prisma.sql`
        SELECT
          t."educatorId",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END)::numeric,0) as "totalEarnings",
          COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END)::numeric,0) as "totalRefundedEarnings"
        FROM "Transaction" t
        WHERE t."educatorId" = ${educatorId} ${dateCondition}
        GROUP BY t."educatorId"
      `;

      const educatorStatsResults = await prisma.$queryRaw(educatorStatsQuery);
      if (educatorStatsResults.length > 0) {
        educatorStats = educatorStatsResults[0];
      }
    }

    // Prepare and return the report
    return {
      summary: summaryResults[0],
      dailyStats,
      topCourses,
      educatorStats,
      reportGenerated: new Date(),
      period: {
        from: startDate ? new Date(startDate) : null,
        to: endDate ? new Date(endDate) : null,
      },
    };
  } catch (error) {
    logger.error(`Error generating financial report: ${error.message}`);
    throw new AppError("Failed to generate financial report", 500);
  }
};

/**
 * Generate PDF for a financial report
 */
const generateFinancialReportPDF = async (reportData) => {
  return new Promise((resolve, reject) => {
    try {
      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, "../../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generate unique filename
      const uniqueId = uuidv4();
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `financial_report_${dateStr}_${uniqueId}.pdf`;
      const filePath = path.join(tempDir, fileName);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Pipe PDF to file
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Add content to PDF
      generateFinancialPDFContent(doc, reportData);

      // Finalize PDF
      doc.end();

      // When PDF is written to file system, resolve with file path
      stream.on("finish", () => {
        resolve({
          filePath,
          filename: fileName,
        });
      });

      stream.on("error", (err) => {
        reject(new AppError(`Error generating PDF: ${err.message}`, 500));
      });
    } catch (error) {
      logger.error(`Error generating financial report PDF: ${error.message}`);
      reject(new AppError("Failed to generate financial report PDF", 500));
    }
  });
};

/**
 * Generate content for financial report PDF
 */
const generateFinancialPDFContent = (doc, reportData) => {
  // Add header
  doc.fontSize(20).text("FINANCIAL REPORT", { align: "center" });
  doc.moveDown();

  // Add report period
  doc.fontSize(12);
  doc.text(`Report Generated: ${formatDate(reportData.reportGenerated)}`);

  if (reportData.period.from || reportData.period.to) {
    doc.text(
      "Period: " +
        (reportData.period.from
          ? formatDate(reportData.period.from)
          : "All time") +
        " to " +
        (reportData.period.to ? formatDate(reportData.period.to) : "present")
    );
  }

  doc.moveDown();

  // Add summary section
  doc.fontSize(16).text("SUMMARY", { underline: true });
  doc.fontSize(12);

  const summary = reportData.summary;
  if (summary) {
    doc.text(`Total Revenue: $${formatNumber(summary.totalPayments || 0)}`);
    doc.text(`Total Refunds: $${formatNumber(summary.totalRefunds || 0)}`);
    doc.text(
      `Net Revenue: $${formatNumber(
        (summary.totalPayments || 0) - (summary.totalRefunds || 0)
      )}`
    );
    doc.text(
      `Platform Commission: $${formatNumber(summary.totalCommission || 0)}`
    );
    doc.text(
      `Total Educator Earnings: $${formatNumber(
        summary.totalEducatorEarnings || 0
      )}`
    );
    doc.text(`Successful Payments: ${summary.successfulPayments || 0}`);
    doc.text(`Successful Refunds: ${summary.successfulRefunds || 0}`);
  }

  doc.moveDown();

  // Add educator specific stats if available
  if (reportData.educatorStats) {
    doc.fontSize(16).text("EDUCATOR EARNINGS", { underline: true });
    doc.fontSize(12);

    const educatorStats = reportData.educatorStats;
    doc.text(`Educator ID: ${educatorStats.educatorId}`);
    doc.text(
      `Total Earnings: $${formatNumber(educatorStats.totalEarnings || 0)}`
    );
    doc.text(
      `Total Refunded Earnings: $${formatNumber(
        educatorStats.totalRefundedEarnings || 0
      )}`
    );
    doc.text(
      `Net Earnings: $${formatNumber(
        (educatorStats.totalEarnings || 0) -
          (educatorStats.totalRefundedEarnings || 0)
      )}`
    );

    doc.moveDown();
  }

  // Add daily stats section if available
  if (reportData.dailyStats && reportData.dailyStats.length > 0) {
    doc.fontSize(16).text("DAILY REVENUE", { underline: true });
    doc.fontSize(12);

    // Create a simple table for daily stats
    let y = doc.y + 15;

    // Table header
    doc
      .fontSize(10)
      .text("Date", 50, y)
      .text("Revenue", 200, y)
      .text("Refunds", 300, y)
      .text("Transactions", 400, y);

    y += 15;
    doc.moveTo(50, y).lineTo(500, y).stroke();

    y += 10;

    // Table rows - limit to first 20 days to avoid excessive pages
    const limitedDailyStats = reportData.dailyStats.slice(0, 20);

    limitedDailyStats.forEach((stat) => {
      const date = formatDate(new Date(stat.date));
      doc
        .fontSize(9)
        .text(date, 50, y)
        .text(`$${formatNumber(stat.dailyRevenue)}`, 200, y)
        .text(`$${formatNumber(stat.dailyRefunds)}`, 300, y)
        .text(stat.dailyTransactions.toString(), 400, y);

      y += 20;

      // Add new page if needed
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
      }
    });

    // Add note if data was truncated
    if (reportData.dailyStats.length > 20) {
      doc.fontSize(8).text("(Showing first 20 days only)", { align: "center" });
    }

    doc.moveDown();
  }

  // Add top courses section if available
  if (reportData.topCourses && reportData.topCourses.length > 0) {
    doc.fontSize(16).text("TOP PERFORMING COURSES", { underline: true });
    doc.fontSize(12);

    // Create a simple table for top courses
    let y = doc.y + 15;

    // Table header
    doc
      .fontSize(10)
      .text("Course ID", 50, y)
      .text("Revenue", 300, y)
      .text("Sales", 400, y);

    y += 15;
    doc.moveTo(50, y).lineTo(500, y).stroke();

    y += 10;

    // Table rows
    reportData.topCourses.forEach((course) => {
      doc
        .fontSize(9)
        .text(course.courseId.toString(), 50, y, { width: 240 })
        .text(`$${formatNumber(course.totalRevenue)}`, 300, y)
        .text(course.totalSales.toString(), 400, y);

      y += 20;

      // Add new page if needed
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveDown();
  }

  // Add footer
  doc
    .fontSize(10)
    .text("CONFIDENTIAL FINANCIAL INFORMATION", { align: "center" });
  doc.text(`Generated on ${formatDate(new Date())}`, { align: "center" });
};

/**
 * Get educator earnings report
 */
const getEducatorEarningsReport = async (educatorId) => {
  try {
    const query = prisma.sql`
      SELECT
        t."educatorId",
        SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END) as "totalEarnings",
        SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END) as "totalRefundedEarnings",
        COUNT(DISTINCT CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."courseId" END) as "totalActiveCourses",
        COUNT(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN 1 END) as "totalSales"
      FROM "Transaction" t
      WHERE t."educatorId" = ${educatorId}
      GROUP BY t."educatorId"
    `;

    const results = await prisma.$queryRaw(query);

    if (results.length === 0) {
      return {
        educatorId,
        totalEarnings: 0,
        totalRefundedEarnings: 0,
        totalActiveCourses: 0,
        totalSales: 0,
      };
    }

    return results[0];
  } catch (error) {
    logger.error(`Error getting educator earnings report: ${error.message}`);
    throw new AppError("Failed to get educator earnings report", 500);
  }
};

/**
 * Generate commission analysis report
 */
const generateCommissionReport = async (filters = {}) => {
  try {
    const { startDate, endDate, educatorId } = filters;

    // Build query conditions
    const dateWhere = buildDateFilter(startDate, endDate);
    const educatorWhere = educatorId
      ? prisma.sql`AND "educatorId" = ${educatorId}`
      : prisma.sql``;

    // Get overall commission summary
    const commissionSummary = await prisma.$queryRaw`
      SELECT
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END) as "totalCommission",
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END) as "refundedCommission",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) as "totalEducatorEarnings",
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) as "refundedEducatorEarnings",
        SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END) as "totalTransactionAmount",
        AVG(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" / "amount" * 100 ELSE NULL END) as "averageCommissionRate"
      FROM "Transaction"
      WHERE 1=1
      ${dateWhere ? prisma.sql`AND ${dateWhere}` : prisma.sql``}
      ${educatorWhere}
    `;

    // Get commission by educator (if not filtered to specific educator)
    let commissionByEducator = [];
    if (!educatorId) {
      commissionByEducator = await prisma.$queryRaw`
        SELECT
          "educatorId",
          COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "totalTransactions",
          SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END) as "totalRevenue",
          SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END) as "platformCommission",
          SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) as "educatorEarnings",
          AVG(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" / "amount" * 100 ELSE NULL END) as "effectiveCommissionRate"
        FROM "Transaction"
        WHERE 1=1
        ${dateWhere ? prisma.sql`AND ${dateWhere}` : prisma.sql``}
        GROUP BY "educatorId"
        ORDER BY "platformCommission" DESC
      `;
    }

    // Get commission trend over time (monthly)
    const commissionTrend = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as "month",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END) as "platformCommission",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) as "educatorEarnings",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END) as "totalRevenue"
      FROM "Transaction"
      WHERE 1=1
      ${dateWhere ? prisma.sql`AND ${dateWhere}` : prisma.sql``}
      ${educatorWhere}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt")
    `;

    return {
      summary: {
        totalCommission: Number(commissionSummary[0]?.totalCommission) || 0,
        refundedCommission: Math.abs(
          Number(commissionSummary[0]?.refundedCommission) || 0
        ),
        netCommission:
          Number(commissionSummary[0]?.totalCommission) -
          Math.abs(Number(commissionSummary[0]?.refundedCommission) || 0),
        totalEducatorEarnings:
          Number(commissionSummary[0]?.totalEducatorEarnings) || 0,
        refundedEducatorEarnings: Math.abs(
          Number(commissionSummary[0]?.refundedEducatorEarnings) || 0
        ),
        netEducatorEarnings:
          Number(commissionSummary[0]?.totalEducatorEarnings) -
          Math.abs(Number(commissionSummary[0]?.refundedEducatorEarnings) || 0),
        totalAmount: Number(commissionSummary[0]?.totalTransactionAmount) || 0,
        averageCommissionRate:
          Number(commissionSummary[0]?.averageCommissionRate) || 0,
      },
      educatorAnalysis: commissionByEducator.map((item) => ({
        educatorId: item.educatorId,
        totalTransactions: Number(item.totalTransactions),
        totalRevenue: Number(item.totalRevenue),
        platformCommission: Number(item.platformCommission),
        educatorEarnings: Number(item.educatorEarnings),
        effectiveCommissionRate: Number(item.effectiveCommissionRate),
      })),
      monthlyTrend: commissionTrend.map((item) => ({
        month: item.month,
        platformCommission: Number(item.platformCommission),
        educatorEarnings: Number(item.educatorEarnings),
        totalRevenue: Number(item.totalRevenue),
        platformShare:
          (Number(item.platformCommission) / Number(item.totalRevenue)) * 100,
        educatorShare:
          (Number(item.educatorEarnings) / Number(item.totalRevenue)) * 100,
      })),
    };
  } catch (error) {
    logger.error(`Error generating commission report: ${error.message}`, {
      error,
    });
    throw new AppError("Failed to generate commission report", 500);
  }
};

/**
 * Format a number for display in reports
 */
const formatNumber = (num) => {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Format a date for display in reports
 */
const formatDate = (date) => {
  if (!date) return "N/A";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * Delete temporary PDF file
 */
const deleteTempPDF = (filePath) => {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    logger.error(`Failed to delete temporary PDF: ${error.message}`);
    // Don't throw, just log the error
  }
};

module.exports = {
  generateFinancialReport,
  generateFinancialReportPDF,
  getEducatorEarningsReport,
  deleteTempPDF,
  generateCommissionReport,
};
