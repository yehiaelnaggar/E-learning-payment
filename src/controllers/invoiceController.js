const invoiceService = require('../services/invoiceService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get a single invoice by ID
 */
const getInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await invoiceService.getInvoiceById(invoiceId);
    
    // Check if user has permission to view this invoice
    if (req.user.role !== 'ADMIN' && invoice.transaction.userId !== req.user.id) {
      return next(new AppError('You do not have permission to view this invoice', 403));
    }
    
    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all invoices for the current user
 */
const getUserInvoices = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await invoiceService.getInvoicesByUser(userId, page, limit);
    
    res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download invoice as PDF
 */
const downloadInvoicePdf = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await invoiceService.getInvoiceById(invoiceId);
    
    // Check if user has permission to download this invoice
    if (req.user.role !== 'ADMIN' && invoice.transaction.userId !== req.user.id) {
      return next(new AppError('You do not have permission to download this invoice', 403));
    }
    
    const pdfResult = await invoiceService.generateInvoicePDF(invoiceId);
    
    res.setHeader('Content-Disposition', `attachment; filename=${pdfResult.filename}`);
    
    res.sendFile(pdfResult.filePath, (err) => {
      // Clean up the temp file after sending or in case of error
      invoiceService.deleteTempPDF(pdfResult.filePath);
      if (err) {
        // Pass the exact error from res.sendFile to match the test
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new invoice
 */
const createInvoice = async (req, res, next) => {
  try {
    const invoiceData = req.body;
    const newInvoice = await invoiceService.createInvoice(invoiceData);
    
    res.status(201).json({
      success: true,
      data: newInvoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update invoice status
 */
const updateInvoiceStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return next(new AppError('Status is required', 400));
    }
    
    const updatedInvoice = await invoiceService.updateInvoiceStatus(transactionId, status);
    
    res.status(200).json({
      success: true,
      data: updatedInvoice
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvoice,
  getUserInvoices,
  downloadInvoicePdf,
  createInvoice,
  updateInvoiceStatus
};
