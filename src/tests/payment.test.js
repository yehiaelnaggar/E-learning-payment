const request = require('supertest');

// Mock logger before importing app - match the destructured structure
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  auditLogger: {
    log: jest.fn()
  }
}));

// Mock other dependencies
jest.mock('../config/stripe', () => ({
  charges: {
    create: jest.fn().mockResolvedValue({
      id: 'ch_test123',
      amount: 9900,
      currency: 'usd',
      status: 'succeeded',
      payment_method_details: {
        type: 'card',
        card: { last4: '4242' }
      }
    })
  },
  refunds: {
    create: jest.fn().mockResolvedValue({
      id: 're_test123',
      charge: 'ch_test123',
      amount: 9900,
      currency: 'usd',
      status: 'succeeded'
    })
  }
}));

// Mock validators middleware
jest.mock('../middleware/validators', () => ({
  validate: (schema) => (req, res, next) => {
    // Simplified validation for tests
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      if (rules.required && !req.body[field]) {
        errors.push(`${field} is required`);
      }
    }
    
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    next();
  },
  paymentValidation: [],
  refundValidation: []
}));

// Import app after mocks are set up
const app = require('../index');
const prisma = require('../config/db');
const stripe = require('../config/stripe');
const { notifyUserService, notifyCourseService } = require('../utils/serviceNotifier');
const invoiceService = require('../services/invoiceService');

// Mock external service notifications
jest.mock('../utils/serviceNotifier', () => ({
  notifyUserService: jest.fn().mockResolvedValue({ success: true }),
  notifyCourseService: jest.fn().mockResolvedValue({ success: true })
}));

// Mock invoice service
jest.mock('../services/invoiceService', () => ({
  createInvoice: jest.fn().mockResolvedValue({
    id: 'inv_test123',
    transactionId: 'tx_test123',
    status: 'PAID',
    total: 99.00
  }),
  updateInvoiceStatus: jest.fn().mockResolvedValue({
    id: 'inv_test123',
    status: 'CANCELLED'
  })
}));

// Mock Prisma client
jest.mock('../config/db', () => {
  const mockTransaction = {
    id: 'tx_test123',
    stripeChargeId: 'ch_test123',
    amount: 99.00,
    currency: 'USD',
    status: 'COMPLETED',
    type: 'PAYMENT',
    platformCommission: 19.80,
    educatorEarnings: 79.20,
    userId: 'user_123',
    courseId: 'course_123',
    educatorId: 'educator_123',
    description: 'Test Course Purchase',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return {
    transaction: {
      create: jest.fn().mockResolvedValue(mockTransaction),
      findUnique: jest.fn().mockResolvedValue(mockTransaction),
      findMany: jest.fn().mockResolvedValue([mockTransaction]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue({
        ...mockTransaction, 
        status: 'REFUNDED',
        refundId: 'refund_test123'
      })
    },
    $queryRaw: jest.fn().mockResolvedValue([{
      totalRevenue: 99.00,
      totalRefunded: 0,
      totalCommission: 19.80,
      totalEducatorEarnings: 79.20,
      successfulPayments: 1,
      successfulRefunds: 0
    }]),
    sql: () => '',
    $disconnect: jest.fn()
  };
});

// Mock user for authentication
const mockUser = {
  id: 'user_123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'ADMIN'
};

// Mock validateToken and requireRole middleware
jest.mock('../middleware/auth', () => ({
  validateToken: (req, res, next) => {
    req.user = mockUser;
    next();
  },
  requireRole: (roles) => (req, res, next) => {
    // Check if user role is in the required roles
    const hasRole = Array.isArray(roles) 
      ? roles.includes(req.user.role) 
      : req.user.role === roles;
    
    if (hasRole) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Insufficient permissions'
    });
  }
}));

describe('Payment API', () => {
  beforeEach(() => {
    // Clear all mock implementations before each test
    jest.clearAllMocks();
  });
  
  afterAll(async () => {
    await prisma.$disconnect();
  });
  
  describe('POST /api/payments', () => {
    it('should process a payment successfully', async () => {
      const paymentData = {
        courseId: 'course_123',
        amount: 99.00,
        currency: 'USD',
        source: 'tok_visa',
        educatorId: 'educator_123',
        description: 'Test Course Purchase'
      };
      
      const response = await request(app)
        .post('/api/payments')
        .send(paymentData)
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transaction).toBeDefined();
      expect(response.body.data.invoice).toBeDefined();
      
      // Verify stripe was called correctly
      expect(stripe.charges.create).toHaveBeenCalledWith({
        amount: 9900, // cents
        currency: 'USD',
        source: 'tok_visa',
        description: 'Test Course Purchase',
        metadata: {
          courseId: 'course_123',
          userId: 'user_123'
        }
      });
      
      // Verify notifications were sent
      expect(notifyUserService).toHaveBeenCalled();
      expect(notifyCourseService).toHaveBeenCalled();
      
      // Verify invoice was created
      expect(invoiceService.createInvoice).toHaveBeenCalled();
    });
    
    it('should return validation error when required fields are missing', async () => {
      const paymentData = {
        // Missing required fields
        amount: 99.00
      };
      
      const response = await request(app)
        .post('/api/payments')
        .send(paymentData)
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('POST /api/payments/refund', () => {
    it('should process a refund successfully', async () => {
      const refundData = {
        transactionId: 'tx_test123',
        reason: 'customer_requested'
      };
      
      const response = await request(app)
        .post('/api/payments/refund')
        .send(refundData)
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.refundTransaction).toBeDefined();
      expect(response.body.data.originalTransaction).toBeDefined();
      
      // Verify stripe refund was called
      expect(stripe.refunds.create).toHaveBeenCalled();
      
      // Verify invoice status was updated
      expect(invoiceService.updateInvoiceStatus).toHaveBeenCalled();
    });
  });
  
  describe('GET /api/payments/user', () => {
    it('should fetch user transactions', async () => {
      const response = await request(app)
        .get('/api/payments/user')
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
  
  describe('GET /api/payments/:transactionId', () => {
    it('should fetch a specific transaction', async () => {
      const response = await request(app)
        .get('/api/payments/tx_test123')
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('tx_test123');
    });
  });
  
  describe('GET /api/payments/report/transactions', () => {
    it('should generate a transactions report for admin', async () => {
      const response = await request(app)
        .get('/api/payments/report/transactions')
        .query({ startDate: '2023-01-01', endDate: '2023-12-31' })
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });
  });
});
