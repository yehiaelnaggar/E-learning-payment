const statisticsService = require('../services/statisticsService');
const { logger } = require('../utils/logger');

/**
 * Get transaction volumes
 */
const getTransactionVolumes = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getTransactionVolumes(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get performance metrics
 */
const getPerformanceMetrics = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getPerformanceMetrics(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get financial analysis
 */
const getFinancialAnalysis = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy // daily, weekly, monthly
    };
    
    const data = await statisticsService.getFinancialAnalysis(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment operations
 */
const getPaymentOperations = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getPaymentOperations(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard statistics 
 */
const getDashboardStatistics = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy // For financial analysis
    };
    
    const data = await statisticsService.getDashboardStatistics(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTransactionVolumes,
  getPerformanceMetrics,
  getFinancialAnalysis,
  getPaymentOperations,
  getDashboardStatistics
};
