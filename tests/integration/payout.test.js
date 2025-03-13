const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const { mockAuthMiddleware } = require('../../src/middleware/auth');
const express = require('express');

// Mock authentication for testing
jest.mock('../../src/middleware/auth', () => ({
  validateToken: jest.fn((req, res, next) => {
    req.user = {
      id: 'test-educator-id',
      role: 'EDUCATOR'
    };
    next();
  }),
  requireRole: jest.fn(() => (req, res, next) => next()),
  mockAuthMiddleware: jest.fn()
}));

// Mock DB operations
jest.mock('../../src/config/db', () => ({
  transaction: {
    findMany: jest.fn(),
    updateMany: jest.fn()
  },
  payout: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn()
}));

describe('Payout Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Pending Earnings', () => {
    it('should retrieve pending earnings for an educator', async () => {
      // Mock DB response
      const mockEarnings = {
        pendingAmount: 1000,
        pendingTransactions: 5,
        oldestTransaction: new Date('2023-01-01'),
        earningsByMonth: [
          {
            month: new Date('2023-01-01'),
            netAmount: 500,
            salesCount: 10,
            refundCount: 1
          }
        ]
      };

      prisma.$queryRaw
        .mockResolvedValueOnce([{ pendingAmount: 1000, pendingTransactions: 5, oldestTransaction: new Date('2023-01-01') }])
        .mockResolvedValueOnce([
          { month: new Date('2023-01-01'), netAmount: 500, salesCount: 10, refundCount: 1 }
        ]);

      // Execute request
      const response = await request(app)
        .get('/api/payouts/educators/test-educator-id/pending')
        .set('Authorization', 'Bearer fake-token');

      // Assert response
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pendingAmount).toBe(1000);
    });
  });

  describe('Request Payout', () => {
    it('should successfully create a payout request', async () => {
      // Mock DB responses
      prisma.$queryRaw.mockResolvedValueOnce([{ pendingAmount: 1000 }]);
      prisma.payout.count.mockResolvedValueOnce(5);
      prisma.transaction.findFirst.mockResolvedValueOnce({ createdAt: new Date('2023-01-15') });
      
      const mockPayout = {
        id: 'payout-123',
        payoutNumber: 'PAYOUT-2023-000006',
        educatorId: 'test-educator-id',
        amount: 800,
        status: 'PENDING',
        requestedAt: new Date()
      };
      
      prisma.payout.create.mockResolvedValueOnce(mockPayout);

      // Execute request
      const response = await request(app)
        .post('/api/payouts/educators/test-educator-id/request')
        .set('Authorization', 'Bearer fake-token')
        .send({
          amount: 800,
          paymentMethod: 'bank_transfer',
          bankDetails: {
            accountName: 'John Doe',
            accountNumber: '****1234'
          }
        });

      // Assert response
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payoutNumber).toBe('PAYOUT-2023-000006');
      expect(response.body.data.amount).toBe(800);
    });

    it('should return error on insufficient balance', async () => {
      // Mock insufficient balance
      prisma.$queryRaw.mockResolvedValueOnce([{ pendingAmount: 500 }]);

      // Execute request
      const response = await request(app)
        .post('/api/payouts/educators/test-educator-id/request')
        .set('Authorization', 'Bearer fake-token')
        .send({
          amount: 800,
          paymentMethod: 'bank_transfer',
          bankDetails: {
            accountName: 'John Doe',
            accountNumber: '****1234'
          }
        });

      // Assert response
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/Insufficient balance/i);
    });
  });

  describe('Process Payout', () => {
    it('should successfully process a payout (admin only)', async () => {
      // Set admin role for this test
      jest.spyOn(require('../../src/middleware/auth'), 'validateToken').mockImplementationOnce((req, res, next) => {
        req.user = { id: 'admin-id', role: 'ADMIN' };
        next();
      });

      // Mock DB responses
      const mockPayout = {
        id: 'payout-123',
        educatorId: 'test-educator-id',
        amount: 800,
        status: 'PENDING',
        paymentMethod: 'bank_transfer',
        bankDetails: {},
        metadata: {}
      };

      const mockTransactions = [
        { id: 'tx-1', type: 'PAYMENT', educatorEarnings: 500, status: 'COMPLETED' },
        { id: 'tx-2', type: 'PAYMENT', educatorEarnings: 300, status: 'COMPLETED' }
      ];

      prisma.payout.findUnique.mockResolvedValue(mockPayout);
      prisma.transaction.findMany.mockResolvedValue(mockTransactions);
      prisma.$transaction.mockResolvedValue([]);
      prisma.payout.findUnique.mockResolvedValue({ 
        ...mockPayout, 
        status: 'COMPLETED',
        transactions: mockTransactions 
      });

      // Execute request
      const response = await request(app)
        .post('/api/payouts/payout-123/process')
        .set('Authorization', 'Bearer fake-token');

      // Assert response
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('COMPLETED');
    });
  });

  describe('Cancel Payout', () => {
    it('should successfully cancel a pending payout', async () => {
      // Mock DB responses
      const mockPayout = {
        id: 'payout-123',
        educatorId: 'test-educator-id',
        amount: 800,
        status: 'PENDING',
        notes: '',
        metadata: {},
        payoutNumber: 'PAYOUT-2023-000001' 
      };

      const mockCancelledPayout = {
        ...mockPayout,
        status: 'CANCELLED'
      };

      prisma.payout.findUnique.mockResolvedValue(mockPayout);
      prisma.payout.update.mockResolvedValue(mockCancelledPayout);

      // Execute request
      const response = await request(app)
        .post('/api/payouts/payout-123/cancel')
        .set('Authorization', 'Bearer fake-token');

      // Assert response
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
    });
  });
});
