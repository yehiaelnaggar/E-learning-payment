const app = require('./index');
const { logger } = require('./utils/logger');

const PORT = process.env.PORT || 5002;
const server = app.listen(PORT, () => {
  logger.info(`Payment service running on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific handling logic here
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

module.exports = server;
