const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

// Create a new Prisma client instance
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// Log queries in development environment
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`Query: ${e.query}`, { params: e.params, duration: e.duration });
  });
}

// Log errors
prisma.$on('error', (e) => {
  logger.error(`Prisma error: ${e.message}`);
});

// Test database connection
prisma.$connect()
  .then(() => {
    logger.info('Successfully connected to the database');
  })
  .catch((error) => { 
    logger.error(`Failed to connect to the database: ${error.message}`, { error });
    
    // Don't exit in test environment to prevent Jest from crashing
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  logger.info('Database connection closed');
  process.exit(0);
});

// Export the prisma client
module.exports = prisma;
