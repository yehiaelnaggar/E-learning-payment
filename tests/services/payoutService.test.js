const payoutService = require('../../src/services/payoutService');
const prisma = require('../../src/config/db');
const stripe = require('../../src/config/stripe');
const { AppError } = require('../../src/middleware/errorHandler');
const { notifyUserService } = require('../../src/utils/serviceNotifier');
const { logger, auditLogger } = require('../../src/utils/logger');

// Mock dependencies
jest.mock('../../src/config/db');
jest.mock('../../src/config/stripe');
jest.mock('../../src/utils/serviceNotifier');
jest.mock('../../src/utils/logger');

describe('Payout Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEducatorPendingEarnings', () => {
    it('should return pending earnings for an educator', async () => {
      // Mock data
      const educatorId = 'educator123';
      const mockEarnings = [{ pendingAmount: 1000, pendingTransactions: 5, oldestTransaction: new Date() }];
      const mockEarningsByMonth = [
        { month: new Date(), netAmount: 500, salesCount: 10, refundCount: 1 },
        { month: new Date(), netAmount: 500, salesCount: 5, refundCount: 0 }
      ];

      // Setup mocks
      prisma.$queryRaw.mockResolvedValueOnce(mockEarnings);
      prisma.$queryRaw.mockResolvedValueOnce(mockEarningsByMonth);

      // Execute the function being tested
      const result = await payoutService.getEducatorPendingEarnings(educatorId);

      // Assertions
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        pendingAmount: 1000,
        pendingTransactions: 5,
        oldestTransaction: mockEarnings[0].oldestTransaction,
        earningsByMonth: expect.arrayContaining([
          expect.objectContaining({ netAmount: 500 })
        ])
      });
    });

    it('should handle database errors gracefully', async () => {
      // Setup mock to throw error
      prisma.$queryRaw.mockRejectedValueOnce(new Error('Database error'));

      // Execute and expect error
      await expect(payoutService.getEducatorPendingEarnings('educator123'))
        .rejects
        .toThrow(AppError);
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return zero values when no results found', async () => {
      // Mock empty results
      prisma.$queryRaw.mockResolvedValueOnce([{}]);
      prisma.$queryRaw.mockResolvedValueOnce([]);

      // Execute
      const result = await payoutService.getEducatorPendingEarnings('educator123');

      // Assertions
      expect(result.pendingAmount).toBe(0);
      expect(result.pendingTransactions).toBe(0);
      expect(result.earningsByMonth).toEqual([]);
    });
  });

  describe('requestPayout', () => {
    it('should create a payout request successfully', async () => {
      // Mock data
      const educatorId = 'educator123';
      const payoutData = {
        amount: 500,
        bankDetails: { accountNumber: '****1234' },
        paymentMethod: 'bank_transfer',
        notes: 'Monthly payout'
      };
      const mockPendingEarnings = { pendingAmount: 1000 };
      const mockPeriodStart = { createdAt: new Date('2023-01-01') };
      const mockPayout = {
        id: 'payout123',
        payoutNumber: 'PAYOUT-2023-000001',
        amount: 500
      };

      // Setup mocks
      jest.spyOn(payoutService, 'getEducatorPendingEarnings')
        .mockResolvedValueOnce(mockPendingEarnings);
      prisma.payout.count.mockResolvedValueOnce(0);
      prisma.transaction.findFirst.mockResolvedValueOnce(mockPeriodStart);
      prisma.payout.create.mockResolvedValueOnce(mockPayout);

      // Execute
      const result = await payoutService.requestPayout(educatorId, payoutData);

      // Assertions
      expect(result).toEqual(mockPayout);
      expect(prisma.payout.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          educatorId,
          amount: payoutData.amount,
          paymentMethod: payoutData.paymentMethod,
          status: 'PENDING',
        })
      });
      expect(auditLogger.log).toHaveBeenCalledWith(
        'PAYOUT_REQUESTED',
        educatorId,
        expect.any(String),
        null,
        expect.any(Object)
      );
    });

    it('should throw an error if insufficient balance', async () => {
      // Mock data
      const educatorId = 'educator123';
      const payoutData = { amount: 1000 };
      const mockPendingEarnings = { pendingAmount: 500 }; // Less than requested

      // Setup mocks
      jest.spyOn(payoutService, 'getEducatorPendingEarnings')
        .mockResolvedValueOnce(mockPendingEarnings);

      // Execute and expect error
      await expect(payoutService.requestPayout(educatorId, payoutData))
        .rejects
        .toThrow(/Insufficient balance/);
    });
  });

  describe('processPayout', () => {
    it('should process a payout successfully', async () => {
      // Mock data
      const payoutId = 'payout123';
      const adminId = 'admin456';
      const mockPayout = {
        id: payoutId,
        educatorId: 'educator123',
        amount: 500,
        status: 'PENDING',
        paymentMethod: 'bank_transfer',
        bankDetails: {},
        metadata: {}
      };
      const mockTransactions = [
        { id: 'tx1', type: 'PAYMENT', educatorEarnings: 300, status: 'COMPLETED' },
        { id: 'tx2', type: 'PAYMENT', educatorEarnings: 200, status: 'COMPLETED' }
      ];
      const mockUpdatedPayout = { 
        ...mockPayout, 
        status: 'COMPLETED',
        transactions: mockTransactions
      };

      // Setup mocks
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);
      prisma.transaction.findMany.mockResolvedValueOnce(mockTransactions);
      prisma.$transaction.mockResolvedValueOnce([]);
      prisma.payout.findUnique.mockResolvedValueOnce(mockUpdatedPayout);

      // Execute
      const result = await payoutService.processPayout(payoutId, adminId);

      // Assertions
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notifyUserService).toHaveBeenCalledWith({
        userId: mockPayout.educatorId,
        action: 'PAYOUT_COMPLETED',
        data: expect.objectContaining({ payoutId })
      });
      expect(auditLogger.log).toHaveBeenCalledWith(
        'PAYOUT_PROCESSED',
        adminId,
        expect.any(String),
        null,
        expect.any(Object)
      );
      expect(result).toEqual(mockUpdatedPayout);
    });

    it('should handle Stripe integration for stripe payment method', async () => {
      // Mock data
      const payoutId = 'payout123';
      const adminId = 'admin456';
      const mockPayout = {
        id: payoutId,
        educatorId: 'educator123',
        amount: 500,
        status: 'PENDING',
        paymentMethod: 'stripe',
        bankDetails: { stripeAccountId: 'acct_123' },
        metadata: {}
      };
      const mockTransactions = [
        { id: 'tx1', type: 'PAYMENT', educatorEarnings: 500, status: 'COMPLETED' }
      ];
      const mockStripeTransfer = {
        id: 'tr_123',
        status: 'succeeded'
      };
      const mockUpdatedPayout = { 
        ...mockPayout, 
        status: 'COMPLETED',
        transactions: mockTransactions
      };

      // Setup mocks
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);
      prisma.transaction.findMany.mockResolvedValueOnce(mockTransactions);
      prisma.payout.update.mockResolvedValueOnce({});
      prisma.$transaction.mockResolvedValueOnce([]);
      prisma.payout.findUnique.mockResolvedValueOnce(mockUpdatedPayout);
      stripe.transfers.create.mockResolvedValueOnce(mockStripeTransfer);

      // Execute
      const result = await payoutService.processPayout(payoutId, adminId);

      // Assertions
      expect(stripe.transfers.create).toHaveBeenCalledWith({
        amount: expect.any(Number),
        currency: expect.any(String),
        destination: mockPayout.bankDetails.stripeAccountId,
        description: expect.any(String)
      });
    });

    it('should throw an error if payout not found', async () => {
      prisma.payout.findUnique.mockResolvedValueOnce(null);

      await expect(payoutService.processPayout('invalid', 'admin123'))
        .rejects
        .toThrow(/Payout not found/);
    });

    it('should throw an error if payout status is not PENDING', async () => {
      const mockPayout = {
        id: 'payout123',
        status: 'COMPLETED'
      };
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);

      await expect(payoutService.processPayout('payout123', 'admin123'))
        .rejects
        .toThrow(/Cannot process/);
    });

    it('should mark payout as failed if processing fails', async () => {
      // Mock data
      const payoutId = 'payout123';
      const adminId = 'admin456';
      const mockPayout = {
        id: payoutId,
        educatorId: 'educator123',
        amount: 500,
        status: 'PENDING',
        paymentMethod: 'stripe',
        bankDetails: { stripeAccountId: 'acct_123' },
        metadata: {},
        notes: ''
      };
      const mockTransactions = [
        { id: 'tx1', type: 'PAYMENT', educatorEarnings: 500, status: 'COMPLETED' }
      ];

      // Setup mocks
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);
      prisma.transaction.findMany.mockResolvedValueOnce(mockTransactions);
      prisma.payout.update.mockResolvedValueOnce({});
      stripe.transfers.create.mockRejectedValueOnce(new Error('Stripe error'));

      // Execute and expect error
      await expect(payoutService.processPayout(payoutId, adminId))
        .rejects
        .toThrow(/Payout processing failed/);

      // Verify failure was recorded
      expect(prisma.payout.update).toHaveBeenCalledWith({
        where: { id: payoutId },
        data: expect.objectContaining({
          status: 'FAILED'
        })
      });
    });
  });

  describe('getPayoutById', () => {
    it('should return a payout with its transactions', async () => {
      // Mock data
      const payoutId = 'payout123';
      const mockPayout = {
        id: payoutId,
        transactions: [{ id: 'tx1' }, { id: 'tx2' }]
      };

      // Setup mock
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);

      // Execute
      const result = await payoutService.getPayoutById(payoutId);

      // Assertions
      expect(result).toEqual(mockPayout);
      expect(prisma.payout.findUnique).toHaveBeenCalledWith({
        where: { id: payoutId },
        include: {
          transactions: {
            select: expect.any(Object)
          }
        }
      });
    });

    it('should throw error if payout not found', async () => {
      prisma.payout.findUnique.mockResolvedValueOnce(null);

      await expect(payoutService.getPayoutById('invalid'))
        .rejects
        .toThrow(/Payout not found/);
    });
  });

  describe('getEducatorPayouts', () => {
    it('should return educator payouts with pagination', async () => {
      // Mock data
      const educatorId = 'educator123';
      const mockPayouts = [{ id: 'payout1' }, { id: 'payout2' }];
      const mockTotal = 5;

      // Setup mocks
      prisma.payout.findMany.mockResolvedValueOnce(mockPayouts);
      prisma.payout.count.mockResolvedValueOnce(mockTotal);

      // Execute
      const result = await payoutService.getEducatorPayouts(educatorId, 1, 2);

      // Assertions
      expect(result).toEqual({
        payouts: mockPayouts,
        pagination: {
          total: mockTotal,
          pages: 3,
          page: 1,
          limit: 2
        }
      });
    });
  });

  describe('getAllPayouts', () => {
    it('should return all payouts with filters and pagination', async () => {
      // Mock data
      const filters = {
        status: 'COMPLETED',
        educatorId: 'educator123',
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      };
      const mockPayouts = [{ id: 'payout1' }, { id: 'payout2' }];
      const mockTotal = 2;

      // Setup mocks
      prisma.payout.findMany.mockResolvedValueOnce(mockPayouts);
      prisma.payout.count.mockResolvedValueOnce(mockTotal);

      // Execute
      const result = await payoutService.getAllPayouts(filters, 1, 10);

      // Assertions
      expect(result).toEqual({
        payouts: mockPayouts,
        pagination: {
          total: mockTotal,
          pages: 1,
          page: 1,
          limit: 10
        }
      });
      expect(prisma.payout.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: filters.status,
          educatorId: filters.educatorId
        }),
        orderBy: { requestedAt: 'desc' },
        skip: 0,
        take: 10
      });
    });
  });

  describe('cancelPayout', () => {
    it('should cancel a payout successfully', async () => {
      // Mock data
      const payoutId = 'payout123';
      const userId = 'educator123';
      const mockPayout = {
        id: payoutId,
        educatorId: userId,
        status: 'PENDING',
        notes: '',
        metadata: {},
        payoutNumber: 'PAYOUT-2023-000001',
        amount: 500
      };
      const mockUpdatedPayout = {
        ...mockPayout,
        status: 'CANCELLED'
      };

      // Setup mocks
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);
      prisma.payout.update.mockResolvedValueOnce(mockUpdatedPayout);

      // Execute
      const result = await payoutService.cancelPayout(payoutId, userId, false);

      // Assertions
      expect(result).toEqual(mockUpdatedPayout);
      expect(prisma.payout.update).toHaveBeenCalledWith({
        where: { id: payoutId },
        data: expect.objectContaining({
          status: 'CANCELLED'
        })
      });
      expect(auditLogger.log).toHaveBeenCalledWith(
        'PAYOUT_CANCELLED',
        userId,
        expect.any(String),
        null,
        expect.any(Object)
      );
    });

    it('should allow admin to cancel any payout', async () => {
      // Mock data
      const payoutId = 'payout123';
      const adminId = 'admin456';
      const educatorId = 'educator123';
      const mockPayout = {
        id: payoutId,
        educatorId,
        status: 'PENDING',
        notes: '',
        metadata: {},
        payoutNumber: 'PAYOUT-2023-000001',
        amount: 500
      };

      // Setup mocks
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);
      prisma.payout.update.mockResolvedValueOnce({ ...mockPayout, status: 'CANCELLED' });

      // Execute (isAdmin = true)
      const result = await payoutService.cancelPayout(payoutId, adminId, true);

      // Assert
      expect(result.status).toBe('CANCELLED');
      expect(auditLogger.log).toHaveBeenCalled();
    });

    it('should throw an error if payout not found', async () => {
      prisma.payout.findUnique.mockResolvedValueOnce(null);

      await expect(payoutService.cancelPayout('invalid', 'user123', false))
        .rejects
        .toThrow(/Payout not found/);
    });

    it('should throw an error if payout status is not PENDING', async () => {
      const mockPayout = {
        id: 'payout123',
        status: 'COMPLETED'
      };
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);

      await expect(payoutService.cancelPayout('payout123', 'user123', false))
        .rejects
        .toThrow(/Cannot cancel/);
    });

    it('should throw an error if unauthorized user tries to cancel', async () => {
      const mockPayout = {
        id: 'payout123',
        educatorId: 'educator123',
        status: 'PENDING'
      };
      prisma.payout.findUnique.mockResolvedValueOnce(mockPayout);

      await expect(payoutService.cancelPayout('payout123', 'different-user', false))
        .rejects
        .toThrow(/not authorized/);
    });
  });
});
