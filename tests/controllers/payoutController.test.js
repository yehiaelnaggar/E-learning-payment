const payoutController = require('../../src/controllers/payoutController');
const payoutService = require('../../src/services/payoutService');
const { AppError } = require('../../src/middleware/errorHandler');

// Mock dependencies
jest.mock('../../src/services/payoutService');

describe('Payout Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      body: {},
      user: {
        id: 'user123',
        role: 'EDUCATOR'
      },
      ip: '127.0.0.1'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('getEducatorPendingEarnings', () => {
    it('should return pending earnings for an educator', async () => {
      // Mock data
      req.params.educatorId = 'user123'; // Same as logged-in user
      const mockEarnings = { pendingAmount: 1000, pendingTransactions: 5 };
      
      // Mock service
      payoutService.getEducatorPendingEarnings.mockResolvedValueOnce(mockEarnings);
      
      // Execute
      await payoutController.getEducatorPendingEarnings(req, res, next);
      
      // Assert
      expect(payoutService.getEducatorPendingEarnings).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockEarnings
      });
    });

    it('should allow admin to view any educator\'s earnings', async () => {
      // Mock data
      req.params.educatorId = 'educator789';
      req.user.role = 'ADMIN';
      const mockEarnings = { pendingAmount: 1000, pendingTransactions: 5 };
      
      // Mock service
      payoutService.getEducatorPendingEarnings.mockResolvedValueOnce(mockEarnings);
      
      // Execute
      await payoutController.getEducatorPendingEarnings(req, res, next);
      
      // Assert
      expect(payoutService.getEducatorPendingEarnings).toHaveBeenCalledWith('educator789');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with error if unauthorized', async () => {
      // Mock data for different user
      req.params.educatorId = 'educator789';
      
      // Execute
      await payoutController.getEducatorPendingEarnings(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(payoutService.getEducatorPendingEarnings).not.toHaveBeenCalled();
    });

    it('should call next with any service errors', async () => {
      // Mock data
      req.params.educatorId = 'user123';
      const error = new Error('Service error');
      
      // Mock service error
      payoutService.getEducatorPendingEarnings.mockRejectedValueOnce(error);
      
      // Execute
      await payoutController.getEducatorPendingEarnings(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('requestPayout', () => {
    it('should request a payout successfully', async () => {
      // Mock data
      req.params.educatorId = 'user123'; // Same as logged-in user
      req.body = {
        amount: 500,
        bankDetails: { account: '****1234' },
        paymentMethod: 'bank_transfer'
      };
      const mockPayout = {
        id: 'payout123',
        amount: 500,
        status: 'PENDING'
      };
      
      // Mock service
      payoutService.requestPayout.mockResolvedValueOnce(mockPayout);
      
      // Execute
      await payoutController.requestPayout(req, res, next);
      
      // Assert
      expect(payoutService.requestPayout).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          amount: 500,
          bankDetails: { account: '****1234' },
          paymentMethod: 'bank_transfer',
          ipAddress: '127.0.0.1'
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.any(String),
        data: mockPayout
      });
    });

    it('should call next with error if user is not the educator', async () => {
      // Mock data for different user
      req.params.educatorId = 'educator789';
      
      // Execute
      await payoutController.requestPayout(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(payoutService.requestPayout).not.toHaveBeenCalled();
    });

    it('should call next with any service errors', async () => {
      // Mock data
      req.params.educatorId = 'user123';
      const error = new Error('Service error');
      
      // Mock service error
      payoutService.requestPayout.mockRejectedValueOnce(error);
      
      // Execute
      await payoutController.requestPayout(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('processPayout', () => {
    it('should process a payout successfully for admin', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      req.user.role = 'ADMIN';
      const mockResult = {
        id: 'payout123',
        status: 'COMPLETED'
      };
      
      // Mock service
      payoutService.processPayout.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.processPayout(req, res, next);
      
      // Assert
      expect(payoutService.processPayout).toHaveBeenCalledWith('payout123', 'user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.any(String),
        data: mockResult
      });
    });

    it('should call next with error if user is not admin', async () => {
      // Execute
      await payoutController.processPayout(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(payoutService.processPayout).not.toHaveBeenCalled();
    });
  });

  describe('getPayoutById', () => {
    it('should get payout details for the owning educator', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      const mockPayout = {
        id: 'payout123',
        educatorId: 'user123', // Same as logged-in user
        amount: 500
      };
      
      // Mock service
      payoutService.getPayoutById.mockResolvedValueOnce(mockPayout);
      
      // Execute
      await payoutController.getPayoutById(req, res, next);
      
      // Assert
      expect(payoutService.getPayoutById).toHaveBeenCalledWith('payout123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockPayout
      });
    });

    it('should allow admin to view any payout', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      req.user.role = 'ADMIN';
      const mockPayout = {
        id: 'payout123',
        educatorId: 'educator789', // Different from logged-in user
        amount: 500
      };
      
      // Mock service
      payoutService.getPayoutById.mockResolvedValueOnce(mockPayout);
      
      // Execute
      await payoutController.getPayoutById(req, res, next);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with error if unauthorized', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      const mockPayout = {
        id: 'payout123',
        educatorId: 'educator789', // Different from logged-in user
        amount: 500
      };
      
      // Mock service
      payoutService.getPayoutById.mockResolvedValueOnce(mockPayout);
      
      // Execute
      await payoutController.getPayoutById(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('getEducatorPayouts', () => {
    it('should get payouts for the educator', async () => {
      // Mock data
      req.params.educatorId = 'user123'; // Same as logged-in user
      req.query.page = '2';
      req.query.limit = '5';
      const mockResult = {
        payouts: [{ id: 'payout1' }, { id: 'payout2' }],
        pagination: {
          total: 10,
          pages: 2,
          page: 2,
          limit: 5
        }
      };
      
      // Mock service
      payoutService.getEducatorPayouts.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.getEducatorPayouts(req, res, next);
      
      // Assert
      expect(payoutService.getEducatorPayouts).toHaveBeenCalledWith('user123', 2, 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult.payouts,
        pagination: mockResult.pagination
      });
    });

    it('should use default pagination if not provided', async () => {
      // Mock data
      req.params.educatorId = 'user123';
      const mockResult = {
        payouts: [{ id: 'payout1' }],
        pagination: {
          total: 1, 
          pages: 1,
          page: 1,
          limit: 10
        }
      };
      
      // Mock service
      payoutService.getEducatorPayouts.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.getEducatorPayouts(req, res, next);
      
      // Assert
      expect(payoutService.getEducatorPayouts).toHaveBeenCalledWith('user123', 1, 10);
    });

    it('should allow admin to view any educator\'s payouts', async () => {
      // Mock data
      req.params.educatorId = 'educator789'; // Different from logged-in user
      req.user.role = 'ADMIN';
      const mockResult = {
        payouts: [],
        pagination: {}
      };
      
      // Mock service
      payoutService.getEducatorPayouts.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.getEducatorPayouts(req, res, next);
      
      // Assert
      expect(payoutService.getEducatorPayouts).toHaveBeenCalledWith('educator789', 1, 10);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with error if unauthorized', async () => {
      // Mock data for different user
      req.params.educatorId = 'educator789';
      
      // Execute
      await payoutController.getEducatorPayouts(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(payoutService.getEducatorPayouts).not.toHaveBeenCalled();
    });

    it('should call next with any service errors', async () => {
      // Mock data
      req.params.educatorId = 'user123';
      const error = new Error('Service error');
      
      // Mock service error
      payoutService.getEducatorPayouts.mockRejectedValueOnce(error);
      
      // Execute
      await payoutController.getEducatorPayouts(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getAllPayouts', () => {
    it('should get all payouts for admin', async () => {
      // Mock data
      req.user.role = 'ADMIN';
      req.query = {
        status: 'COMPLETED',
        educatorId: 'educator123',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        page: '2',
        limit: '15'
      };
      const mockResult = {
        payouts: [{ id: 'payout1' }, { id: 'payout2' }],
        pagination: {
          total: 30,
          pages: 2,
          page: 2,
          limit: 15
        }
      };
      
      // Mock service
      payoutService.getAllPayouts.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.getAllPayouts(req, res, next);
      
      // Assert
      expect(payoutService.getAllPayouts).toHaveBeenCalledWith(
        {
          status: 'COMPLETED',
          educatorId: 'educator123',
          startDate: '2023-01-01',
          endDate: '2023-12-31'
        },
        2,
        15
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult.payouts,
        pagination: mockResult.pagination
      });
    });

    it('should use default pagination if not provided', async () => {
      // Mock data
      req.user.role = 'ADMIN';
      const mockResult = {
        payouts: [{ id: 'payout1' }],
        pagination: {
          total: 1,
          pages: 1,
          page: 1,
          limit: 10
        }
      };
      
      // Mock service
      payoutService.getAllPayouts.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.getAllPayouts(req, res, next);
      
      // Assert
      expect(payoutService.getAllPayouts).toHaveBeenCalledWith(
        { status: undefined, educatorId: undefined, startDate: undefined, endDate: undefined },
        1,
        10
      );
    });

    it('should call next with error if user is not admin', async () => {
      // Execute
      await payoutController.getAllPayouts(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(payoutService.getAllPayouts).not.toHaveBeenCalled();
    });

    it('should call next with any service errors', async () => {
      // Mock data
      req.user.role = 'ADMIN';
      const error = new Error('Service error');
      
      // Mock service error
      payoutService.getAllPayouts.mockRejectedValueOnce(error);
      
      // Execute
      await payoutController.getAllPayouts(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('cancelPayout', () => {
    it('should cancel a payout successfully for the educator', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      const mockResult = {
        id: 'payout123',
        status: 'CANCELLED'
      };
      
      // Mock service
      payoutService.cancelPayout.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.cancelPayout(req, res, next);
      
      // Assert
      expect(payoutService.cancelPayout).toHaveBeenCalledWith('payout123', 'user123', false);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Payout cancelled successfully',
        data: mockResult
      });
    });

    it('should cancel a payout successfully for admin', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      req.user.role = 'ADMIN';
      const mockResult = {
        id: 'payout123',
        status: 'CANCELLED'
      };
      
      // Mock service
      payoutService.cancelPayout.mockResolvedValueOnce(mockResult);
      
      // Execute
      await payoutController.cancelPayout(req, res, next);
      
      // Assert
      expect(payoutService.cancelPayout).toHaveBeenCalledWith('payout123', 'user123', true);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with any service errors', async () => {
      // Mock data
      req.params.payoutId = 'payout123';
      const error = new Error('Service error');
      
      // Mock service error
      payoutService.cancelPayout.mockRejectedValueOnce(error);
      
      // Execute
      await payoutController.cancelPayout(req, res, next);
      
      // Assert
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
