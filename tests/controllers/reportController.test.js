const reportController = require('../../src/controllers/reportController');
const reportingService = require('../../src/services/reportingService');
const { AppError } = require('../../src/middleware/errorHandler');

// Mock dependencies
jest.mock('../../src/services/reportingService');

describe('Report Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      user: {
        id: 'user123',
        role: 'ADMIN' // Default to admin for most tests
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      sendFile: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('generateFinancialReport', () => {
    it('should generate a financial report with no filters for admins', async () => {
      // Mock data
      const mockReport = {
        summary: {
          totalPayments: 1000,
          totalRefunds: 200
        },
        reportGenerated: new Date(),
        period: { from: null, to: null }
      };
      
      // Mock service response
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      
      // Call the controller
      await reportController.generateFinancialReport(req, res, next);
      
      // Assertions
      expect(reportingService.generateFinancialReport).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockReport
      });
    });
    
    it('should apply filters when provided', async () => {
      // Mock data with filters
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        educatorId: 'educator123'
      };
      
      const mockReport = {
        summary: {
          totalPayments: 500,
          totalRefunds: 100
        },
        reportGenerated: new Date(),
        period: {
          from: new Date('2023-01-01'),
          to: new Date('2023-01-31')
        }
      };
      
      // Mock service response
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      
      // Call the controller
      await reportController.generateFinancialReport(req, res, next);
      
      // Assertions
      expect(reportingService.generateFinancialReport).toHaveBeenCalledWith({
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        educatorId: 'educator123'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it('should deny access to non-admin users', async () => {
      // Set user role to non-admin
      req.user.role = 'USER';
      
      // Call the controller
      await reportController.generateFinancialReport(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(reportingService.generateFinancialReport).not.toHaveBeenCalled();
    });
    
    it('should allow educators to generate reports only for themselves', async () => {
      // Set user as educator
      req.user.role = 'EDUCATOR';
      req.user.id = 'educator123';
      
      const mockReport = {
        summary: {
          totalPayments: 500
        },
        educatorStats: {
          educatorId: 'educator123',
          totalEarnings: 400
        },
        reportGenerated: new Date()
      };
      
      // Mock service response
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      
      // Call the controller
      await reportController.generateFinancialReport(req, res, next);
      
      // Assertions
      expect(reportingService.generateFinancialReport).toHaveBeenCalledWith({
        educatorId: 'educator123'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it('should prevent educators from accessing other educator reports', async () => {
      // Set user as educator
      req.user.role = 'EDUCATOR';
      req.user.id = 'educator123';
      req.query.educatorId = 'different-educator';
      
      // Call the controller
      await reportController.generateFinancialReport(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(reportingService.generateFinancialReport).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Mock error
      const error = new Error('Service error');
      reportingService.generateFinancialReport.mockRejectedValue(error);
      
      // Call the controller
      await reportController.generateFinancialReport(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('downloadFinancialReportPDF', () => {
    it('should generate and send a PDF report for admins', async () => {
      // Mock report data
      const mockReport = {
        summary: { totalPayments: 1000 },
        dailyStats: [],
        topCourses: [],
        reportGenerated: new Date()
      };
      
      const mockPdfResult = {
        filePath: '/path/to/report.pdf',
        filename: 'financial_report_2023-01-31.pdf'
      };
      
      // Mock service responses
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      reportingService.generateFinancialReportPDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback());
      
      // Call the controller
      await reportController.downloadFinancialReportPDF(req, res, next);
      
      // Assertions
      expect(reportingService.generateFinancialReport).toHaveBeenCalled();
      expect(reportingService.generateFinancialReportPDF).toHaveBeenCalledWith(mockReport);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename=${mockPdfResult.filename}`
      );
      expect(res.sendFile).toHaveBeenCalledWith(
        mockPdfResult.filePath,
        expect.any(Function)
      );
      expect(reportingService.deleteTempPDF).toHaveBeenCalledWith(mockPdfResult.filePath);
    });
    
    it('should apply filters when provided for PDF generation', async () => {
      // Mock data with filters
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31'
      };
      
      const mockReport = {
        summary: { totalPayments: 500 },
        reportGenerated: new Date(),
        period: {
          from: new Date('2023-01-01'),
          to: new Date('2023-01-31')
        }
      };
      
      const mockPdfResult = {
        filePath: '/path/to/report.pdf',
        filename: 'financial_report_2023-01-31.pdf'
      };
      
      // Mock service responses
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      reportingService.generateFinancialReportPDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback());
      
      // Call the controller
      await reportController.downloadFinancialReportPDF(req, res, next);
      
      // Assertions
      expect(reportingService.generateFinancialReport).toHaveBeenCalledWith({
        startDate: '2023-01-01',
        endDate: '2023-01-31'
      });
    });
    
    it('should deny PDF access to non-admin users', async () => {
      // Set user role to non-admin
      req.user.role = 'USER';
      
      // Call the controller
      await reportController.downloadFinancialReportPDF(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(reportingService.generateFinancialReport).not.toHaveBeenCalled();
    });
    
    it('should allow educators to download reports only for themselves', async () => {
      // Set user as educator
      req.user.role = 'EDUCATOR';
      req.user.id = 'educator123';
      
      const mockReport = {
        summary: { totalPayments: 500 },
        educatorStats: { educatorId: 'educator123' },
        reportGenerated: new Date()
      };
      
      const mockPdfResult = {
        filePath: '/path/to/report.pdf',
        filename: 'financial_report_2023-01-31.pdf'
      };
      
      // Mock service responses
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      reportingService.generateFinancialReportPDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback());
      
      // Call the controller
      await reportController.downloadFinancialReportPDF(req, res, next);
      
      // Assertions
      expect(reportingService.generateFinancialReport).toHaveBeenCalledWith({
        educatorId: 'educator123'
      });
      expect(res.sendFile).toHaveBeenCalled();
    });
    
    it('should handle error during PDF sending', async () => {
      // Mock report and error
      const mockReport = { summary: { totalPayments: 1000 } };
      const mockPdfResult = {
        filePath: '/path/to/report.pdf',
        filename: 'financial_report_2023-01-31.pdf'
      };
      const error = new Error('File error');
      
      // Mock service responses
      reportingService.generateFinancialReport.mockResolvedValue(mockReport);
      reportingService.generateFinancialReportPDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback(error));
      
      // Call the controller
      await reportController.downloadFinancialReportPDF(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(reportingService.deleteTempPDF).toHaveBeenCalledWith(mockPdfResult.filePath);
    });
  });

  describe('getEducatorEarningsReport', () => {
    it('should return earnings report for an admin requesting any educator', async () => {
      // Mock data
      req.params.educatorId = 'educator123';
      const mockEarningsReport = {
        educatorId: 'educator123',
        totalEarnings: 5000,
        totalRefundedEarnings: 200
      };
      
      // Mock service response
      reportingService.getEducatorEarningsReport.mockResolvedValue(mockEarningsReport);
      
      // Call the controller
      await reportController.getEducatorEarningsReport(req, res, next);
      
      // Assertions
      expect(reportingService.getEducatorEarningsReport).toHaveBeenCalledWith('educator123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockEarningsReport
      });
    });
    
    it('should allow educators to view their own earnings', async () => {
      // Set user as educator viewing their own report
      req.user.role = 'EDUCATOR';
      req.user.id = 'educator123';
      req.params.educatorId = 'educator123';
      
      const mockEarningsReport = {
        educatorId: 'educator123',
        totalEarnings: 5000
      };
      
      // Mock service response
      reportingService.getEducatorEarningsReport.mockResolvedValue(mockEarningsReport);
      
      // Call the controller
      await reportController.getEducatorEarningsReport(req, res, next);
      
      // Assertions
      expect(reportingService.getEducatorEarningsReport).toHaveBeenCalledWith('educator123');
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it('should deny access to educators trying to view other educator earnings', async () => {
      // Set user as educator trying to view another educator's report
      req.user.role = 'EDUCATOR';
      req.user.id = 'educator123';
      req.params.educatorId = 'different-educator';
      
      // Call the controller
      await reportController.getEducatorEarningsReport(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(reportingService.getEducatorEarningsReport).not.toHaveBeenCalled();
    });
    
    it('should deny access to regular users', async () => {
      // Set user as regular user
      req.user.role = 'USER';
      req.params.educatorId = 'educator123';
      
      // Call the controller
      await reportController.getEducatorEarningsReport(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(reportingService.getEducatorEarningsReport).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Mock error
      req.params.educatorId = 'educator123';
      const error = new Error('Service error');
      reportingService.getEducatorEarningsReport.mockRejectedValue(error);
      
      // Call the controller
      await reportController.getEducatorEarningsReport(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
