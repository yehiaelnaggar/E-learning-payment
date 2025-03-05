# Payment Service

This service handles all payment-related operations for the online learning platform, including payment processing, invoicing, and financial reporting.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [API Endpoints](#api-endpoints)
  - [Payments](#payments)
  - [Invoices](#invoices)
  - [Financial Reports](#financial-reports)
- [Database Models](#database-models)
- [Testing](#testing)

## Overview

The Payment Service is responsible for:
- Processing payments for course purchases
- Handling refund operations
- Generating and managing invoices
- Creating financial reports for administrators and educators
- Tracking payment-related audit logs

## Setup

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
