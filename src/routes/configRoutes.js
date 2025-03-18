const express = require('express');
const configController = require('../controllers/configController');
const { mockAuthMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all configurations (admin only)
router.get(
  '/',
  mockAuthMiddleware(),
  requireRole('ADMIN'),
  configController.getAllConfig
);

// Get a specific configuration
router.get(
  '/:key',
  mockAuthMiddleware(),
  requireRole('ADMIN'),
  configController.getConfig
);

// Update a configuration (admin only)
router.put(
  '/:key',
  mockAuthMiddleware(),
  requireRole('ADMIN'),
  configController.updateConfig
);

// Reload all configurations (admin only)
router.post(
  '/reload',
  mockAuthMiddleware(),
  requireRole('ADMIN'),
  configController.reloadConfig
);

module.exports = router;