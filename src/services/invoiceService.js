const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

/**
 * Create a new invoice
 */

const createInvoice = async (invoiceData) => {
  const { transactionId, subtotal, discount = 0, tax = 0, status, billingInfo, notes } = invoiceData;
  
  try {
    // Calculate the total
    const total = subtotal - discount + tax;
    
    // Generate invoice number (formatted as INV-{year}-{sequential number})
    const currentYear = new Date().getFullYear();
    const invoiceCount = await prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: `INV-${currentYear}-`,
        },
      },
    });
    
    const sequentialNumber = (invoiceCount + 1).toString().padStart(6, '0');
    const invoiceNumber = `INV-${currentYear}-${sequentialNumber}`;
    
    // Create the invoice in database
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        transactionId,
        subtotal,
        discount,
        tax,
        total,
        status,
        paidAt: invoiceData.paidAt || null,
        billingInfo,
        notes,
        dueDate: invoiceData.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
      },
    });
    
    return invoice;
  } catch (error) {
    logger.error(`Invoice creation error: ${error.message}`, { error });
    throw new AppError(`Failed to create invoice: ${error.message}`, 500);
  }
};

/**
 * Get an invoice by ID
 */
const getInvoiceById = async (invoiceId) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        transaction: true,
      },
    });
    
    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }
    
    return invoice;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Error retrieving invoice: ${error.message}`, 500);
  }
};

/**
 * Get invoices by user ID
 */
const getInvoicesByUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  try {
    // We need to join with transactions to filter by userId
    const invoices = await prisma.invoice.findMany({
      where: {
        transaction: {
          userId,
        },
      },
      include: {
        transaction: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });
    
    const totalCount = await prisma.invoice.count({
      where: {
        transaction: {
          userId,
        },
      },
    });
    
    return {
      invoices,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    throw new AppError(`Error retrieving invoices: ${error.message}`, 500);
  }
};

/**
 * Update invoice status
 */
const updateInvoiceStatus = async (transactionId, status, notes = null) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { transactionId },
    });
    
    if (!invoice) {
      throw new AppError('Invoice not found for this transaction', 404);
    }
    
    const updateData = {
      status,
    };

    if (notes) {
      updateData.notes = notes;
    }

    if (status === 'PAID') {
      updateData.paidAt = new Date();
    }

    return await prisma.invoice.update({
      where: { id: invoice.id },
      data: updateData,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Error updating invoice: ${error.message}`, 500);
  }
};

/**
 * Generate PDF invoice
 */
const generateInvoicePDF = async (invoiceId) => {
  try {
    const invoice = await getInvoiceById(invoiceId);
    
    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    // Create a folder for temporary PDFs if it doesn't exist
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate a unique filename
    const filename = `invoice_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${uuidv4()}.pdf`;
    const filePath = path.join(tempDir, filename);
    
    // Create the PDF document
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    
    // Add logo (placeholder - you would replace with your own logo)
    // doc.image(path.join(__dirname, '../../public/logo.png'), 50, 45, { width: 50 });
    
    // Add document title
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    
    // Add invoice details
    doc.fontSize(12);
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'right' });
    doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, { align: 'right' });
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, { align: 'right' });
    doc.text(`Status: ${invoice.status}`, { align: 'right' });
    
    if (invoice.paidAt) {
      doc.text(`Paid Date: ${new Date(invoice.paidAt).toLocaleDateString()}`, { align: 'right' });
    }
    
    doc.moveDown(2);
    
    // Add billing information
    if (invoice.billingInfo) {
      doc.text('BILL TO:', { underline: true });
      doc.text(invoice.billingInfo.name || 'N/A');
      doc.text(invoice.billingInfo.email || 'N/A');
      doc.text(invoice.billingInfo.address || 'N/A');
      doc.moveDown();
    }
    
    // Add transaction details
    doc.text(`Course: ${invoice.transaction.description || 'N/A'}`);
    doc.moveDown(2);
    
    // Add table header
    const invoiceTableTop = doc.y;
    doc.font('Helvetica-Bold')
      .text('Description', 50, invoiceTableTop, { width: 250 })
      .text('Amount', 300, invoiceTableTop, { width: 90, align: 'right' })
      .text('Total', 390, invoiceTableTop, { width: 90, align: 'right' });
    
    // Add line
    doc.moveTo(50, doc.y + 10)
      .lineTo(530, doc.y + 10)
      .stroke();
    
    const tableTop = doc.y + 20;
    doc.font('Helvetica');
    
    // Add item
    doc.text(invoice.transaction.description || 'Course Purchase', 50, tableTop, { width: 250 })
      .text(`$${invoice.subtotal.toFixed(2)}`, 300, tableTop, { width: 90, align: 'right' })
      .text(`$${invoice.subtotal.toFixed(2)}`, 390, tableTop, { width: 90, align: 'right' });
    
    let currentY = tableTop + 30;
    
    // Add discount if any
    if (invoice.discount > 0) {
      doc.text('Discount', 50, currentY, { width: 250 })
        .text(`-$${invoice.discount.toFixed(2)}`, 390, currentY, { width: 90, align: 'right' });
      currentY += 20;
    }
    
    // Add tax if any
    if (invoice.tax > 0) {
      doc.text('Tax', 50, currentY, { width: 250 })
        .text(`$${invoice.tax.toFixed(2)}`, 390, currentY, { width: 90, align: 'right' });
      currentY += 20;
    }
    
    // Add total
    doc.moveTo(50, currentY)
      .lineTo(530, currentY)
      .stroke();
    
    currentY += 10;
    doc.font('Helvetica-Bold')
      .text('Total', 300, currentY, { width: 90 })
      .text(`$${invoice.total.toFixed(2)}`, 390, currentY, { width: 90, align: 'right' });
    
    // Add notes
    if (invoice.notes) {
      doc.moveDown(2);
      doc.font('Helvetica-Bold').text('Notes:');
      doc.font('Helvetica').text(invoice.notes);
    }
    
    // Add footer
    const footerTop = doc.page.height - 50;
    doc.font('Helvetica')
      .text('Thank you for your business!', 50, footerTop, { align: 'center' });
    
    doc.end();
    
    // Return a promise that resolves with the file path once the stream is closed
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ filePath, filename });
      });
      
      stream.on('error', (error) => {
        reject(new AppError(`Error generating PDF: ${error.message}`, 500));
      });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Error generating invoice PDF: ${error.message}`, 500);
  }
};

/**
 * Delete temporary PDF file
 */
const deleteTempPDF = (filePath) => {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    logger.warn(`Failed to delete temporary PDF file: ${error.message}`);
  }
};

module.exports = {
  createInvoice,
  getInvoiceById,
  getInvoicesByUser,
  updateInvoiceStatus,
  generateInvoicePDF,
  deleteTempPDF,
};