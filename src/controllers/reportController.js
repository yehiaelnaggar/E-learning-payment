const reportingService = require('../services/reportingService');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

/**
 * Generate financial report with optional filters
 * Accessible by ADMIN for all data, and EDUCATOR for their own data
 */
const generateFinancialReport = async (req, res, next) => {
  try {
    // Extract query parameters
    const { startDate, endDate, educatorId } = req.query;
    const filters = {};
    
    // Check permissions
    if (req.user.role === 'ADMIN') {
      // Admin can view all reports and specify any filters
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (educatorId) filters.educatorId = educatorId;
    } else if (req.user.role === 'EDUCATOR') {
      // Educators can only view their own reports
      filters.educatorId = req.user.id;
      
      // If educator tries to request another educator's data, block access
      if (educatorId && educatorId !== req.user.id) {
        return next(new AppError('You can only access your own financial reports', 403));
      }
      
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
    } else {
      // Other users cannot access reports
      return next(new AppError('You do not have permission to access financial reports', 403));
    }
    
    // Generate the report
    const report = await reportingService.generateFinancialReport(filters);
    
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download financial report as PDF with optional filters
 * Accessible by ADMIN for all data, and EDUCATOR for their own data
 */
const downloadFinancialReportPDF = async (req, res, next) => {
  try {
    // Extract query parameters
    const { startDate, endDate, educatorId } = req.query;
    const filters = {};
    
    // Check permissions (same logic as generateFinancialReport)
    if (req.user.role === 'ADMIN') {
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (educatorId) filters.educatorId = educatorId;
    } else if (req.user.role === 'EDUCATOR') {
      filters.educatorId = req.user.id;
      
      if (educatorId && educatorId !== req.user.id) {
        return next(new AppError('You can only access your own financial reports', 403));
      }
      
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
    } else {
      return next(new AppError('You do not have permission to access financial reports', 403));
    }
    
    // Generate the report data
    const reportData = await reportingService.generateFinancialReport(filters);
    
    // Generate PDF from report data
    const pdfResult = await reportingService.generateFinancialReportPDF(reportData);
    
    // Send PDF file as download
    res.setHeader('Content-Disposition', `attachment; filename=${pdfResult.filename}`);
    
    res.sendFile(pdfResult.filePath, (err) => {
      // Clean up the temp file after sending or in case of error
      reportingService.deleteTempPDF(pdfResult.filePath);
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get earnings report for a specific educator
 * Accessible by ADMIN for all educators, and EDUCATOR for their own data
 */
const getEducatorEarningsReport = async (req, res, next) => {
  try {
    const { educatorId } = req.params;
    
    // Check permissions
    if (req.user.role === 'ADMIN') {
      // Admin can view any educator's earnings
    } else if (req.user.role === 'EDUCATOR' && req.user.id === educatorId) {
      // Educator can view their own earnings
    } else {
      // Others cannot access educator earnings
      return next(new AppError('You do not have permission to access this earnings report', 403));
    }
    
    // Get the earnings report
    const earningsReport = await reportingService.getEducatorEarningsReport(educatorId);
    
    res.status(200).json({
      success: true,
      data: earningsReport
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateFinancialReport,
  downloadFinancialReportPDF,
  getEducatorEarningsReport
};
