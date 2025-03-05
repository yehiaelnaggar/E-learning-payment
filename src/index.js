require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Fix the logger import to use the destructured format
const { logger } = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const paymentRoutes = require('./routes/paymentRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const refundRoutes = require('./routes/refundRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Middleware
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // For embedded learning content if needed
      styleSrc: ["'self'", "'unsafe-inline'"], // For dynamic styling
      imgSrc: ["'self'", "data:", "blob:", "https://*"], // For course images
      mediaSrc: ["'self'", "https://*"], // For video/audio learning content
      connectSrc: ["'self'", "https://*"], // For API connections
      fontSrc: ["'self'", "https://*"], // For custom fonts
    },
  },
  xssFilter: true,
  frameguard: { action: 'sameorigin' }, // Important for iframe embedded content
}));


// Configure CORS for e-learning platform
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

app.use(express.json({ 
  verify: (req, res, buf) => {
    // Store raw body for Stripe webhook verification
    if (req.originalUrl === '/api/webhooks/stripe') {
      req.rawBody = buf.toString();
    }
  }
}));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/reports', reportRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Error handler
app.use(errorHandler);

// Export app for testing
module.exports = app;

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  const PORT = process.env.PORT || 5002;
  app.listen(PORT, () => {
    logger.info(`Payment service running on port ${PORT}`);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific handling logic here
  });
}

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});
