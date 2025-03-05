# Payment Service Class Diagram

```mermaid
classDiagram
    %% Database Models
    class Transaction {
        +String idII
        +String stripeChargeId
        +Float amount
        +String currency
        +TransactionStatus status
        +TransactionType type
        +Float platformCommission
        +Float educatorEarnings
        +String userId
        +String courseId
        +String educatorId
        +String description
        +Json metadata
        +String refundId
        +DateTime createdAt
        +DateTime updatedAt
    }
    
    class Invoice {
        +String id
        +String invoiceNumber
        +String transactionId
        +Float subtotal
        +Float discount
        +Float tax
        +Float total
        +DateTime issueDate
        +DateTime dueDate
        +DateTime paidAt
        +InvoiceStatus status
        +Json billingInfo
        +String notes
        +DateTime createdAt
        +DateTime updatedAt
    }
    
    class AuditLog {
        +String id
        +String transactionId
        +String action
        +String actor
        +String details
        +Json metadata
        +String ipAddress
        +String userAgent
        +DateTime createdAt
    }
    
    %% Enums
    class TransactionStatus {
        <<enumeration>>
        PENDING
        COMPLETED
        FAILED
        REFUNDED
        DISPUTED
    }
    
    class TransactionType {
        <<enumeration>>
        PAYMENT
        REFUND
    }
    
    class InvoiceStatus {
        <<enumeration>>
        DRAFT
        ISSUED
        PAID
        CANCELLED
    }
    
    %% Services
    class PaymentService {
        +processPayment(paymentData, user)
        +processRefund(refundData, user)
        +getTransactionById(transactionId)
        +getTransactionsByUser(userId, page, limit)
        +getTransactionsReport(filters, page, limit)
    }
    
    class InvoiceService {
        +createInvoice(invoiceData)
        +getInvoiceById(invoiceId)
        +getInvoicesByUser(userId, page, limit)
        +updateInvoiceStatus(transactionId, status, notes)
        +generateInvoicePDF(invoiceId)
        +deleteTempPDF(filePath)
    }
    
    class ReportingService {
        +generateFinancialReport(filters)
        +generateFinancialReportPDF(reportData)
        +deleteTempPDF(filePath)
        +getEducatorEarningsReport(educatorId)
    }
    
    %% Utilities and Middleware
    class AppError {
        +String message
        +Number statusCode
        +Error originalError
        +constructor(message, statusCode, originalError)
    }
    
    class Logger {
        +log(message, metadata)
        +error(message, metadata)
        +warn(message, metadata)
        +info(message, metadata)
    }
    
    class AuditLogger {
        +log(action, actor, details, transactionId, metadata)
    }
    
    class ServiceNotifier {
        +notifyUserService(data)
        +notifyCourseService(data)
    }
    
    %% External Services
    class StripeAPI {
        +charges.create(chargeData)
        +refunds.create(refundData)
    }
    
    class PrismaClient {
        +transaction
        +invoice
        +auditLog
        +$queryRaw()
    }
    
    class PDFKit {
        +PDFDocument()
    }
    
    %% Relationships
    Transaction "1" -- "1" Invoice : has
    Transaction "1" -- "*" AuditLog : has
    Transaction -- TransactionStatus : has
    Transaction -- TransactionType : has
    Invoice -- InvoiceStatus : has
    
    PaymentService -- Transaction : creates/manages
    PaymentService -- StripeAPI : uses
    PaymentService -- PrismaClient : uses
    PaymentService -- InvoiceService : uses
    PaymentService -- ServiceNotifier : uses
    
    InvoiceService -- Invoice : creates/manages
    InvoiceService -- PrismaClient : uses
    InvoiceService -- PDFKit : uses for PDF generation
    
    ReportingService -- Transaction : analyzes
    ReportingService -- PrismaClient : uses
    ReportingService -- PDFKit : uses for PDF generation
    
    PaymentService -- AppError : throws
    InvoiceService -- AppError : throws
    ReportingService -- AppError : throws
    
    PaymentService -- Logger : uses
    InvoiceService -- Logger : uses
    ReportingService -- Logger : uses
    PaymentService -- AuditLogger : uses
```

## Key Components

### Models
- **Transaction**: Represents payment or refund transactions
- **Invoice**: Represents invoices generated for transactions
- **AuditLog**: Records system activities for auditing purposes

### Enums
- **TransactionStatus**: Status values for transactions (PENDING, COMPLETED, etc.)
- **TransactionType**: Types of transactions (PAYMENT, REFUND)
- **InvoiceStatus**: Status values for invoices (DRAFT, ISSUED, etc.)

### Services
- **PaymentService**: Handles payment processing and refunds
- **InvoiceService**: Manages invoice creation and PDF generation
- **ReportingService**: Generates financial reports and analytics

### Utilities
- **AppError**: Custom error handling
- **Logger**: System logging
- **AuditLogger**: Audit trail logging
- **ServiceNotifier**: Communicates with other microservices

### External Services
- **StripeAPI**: Payment gateway integration
- **PrismaClient**: Database ORM
- **PDFKit**: PDF generation library
