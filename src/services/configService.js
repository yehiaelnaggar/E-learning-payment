const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Initialize with environment variables
let configCache = {
  ...process.env
};

/**
 * Configuration service for managing runtime configuration
 */
class ConfigService {
  /**
   * Get a configuration value
   * @param {string} key - The configuration key
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {any} The configuration value
   */
  get(key, defaultValue = null) {
    // First check the runtime cache
    if (configCache[key] !== undefined) {
      return configCache[key];
    }
    
    // Then check process.env
    if (process.env[key] !== undefined) {
      return process.env[key];
    }
    
    // Return default if not found
    return defaultValue;
  }

  /**
   * Set a configuration value at runtime
   * @param {string} key - The configuration key
   * @param {any} value - The configuration value
   * @param {boolean} persist - Whether to persist to database
   * @returns {Promise<boolean>} Success indicator
   */
  async set(key, value, persist = true) {
    try {
      // Skip protected variables
      if (this.isProtectedKey(key)) {
        logger.warn(`Attempted to modify protected config key: ${key}`);
        throw new Error(`Cannot modify protected configuration key: ${key}`);
      }

      // Update in-memory cache
      configCache[key] = value;

      // Persist to database if requested
      if (persist) {
        await this.persistConfig(key, value);
      }

      logger.info(`Configuration updated: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a key is protected from runtime updates
   * @param {string} key - The configuration key
   * @returns {boolean} True if protected
   */
  isProtectedKey(key) {
    const protectedKeys = [
      'NODE_ENV',
      'DATABASE_URL',
      'PORT',
      'JWT_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET'
    ];
    
    return protectedKeys.includes(key);
  }

  /**
   * Persist configuration to database
   * @param {string} key - The configuration key
   * @param {any} value - The configuration value
   * @private
   */
  async persistConfig(key, value) {
    try {
      // Check if config already exists
      const existingConfig = await prisma.configSetting.findUnique({
        where: { key }
      });

      if (existingConfig) {
        // Update existing config
        await prisma.configSetting.update({
          where: { key },
          data: { 
            value: String(value),
            updatedAt: new Date()
          }
        });
      } else {
        // Create new config
        await prisma.configSetting.create({
          data: {
            key,
            value: String(value),
            description: `Runtime configuration set on ${new Date().toISOString()}`
          }
        });
      }
    } catch (error) {
      logger.error(`Error persisting configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load all configurations from the database
   * @returns {Promise<void>}
   */
  async loadFromDatabase() {
    try {
      const dbConfigs = await prisma.configSetting.findMany();
      
      // Update cache with database values
      dbConfigs.forEach(config => {
        configCache[config.key] = config.value;
      });
      
      logger.info(`Loaded ${dbConfigs.length} configurations from database`);
    } catch (error) {
      logger.error(`Failed to load configurations from database: ${error.message}`);
    }
  }

  /**
   * Update the .env file with a new value
   * Only available in development mode
   * @param {string} key - The configuration key
   * @param {string} value - The new value
   * @returns {Promise<boolean>} Success indicator
   */
  async updateEnvFile(key, value) {
    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      logger.warn('Attempted to update .env file in non-development environment');
      throw new Error('Updating .env file is only allowed in development mode');
    }

    try {
      const envPath = path.resolve(process.cwd(), '.env');
      
      // Read the current .env file
      let envContent = '';
      try {
        envContent = fs.readFileSync(envPath, 'utf8');
      } catch (err) {
        // Create file if it doesn't exist
        envContent = '';
      }

      // Parse the content to find the variable
      const envLines = envContent.split('\n');
      const keyRegex = new RegExp(`^${key}=.*`);
      
      let keyExists = false;
      const updatedLines = envLines.map(line => {
        if (keyRegex.test(line)) {
          keyExists = true;
          return `${key}=${value}`;
        }
        return line;
      });

      // Add the key if it doesn't exist
      if (!keyExists) {
        updatedLines.push(`${key}=${value}`);
      }

      // Write the updated content back to .env
      fs.writeFileSync(envPath, updatedLines.join('\n'));
      
      // Also update process.env
      process.env[key] = value;
      
      logger.info(`Updated .env file with new value for ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update .env file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reload all configurations from sources
   * @returns {Promise<void>}
   */
  async reloadAll() {
    try {
      // Reload .env file
      dotenv.config({ override: true });
      
      // Reset cache with process.env
      configCache = { ...process.env };
      
      // Load from database
      await this.loadFromDatabase();
      
      logger.info('All configurations reloaded');
    } catch (error) {
      logger.error(`Failed to reload configurations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all configuration values (with optional filtering for sensitive values)
   * @param {boolean} includeSensitive - Whether to include sensitive values
   * @returns {Object} All configuration values
   */
  getAll(includeSensitive = false) {
    const allConfig = { ...configCache };
    
    if (!includeSensitive) {
      // List of sensitive keys to mask
      const sensitiveKeys = [
        'JWT_SECRET', 
        'STRIPE_SECRET_KEY',
        'DATABASE_URL',
        'PASSWORD',
        'SECRET',
        'KEY'
      ];
      
      // Mask sensitive values
      Object.keys(allConfig).forEach(key => {
        if (sensitiveKeys.some(sensitiveKey => 
          key.includes(sensitiveKey) || 
          key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('secret'))) {
          allConfig[key] = '********';
        }
      });
    }
    
    return allConfig;
  }
}

// Create a singleton instance
const configService = new ConfigService();

// Initialize by loading from database on startup
(async () => {
  try {
    await configService.loadFromDatabase();
    logger.info('Configuration service initialized');
  } catch (error) {
    logger.error(`Failed to initialize configuration service: ${error.message}`);
  }
})();

module.exports = configService;