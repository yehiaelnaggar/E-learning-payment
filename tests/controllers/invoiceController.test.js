const invoiceController = require('../../src/controllers/invoiceController');
const invoiceService = require('../../src/services/invoiceService');
const { AppError } = require('../../src/middleware/errorHandler');

// Mock dependencies
jest.mock('../../src/services/invoiceService');

describe('Invoice Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      user: {
        id: 'user123',
        role: 'USER'
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

  describe('getInvoice', () => {
    it('should return an invoice if user is authorized', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'user123'
        }
      };
      
      // Mock service response
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      
      // Call the controller
      await invoiceController.getInvoice(req, res, next);
      
      // Assertions
      expect(invoiceService.getInvoiceById).toHaveBeenCalledWith('inv123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockInvoice
      });
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should call next with error if user is not authorized', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'differentUser' // Different from req.user.id
        }
      };
      
      // Mock service response
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      
      // Call the controller
      await invoiceController.getInvoice(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(res.status).not.toHaveBeenCalled();
    });
    
    it('should allow admin to view any invoice', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      req.user.role = 'ADMIN';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'differentUser' // Different from req.user.id
        }
      };
      
      // Mock service response
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      
      // Call the controller
      await invoiceController.getInvoice(req, res, next);
      
      // Assertions
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should call next with any service errors', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const error = new Error('Service error');
      
      // Mock service error
      invoiceService.getInvoiceById.mockRejectedValue(error);
      
      // Call the controller
      await invoiceController.getInvoice(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('getUserInvoices', () => {
    it('should return the user\'s invoices', async () => {
      // Mock data
      const mockResult = {
        invoices: [{ id: 'inv123' }, { id: 'inv456' }],
        pagination: {
          total: 2,
          pages: 1,
          page: 1,
          limit: 10
        }
      };
      
      // Mock service response
      invoiceService.getInvoicesByUser.mockResolvedValue(mockResult);
      
      // Call the controller
      await invoiceController.getUserInvoices(req, res, next);
      
      // Assertions
      expect(invoiceService.getInvoicesByUser).toHaveBeenCalledWith('user123', 1, 10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult.invoices,
        pagination: mockResult.pagination
      });
    });
    
    it('should use pagination parameters when provided', async () => {
      // Mock data
      req.query.page = '2';
      req.query.limit = '5';
      const mockResult = {
        invoices: [{ id: 'inv123' }],
        pagination: {
          total: 6,
          pages: 2,
          page: 2,
          limit: 5
        }
      };
      
      // Mock service response
      invoiceService.getInvoicesByUser.mockResolvedValue(mockResult);
      
      // Call the controller
      await invoiceController.getUserInvoices(req, res, next);
      
      // Assertions
      expect(invoiceService.getInvoicesByUser).toHaveBeenCalledWith('user123', 2, 5);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it('should call next with any service errors', async () => {
      // Mock error
      const error = new Error('Service error');
      invoiceService.getInvoicesByUser.mockRejectedValue(error);
      
      // Call the controller
      await invoiceController.getUserInvoices(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('downloadInvoicePdf', () => {
    it('should send the PDF file if user is authorized', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'user123'
        }
      };
      const mockPdfResult = {
        filePath: '/path/to/invoice.pdf',
        filename: 'invoice_123.pdf'
      };
      
      // Mock service responses
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      invoiceService.generateInvoicePDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback());
      
      // Call the controller
      await invoiceController.downloadInvoicePdf(req, res, next);
      
      // Assertions
      expect(invoiceService.getInvoiceById).toHaveBeenCalledWith('inv123');
      expect(invoiceService.generateInvoicePDF).toHaveBeenCalledWith('inv123');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename=${mockPdfResult.filename}`
      );
      expect(res.sendFile).toHaveBeenCalledWith(
        mockPdfResult.filePath,
        expect.any(Function)
      );
      expect(invoiceService.deleteTempPDF).toHaveBeenCalledWith(mockPdfResult.filePath);
    });
    
    it('should call next with error if user is not authorized', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'differentUser' // Different from req.user.id
        }
      };
      
      // Mock service response
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      
      // Call the controller
      await invoiceController.downloadInvoicePdf(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(invoiceService.generateInvoicePDF).not.toHaveBeenCalled();
    });
    
    it('should allow admin to download any invoice', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      req.user.role = 'ADMIN';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'differentUser' // Different from req.user.id
        }
      };
      const mockPdfResult = {
        filePath: '/path/to/invoice.pdf',
        filename: 'invoice_123.pdf'
      };
      
      // Mock service responses
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      invoiceService.generateInvoicePDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback());
      
      // Call the controller
      await invoiceController.downloadInvoicePdf(req, res, next);
      
      // Assertions
      expect(invoiceService.generateInvoicePDF).toHaveBeenCalledWith('inv123');
      expect(res.sendFile).toHaveBeenCalled();
    });
    
    it('should handle error during PDF sending', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const mockInvoice = {
        id: 'inv123',
        transaction: {
          userId: 'user123'
        }
      };
      const mockPdfResult = {
        filePath: '/path/to/invoice.pdf',
        filename: 'invoice_123.pdf'
      };
      const error = new Error('File error');
      
      // Mock service responses
      invoiceService.getInvoiceById.mockResolvedValue(mockInvoice);
      invoiceService.generateInvoicePDF.mockResolvedValue(mockPdfResult);
      res.sendFile = jest.fn((path, callback) => callback(error));
      
      // Call the controller
      await invoiceController.downloadInvoicePdf(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error); // This should match the exact error object passed in
      expect(invoiceService.deleteTempPDF).toHaveBeenCalledWith(mockPdfResult.filePath);
    });
    
    it('should call next with any service errors', async () => {
      // Mock data
      req.params.invoiceId = 'inv123';
      const error = new Error('Service error');
      
      // Mock service error
      invoiceService.getInvoiceById.mockRejectedValue(error);
      
      // Call the controller
      await invoiceController.downloadInvoicePdf(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('createInvoice', () => {
    it('should create an invoice successfully', async () => {
      // Mock data
      req.body = {
        transactionId: 'tx123',
        subtotal: 100,
        discount: 10,
        tax: 5,
        status: 'ISSUED',
        billingInfo: { name: 'John Doe', email: 'john@example.com' },
        notes: 'Test invoice',
      };
      const mockInvoice = {
        id: 'inv123',
        ...req.body,
        total: 95
      };
      
      // Mock service response
      invoiceService.createInvoice.mockResolvedValue(mockInvoice);
      
      // Call the controller
      await invoiceController.createInvoice(req, res, next);
      
      // Assertions
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockInvoice
      });
    });
    
    it('should call next with any service errors', async () => {
      // Mock data
      req.body = {
        transactionId: 'tx123',
        subtotal: 100
      };
      const error = new Error('Service error');
      
      // Mock service error
      invoiceService.createInvoice.mockRejectedValue(error);
      
      // Call the controller
      await invoiceController.createInvoice(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('updateInvoiceStatus', () => {
    it('should update invoice status successfully', async () => {
      // Mock data
      req.params.transactionId = 'tx123';
      req.body = {
        status: 'PAID'
      };
      const mockUpdatedInvoice = {
        id: 'inv123',
        transactionId: 'tx123',
        status: 'PAID',
        paidAt: new Date()
      };
      
      // Mock service response
      invoiceService.updateInvoiceStatus.mockResolvedValue(mockUpdatedInvoice);
      
      // Call the controller
      await invoiceController.updateInvoiceStatus(req, res, next);
      
      // Assertions
      expect(invoiceService.updateInvoiceStatus).toHaveBeenCalledWith('tx123', 'PAID');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockUpdatedInvoice
      });
    });
    
    it('should call next with error if status is missing', async () => {
      // Mock data
      req.params.transactionId = 'tx123';
      req.body = {}; // Missing status
      
      // Call the controller
      await invoiceController.updateInvoiceStatus(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(invoiceService.updateInvoiceStatus).not.toHaveBeenCalled();
    });
    
    it('should call next with any service errors', async () => {
      // Mock data
      req.params.transactionId = 'tx123';
      req.body = {
        status: 'PAID'
      };
      const error = new Error('Service error');
      
      // Mock service error
      invoiceService.updateInvoiceStatus.mockRejectedValue(error);
      
      // Call the controller
      await invoiceController.updateInvoiceStatus(req, res, next);
      
      // Assertions
      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});