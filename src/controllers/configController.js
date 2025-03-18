const configService = require('../services/configService');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get a configuration value
 */
const getConfig = async (req, res, next) => {
  try {
    const { key } = req.params;
    const value = configService.get(key);
    
    if (value === null) {
      return next(new AppError(`Configuration key '${key}' not found`, 404));
    }
    
    res.status(200).json({
      success: true,
      data: { key, value }
    });
  } catch (error) {
    logger.error(`Error retrieving configuration: ${error.message}`);
    next(error);
  }
};

/**
 * Get all configuration values
 */
const getAllConfig = async (req, res, next) => {
  try {
    // Determine whether to include sensitive values
    // Only admins should see sensitive values
    const includeSensitive = req.user?.role === 'ADMIN';
    
    const configs = configService.getAll(includeSensitive);
    
    res.status(200).json({
      success: true,
      data: configs
    });
  } catch (error) {
    logger.error(`Error retrieving configurations: ${error.message}`);
    next(error);
  }
};

/**
 * Update a configuration value
 */
const updateConfig = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, updateEnvFile } = req.body;
    
    if (!key || value === undefined) {
      return next(new AppError('Key and value are required', 400));
    }
    
    // Update the configuration
    await configService.set(key, value);
    
    // Optionally update the .env file (development only)
    if (updateEnvFile && process.env.NODE_ENV === 'development') {
      await configService.updateEnvFile(key, value);
    }
    
    res.status(200).json({
      success: true,
      message: `Configuration '${key}' updated successfully`,
      data: { key, value }
    });
  } catch (error) {
    logger.error(`Error updating configuration: ${error.message}`);
    next(error);
  }
};

/**
 * Reload all configurations
 */
const reloadConfig = async (req, res, next) => {
  try {
    await configService.reloadAll();
    
    res.status(200).json({
      success: true,
      message: 'All configurations reloaded successfully'
    });
  } catch (error) {
    logger.error(`Error reloading configurations: ${error.message}`);
    next(error);
  }
};

module.exports = {
  getConfig,
  getAllConfig,
  updateConfig,
  reloadConfig
};