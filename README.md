# Payment Service API

This service handles all payment-related functionality including tracking transactions, processing payments, and managing educator payouts.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [API Endpoints](#api-endpoints)
  - [Payments](#payments)
  - [Invoices](#invoices)
  - [Financial Reports](#financial-reports)
  - [Statistics](#statistics)
  - [Payouts](#payouts)
- [Database Models](#database-models)
- [Testing](#testing)
- [User Stories](#user-stories)

## Overview

The Payment Service is responsible for:
- Processing payments for course purchases
- Handling refund operations
- Generating and managing invoices
- Creating financial reports for administrators and educators
- Tracking payment-related audit logs

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables in `.env` file:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/payment_db
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PORT=3002
   ```

3. Start the service:
   ```
   npm run start
   ```

### Prerequisites

- Node.js v14+
- PostgreSQL 12+
- Stripe account for payment processing

### Environment Variables

Create a `.env` file with the following:

```
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/payment_service_db"

# Stripe
STRIPE_SECRET_KEY="sk_test_your_stripe_key"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"

# Application
PORT=3001
NODE_ENV="development"
```

### Installation

```bash
npm install
npx prisma migrate dev
npm run start:dev
```

## API Endpoints

### Payments

#### Process a Payment

- **URL**: `/api/payments`
- **Method**: `POST`
- **Auth**: Required
- **Description**: Process a payment for course purchase
- **Request Body**:
  ```json
  {
    "amount": 99.99,
    "courseId": "course123",
    "educatorId": "educator456",
    "paymentMethodId": "pm_card_visa"
  }
  ```
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "tx123",
      "amount": 99.99,
      "status": "COMPLETED",
      "createdAt": "2023-01-01T12:00:00Z"
    }
  }
  ```

#### Get Transaction Details

- **URL**: `/api/payments/:transactionId`
- **Method**: `GET`
- **Auth**: Required
- **Description**: Get details of a specific transaction
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "tx123",
      "amount": 99.99,
      "currency": "USD",
      "status": "COMPLETED",
      "type": "PAYMENT",
      "createdAt": "2023-01-01T12:00:00Z"
    }
  }
  ```

#### Get User's Transaction History

- **URL**: `/api/payments/user/history`
- **Method**: `GET`
- **Auth**: Required
- **Description**: Get authenticated user's transaction history
- **Query Parameters**:
  - `page` (optional): Page number, default 1
  - `limit` (optional): Items per page, default 10
- **Response**: 
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "tx123",
        "amount": 99.99,
        "status": "COMPLETED",
        "description": "Course: JavaScript Masterclass",
        "createdAt": "2023-01-01T12:00:00Z"
      }
    ],
    "pagination": {
      "total": 25,
      "pages": 3,
      "page": 1,
      "limit": 10
    }
  }
  ```

#### Process a Refund

- **URL**: `/api/payments/:transactionId/refund`
- **Method**: `POST`
- **Auth**: Admin only
- **Description**: Process a refund for a completed payment
- **Request Body**:
  ```json
  {
    "amount": 99.99,
    "reason": "Customer requested refund"
  }
  ```
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "tx456",
      "refundId": "re_123",
      "amount": 99.99,
      "status": "COMPLETED",
      "type": "REFUND"
    }
  }
  ```

#### Stripe Webhook Handler

- **URL**: `/api/payments/webhook`
- **Method**: `POST`
- **Auth**: None (secured by webhook signature)
- **Description**: Handler for Stripe webhook events
- **Response**: 
  ```json
  {
    "success": true,
    "message": "Webhook processed"
  }
  ```

### Invoices

#### Create an Invoice

- **URL**: `/api/invoices`
- **Method**: `POST`
- **Auth**: Admin only
- **Description**: Create a new invoice for a transaction
- **Request Body**:
  ```json
  {
    "transactionId": "tx123",
    "subtotal": 99.99,
    "discount": 10.00,
    "tax": 5.00,
    "status": "ISSUED",
    "billingInfo": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "notes": "Premium membership purchase"
  }
  ```
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "inv123",
      "invoiceNumber": "INV-2023-000001",
      "total": 94.99,
      "status": "ISSUED",
      "createdAt": "2023-01-01T12:00:00Z"
    }
  }
  ```

#### Get Invoice by ID

- **URL**: `/api/invoices/:invoiceId`
- **Method**: `GET`
- **Auth**: Required (user can only access their own invoices, admin can access any)
- **Description**: Get details of a specific invoice
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "inv123",
      "invoiceNumber": "INV-2023-000001",
      "subtotal": 99.99,
      "discount": 10.00,
      "tax": 5.00,
      "total": 94.99,
      "status": "ISSUED",
      "issueDate": "2023-01-01T12:00:00Z",
      "transaction": {
        "id": "tx123",
        "description": "Course: JavaScript Masterclass"
      }
    }
  }
  ```

#### Get User's Invoices

- **URL**: `/api/invoices/user`
- **Method**: `GET`
- **Auth**: Required
- **Description**: Get authenticated user's invoices
- **Query Parameters**:
  - `page` (optional): Page number, default 1
  - `limit` (optional): Items per page, default 10
- **Response**: 
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "inv123",
        "invoiceNumber": "INV-2023-000001",
        "total": 94.99,
        "status": "ISSUED",
        "issueDate": "2023-01-01T12:00:00Z"
      }
    ],
    "pagination": {
      "total": 5,
      "pages": 1,
      "page": 1,
      "limit": 10
    }
  }
  ```

#### Download Invoice PDF

- **URL**: `/api/invoices/:invoiceId/pdf`
- **Method**: `GET`
- **Auth**: Required (user can only access their own invoices, admin can access any)
- **Description**: Generate and download a PDF version of the invoice
- **Response**: PDF file download

#### Update Invoice Status

- **URL**: `/api/invoices/transaction/:transactionId/status`
- **Method**: `PATCH`
- **Auth**: Admin only
- **Description**: Update the status of an invoice
- **Request Body**:
  ```json
  {
    "status": "PAID"
  }
  ```
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "inv123",
      "status": "PAID",
      "paidAt": "2023-01-02T12:00:00Z"
    }
  }
  ```

### Financial Reports

#### Generate Financial Report

- **URL**: `/api/reports/financial`
- **Method**: `GET`
- **Auth**: Admin can view all reports, Educators can only view their own
- **Description**: Generate a financial report with optional filters
- **Query Parameters**:
  - `startDate` (optional): Filter by start date
  - `endDate` (optional): Filter by end date
  - `educatorId` (optional, admin only): Filter by specific educator
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "totalPayments": 10000.00,
        "totalRefunds": 500.00,
        "totalCommission": 950.00,
        "totalEducatorEarnings": 8550.00,
        "successfulPayments": 100,
        "successfulRefunds": 5
      },
      "dailyStats": [
        {
          "date": "2023-01-01T00:00:00Z",
          "dailyRevenue": 1500.00,
          "dailyRefunds": 0.00,
          "dailyTransactions": 15
        }
      ],
      "topCourses": [
        {
          "courseId": "course123",
          "totalRevenue": 2500.00,
          "totalSales": 25
        }
      ],
      "reportGenerated": "2023-01-31T12:00:00Z",
      "period": {
        "from": "2023-01-01T00:00:00Z",
        "to": "2023-01-31T23:59:59Z"
      }
    }
  }
  ```

#### Download Financial Report PDF

- **URL**: `/api/reports/financial/pdf`
- **Method**: `GET`
- **Auth**: Admin can view all reports, Educators can only view their own
- **Description**: Generate and download a PDF version of the financial report
- **Query Parameters**: Same as Generate Financial Report endpoint
- **Response**: PDF file download

#### Get Educator Earnings Report

- **URL**: `/api/reports/educators/:educatorId/earnings`
- **Method**: `GET`
- **Auth**: Admin or the specific Educator
- **Description**: Get earnings report for a specific educator
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "educatorId": "educator123",
      "totalEarnings": 8550.00,
      "totalRefundedEarnings": 450.00,
      "totalActiveCourses": 5,
      "totalSales": 85
    }
  }
  ```

### Statistics

#### Get Transaction Volumes

- **URL**: `/api/statistics/transaction-volumes`
- **Method**: `GET`
- **Auth**: Admin only
- **Description**: Get metrics about transaction volumes
- **Query Parameters**:
  - `startDate` (optional): Filter by start date (YYYY-MM-DD)
  - `endDate` (optional): Filter by end date (YYYY-MM-DD)
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "totalTransactions": 1250,
      "totalVolume": 125000.00,
      "averageValue": 100.00,
      "peakPeriods": [
        {
          "hour": 14,
          "count": 120,
          "volume": 12000.00
        }
      ]
    }
  }
  ```

#### Get Performance Metrics

- **URL**: `/api/statistics/performance-metrics`
- **Method**: `GET`
- **Auth**: Admin only
- **Description**: Get metrics about transaction performance
- **Query Parameters**:
  - `startDate` (optional): Filter by start date (YYYY-MM-DD)
  - `endDate` (optional): Filter by end date (YYYY-MM-DD)
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "statusBreakdown": [
        {
          "status": "COMPLETED",
          "count": 950,
          "percentage": 95.0
        },
        {
          "status": "FAILED",
          "count": 50,
          "percentage": 5.0
        }
      ],
      "avgProcessingTime": 1250,
      "errorRatesByPaymentMethod": [
        {
          "paymentMethod": "credit_card",
          "totalCount": 800,
          "failedCount": 30,
          "errorRate": 3.75
        }
      ]
    }
  }
  ```

#### Get Financial Analysis

- **URL**: `/api/statistics/financial-analysis`
- **Method**: `GET`
- **Auth**: Admin only
- **Description**: Get financial analysis metrics
- **Query Parameters**:
  - `startDate` (optional): Filter by start date (YYYY-MM-DD)
  - `endDate` (optional): Filter by end date (YYYY-MM-DD)
  - `groupBy` (optional): Group results by period - 'daily', 'weekly', or 'monthly' (default: 'daily')
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "revenueByTimePeriod": [
        {
          "period": "2023-01-01",
          "revenue": 5000.00,
          "refunds": 250.00,
          "netRevenue": 4750.00
        }
      ],
      "revenueByPaymentMethod": [
        {
          "paymentMethod": "credit_card",
          "revenue": 85000.00,
          "count": 800,
          "percentage": 85.0
        }
      ]
    }
  }
  ```

#### Get Payment Operations

- **URL**: `/api/statistics/payment-operations`
- **Method**: `GET`
- **Auth**: Admin only
- **Description**: Get payment operations metrics
- **Query Parameters**:
  - `startDate` (optional): Filter by start date (YYYY-MM-DD)
  - `endDate` (optional): Filter by end date (YYYY-MM-DD)
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "refundMetrics": {
        "count": 45,
        "volume": 4500.00,
        "rate": 4.5
      },
      "paymentMethodDistribution": [
        {
          "method": "credit_card",
          "count": 800,
          "percentage": 80.0
        },
        {
          "method": "paypal",
          "count": 200,
          "percentage": 20.0
        }
      ]
    }
  }
  ```

#### Get Dashboard Statistics

- **URL**: `/api/statistics/dashboard`
- **Method**: `GET`
- **Auth**: Admin only
- **Description**: Get comprehensive dashboard statistics
- **Query Parameters**:
  - `startDate` (optional): Filter by start date (YYYY-MM-DD)
  - `endDate` (optional): Filter by end date (YYYY-MM-DD)
  - `groupBy` (optional): Group financial results by period - 'daily', 'weekly', or 'monthly'
- **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "transactionVolumes": { /* Transaction volume metrics */ },
      "performanceMetrics": { /* Performance metrics */ },
      "financialAnalysis": { /* Financial analysis metrics */ },
      "paymentOperations": { /* Payment operation metrics */ },
      "generatedAt": "2023-07-01T12:00:00Z"
    }
  }
  ```

### Payouts

#### Get Educator Pending Earnings
Retrieves pending earnings for an educator that haven't been paid out.

- **URL**: `/api/payouts/pending-earnings/:educatorId`
- **Method**: `GET`
- **Authentication**: Required (Educator or Admin)
- **URL Params**:
  - `educatorId`: ID of the educator

**Response**:
```json
{
  "success": true,
  "data": {
    "pendingAmount": 2500.75,
    "pendingTransactions": 42,
    "oldestTransaction": "2023-03-15T10:45:20Z",
    "earningsByMonth": [
      {
        "month": "2023-06-01T00:00:00Z",
        "netAmount": 1200.50,
        "salesCount": 25,
        "refundCount": 2
      },
      {
        "month": "2023-05-01T00:00:00Z",
        "netAmount": 1300.25,
        "salesCount": 30,
        "refundCount": 1
      }
    ]
  }
}
```

#### Request a Payout
Educator requests a payout for their pending earnings.

- **URL**: `/api/payouts/request`
- **Method**: `POST`
- **Authentication**: Required (Educator)
- **Request Body**:
```json
{
  "educatorId": "auth0|123456789",
  "amount": 1500.00,
  "paymentMethod": "bank_transfer",
  "bankDetails": {
    "accountNumber": "XXXX4321",
    "routingNumber": "XXXX9876",
    "accountName": "John Doe",
    "bankName": "Bank of America"
  },
  "notes": "Monthly payout request"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "payout_123abc",
    "payoutNumber": "PAYOUT-2023-000123",
    "educatorId": "auth0|123456789",
    "amount": 1500.00,
    "processingFee": 2.50,
    "status": "PENDING",
    "paymentMethod": "bank_transfer",
    "requestedAt": "2023-07-01T14:23:45Z",
    "notes": "Monthly payout request"
  }
}
```

#### Process a Payout (Admin only)
Process a pending payout.

- **URL**: `/api/payouts/process/:payoutId`
- **Method**: `POST`
- **Authentication**: Required (Admin)
- **URL Params**:
  - `payoutId`: ID of the payout to process

**Request Body**:
```json
{
  "adminId": "auth0|admin123456"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "payout_123abc",
    "payoutNumber": "PAYOUT-2023-000123",
    "educatorId": "auth0|123456789",
    "amount": 1500.00,
    "processingFee": 2.50,
    "status": "COMPLETED",
    "paymentMethod": "bank_transfer",
    "requestedAt": "2023-07-01T14:23:45Z",
    "processedAt": "2023-07-02T09:15:32Z",
    "transactions": [
      {
        "id": "tx_001",
        "amount": 99.99,
        "educatorEarnings": 75.00,
        "type": "PAYMENT",
        "status": "COMPLETED",
        "createdAt": "2023-06-15T10:30:00Z",
        "courseId": "course_123",
        "description": "Purchase of Introduction to JavaScript"
      },
      // More transactions...
    ]
  }
}
```

#### Get Payout by ID
Retrieve details of a specific payout.

- **URL**: `/api/payouts/:payoutId`
- **Method**: `GET`
- **Authentication**: Required (Admin or Educator owner)
- **URL Params**:
  - `payoutId`: ID of the payout

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "payout_123abc",
    "payoutNumber": "PAYOUT-2023-000123",
    "educatorId": "auth0|123456789",
    "amount": 1500.00,
    "processingFee": 2.50,
    "status": "COMPLETED",
    "paymentMethod": "bank_transfer",
    "requestedAt": "2023-07-01T14:23:45Z",
    "processedAt": "2023-07-02T09:15:32Z",
    "transactions": [
      {
        "id": "tx_001",
        "amount": 99.99,
        "educatorEarnings": 75.00,
        "type": "PAYMENT",
        "status": "COMPLETED",
        "createdAt": "2023-06-15T10:30:00Z",
        "courseId": "course_123",
        "description": "Purchase of Introduction to JavaScript"
      },
      // More transactions...
    ]
  }
}
```

#### Get Educator Payouts
Retrieve a list of payouts for an educator.

- **URL**: `/api/payouts/educator/:educatorId`
- **Method**: `GET`
- **Authentication**: Required (Admin or Educator owner)
- **URL Params**:
  - `educatorId`: ID of the educator
- **Query Params**:
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10)

**Response**:
```json
{
  "success": true,
  "data": {
    "payouts": [
      {
        "id": "payout_123abc",
        "payoutNumber": "PAYOUT-2023-000123",
        "amount": 1500.00,
        "status": "COMPLETED",
        "requestedAt": "2023-07-01T14:23:45Z",
        "processedAt": "2023-07-02T09:15:32Z"
      },
      {
        "id": "payout_456def",
        "payoutNumber": "PAYOUT-2023-000122",
        "amount": 1200.00,
        "status": "COMPLETED",
        "requestedAt": "2023-06-01T11:20:15Z",
        "processedAt": "2023-06-03T16:45:22Z"
      }
    ],
    "pagination": {
      "total": 15,
      "pages": 2,
      "page": 1,
      "limit": 10
    }
  }
}
```

#### Get All Payouts (Admin only)
Retrieve a list of all payouts with filtering options.

- **URL**: `/api/payouts/admin/all`
- **Method**: `GET`
- **Authentication**: Required (Admin)
- **Query Params**:
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10)
  - `status`: Filter by status (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)
  - `educatorId`: Filter by educator
  - `startDate`: Filter by date range start (YYYY-MM-DD)
  - `endDate`: Filter by date range end (YYYY-MM-DD)

**Response**:
```json
{
  "success": true,
  "data": {
    "payouts": [
      {
        "id": "payout_123abc",
        "payoutNumber": "PAYOUT-2023-000123",
        "educatorId": "auth0|123456789",
        "amount": 1500.00,
        "status": "COMPLETED",
        "requestedAt": "2023-07-01T14:23:45Z",
        "processedAt": "2023-07-02T09:15:32Z"
      },
      // More payouts...
    ],
    "pagination": {
      "total": 42,
      "pages": 5,
      "page": 1,
      "limit": 10
    }
  }
}
```

#### Cancel a Payout
Cancel a pending payout request.

- **URL**: `/api/payouts/cancel/:payoutId`
- **Method**: `POST`
- **Authentication**: Required (Admin or Educator owner)
- **URL Params**:
  - `payoutId`: ID of the payout to cancel

**Request Body**:
```json
{
  "userId": "auth0|123456789",
  "isAdmin": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "payout_123abc",
    "payoutNumber": "PAYOUT-2023-000123",
    "educatorId": "auth0|123456789",
    "amount": 1500.00,
    "status": "CANCELLED",
    "requestedAt": "2023-07-01T14:23:45Z",
    "notes": "Monthly payout request\nCancelled by educator on 2023-07-01T16:45:22Z"
  },
  "message": "Payout successfully cancelled"
}
```

## Database Models

The service uses the following main models:

- **Transaction**: Records of payments and refunds
- **Invoice**: Documents issued for payments
- **AuditLog**: Tracks all payment-related activities for security and compliance

For full schema details, see `prisma/schema.prisma`.

## Testing

Run tests with:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=invoiceService.test.js

# Run with coverage report
npm run test:coverage
```

## User Stories

### User Story 1: Process a Payment

As a user, I want to be able to process a payment for a course purchase so that I can access the course content.

#### Acceptance Criteria:
- The user can submit payment details via the `/api/payments` endpoint.
- The payment is processed using the provided payment method.
- The user receives a confirmation response with transaction details.

### User Story 2: Get Transaction Details

As a user, I want to be able to view the details of a specific transaction so that I can verify my payment.

#### Acceptance Criteria:
- The user can retrieve transaction details via the `/api/payments/:transactionId` endpoint.
- The response includes transaction amount, status, and other relevant details.

### User Story 3: Get User's Transaction History

As a user, I want to be able to view my transaction history so that I can keep track of my payments.

#### Acceptance Criteria:
- The user can retrieve their transaction history via the `/api/payments/user/history` endpoint.
- The response includes a list of transactions with pagination support.

### User Story 4: Process a Refund

As an admin, I want to be able to process a refund for a completed payment so that I can handle customer refund requests.

#### Acceptance Criteria:
- The admin can submit a refund request via the `/api/payments/:transactionId/refund` endpoint.
- The refund is processed and the user receives a confirmation response with refund details.

### User Story 5: Create an Invoice

As an admin, I want to be able to create an invoice for a transaction so that I can provide billing documentation to users.

#### Acceptance Criteria:
- The admin can create an invoice via the `/api/invoices` endpoint.
- The invoice is generated with the provided details and a unique invoice number.
- The user receives a confirmation response with invoice details.

### User Story 6: Get Invoice by ID

As a user, I want to be able to view the details of a specific invoice so that I can verify my billing information.

#### Acceptance Criteria:
- The user can retrieve invoice details via the `/api/invoices/:invoiceId` endpoint.
- The response includes invoice amount, status, and other relevant details.

### User Story 7: Get User's Invoices

As a user, I want to be able to view my invoices so that I can keep track of my billing history.

#### Acceptance Criteria:
- The user can retrieve their invoices via the `/api/invoices/user` endpoint.
- The response includes a list of invoices with pagination support.

### User Story 8: Generate Financial Report

As an admin, I want to be able to generate a financial report so that I can analyze the platform's financial performance.

#### Acceptance Criteria:
- The admin can generate a financial report via the `/api/reports/financial` endpoint.
- The report includes summary statistics, daily stats, and top courses.
- The response includes the report generation date and the period covered.

### User Story 9: Get Educator Earnings Report

As an educator, I want to be able to view my earnings report so that I can track my income from course sales.

#### Acceptance Criteria:
- The educator can retrieve their earnings report via the `/api/reports/educators/:educatorId/earnings` endpoint.
- The response includes total earnings, refunded earnings, active courses, and total sales.

### User Story 10: Get Dashboard Statistics

As an admin, I want to be able to view comprehensive dashboard statistics so that I can monitor the platform's performance.

#### Acceptance Criteria:
- The admin can retrieve dashboard statistics via the `/api/statistics/dashboard` endpoint.
- The response includes transaction volumes, performance metrics, financial analysis, and payment operations.
- The response includes the date and time the statistics were generated.
