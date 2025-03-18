# Payment Service API Documentation

This document outlines all available endpoints in the Payment Service API.

## Table of Contents
- [Health Check](#health-check)
- [Payment Endpoints](#payment-endpoints)
- [Refund Endpoints](#refund-endpoints)
- [Invoice Endpoints](#invoice-endpoints)
- [Report Endpoints](#report-endpoints)
- [Statistics Endpoints](#statistics-endpoints)
- [Webhook Endpoints](#webhook-endpoints)

## Health Check

### GET /api/health
Returns the health status of the payment service.

**Response:** 
```json
{
  "status": "ok",
  "service": "payment-service"
}
```

## Payment Endpoints

### POST /api/payments
Process a payment.

**Required Body Parameters:**
- courseId: string
- amount: number (min: 0.01)
- currency: string (USD, EUR, or GBP)
- source: string
- educatorId: string
- description: string (optional)

**Request Body Example:**
```json
{
  "courseId": "course_123456",
  "amount": 49.99,
  "currency": "USD",
  "source": "tok_visa",
  "educatorId": "edu_789012",
  "description": "Payment for Advanced JavaScript Course"
}
```

**Response Example:**
```json
{
  "success": true,
  "transaction": {
    "id": "txn_1K2OvVJs9ciOaJs9c",
    "amount": 49.99,
    "currency": "USD",
    "status": "succeeded",
    "created": "2023-11-15T09:32:01.000Z",
    "courseId": "course_123456",
    "educatorId": "edu_789012"
  }
}
```

### POST /api/payments/refund
Process a refund.

**Required Body Parameters:**
- transactionId: string
- reason: string (optional)

**Request Body Example:**
```json
{
  "transactionId": "txn_1K2OvVJs9ciOaJs9c",
  "reason": "Course cancellation requested by student"
}
```

**Response Example:**
```json
{
  "success": true,
  "refund": {
    "id": "re_3K2PwXJs9ciOaJs9c0X2pXqZ",
    "amount": 49.99,
    "currency": "USD",
    "status": "succeeded",
    "transactionId": "txn_1K2OvVJs9ciOaJs9c",
    "created": "2023-11-15T10:15:22.000Z"
  }
}
```

### GET /api/payments/user
Get transactions for the current user.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- status: string (optional, values: succeeded, pending, failed)
- page: number (optional, default: 1)
- limit: number (optional, default: 10)

**Response Example:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "txn_1K2OvVJs9ciOaJs9c",
      "amount": 49.99,
      "currency": "USD",
      "status": "succeeded",
      "created": "2023-11-15T09:32:01.000Z",
      "courseId": "course_123456",
      "courseName": "Advanced JavaScript Course"
    },
    {
      "id": "txn_1K1NuUJs9ciOaJs9b",
      "amount": 29.99,
      "currency": "USD",
      "status": "succeeded",
      "created": "2023-11-10T14:22:33.000Z",
      "courseId": "course_789012",
      "courseName": "Introduction to Python Programming"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1,
    "limit": 10
  }
}
```

### POST /api/payments/create-account
Create a Stripe account for an educator.

**Request Body Example:**
```json
{
  "email": "educator@example.com",
  "country": "US",
  "businessType": "individual",
  "businessProfile": {
    "name": "John Doe",
    "url": "https://johndoe-courses.com"
  }
}
```

**Response Example:**
```json
{
  "success": true,
  "accountId": "acct_1NhJ7RJs9ciOaJs9c",
  "detailsSubmitted": false,
  "chargesEnabled": false,
  "payoutsEnabled": false,
  "onboardingUrl": "https://connect.stripe.com/setup/s/6Hm29OmZLiF7"
}
```

### DELETE /api/payments/delete-account
Delete an educator's Stripe account.

**Response Example:**
```json
{
  "success": true,
  "deleted": true,
  "message": "Stripe account successfully deleted"
}
```

### GET /api/payments/total-earnings
Get the total earnings for an educator.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)

**Response Example:**
```json
{
  "success": true,
  "totalEarnings": {
    "gross": 1250.50,
    "fees": 37.52,
    "net": 1212.98,
    "currency": "USD",
    "transactionCount": 25
  }
}
```

### GET /api/payments/current-balance
Get the current balance for an educator.

**Response Example:**
```json
{
  "success": true,
  "balance": {
    "available": 752.15,
    "pending": 498.35,
    "currency": "USD",
    "lastUpdated": "2023-11-15T12:30:45.000Z"
  }
}
```

### GET /api/payments/:transactionId
Get a transaction by ID.

**Response Example:**
```json
{
  "success": true,
  "transaction": {
    "id": "txn_1K2OvVJs9ciOaJs9c",
    "amount": 49.99,
    "currency": "USD",
    "status": "succeeded",
    "created": "2023-11-15T09:32:01.000Z",
    "courseId": "course_123456",
    "courseName": "Advanced JavaScript Course",
    "educatorId": "edu_789012",
    "educatorName": "John Doe",
    "studentId": "user_345678",
    "studentName": "Alice Smith",
    "paymentMethod": "visa",
    "last4": "4242",
    "refunded": false
  }
}
```

### GET /api/payments/report/transactions
Generate a transaction report (admin only).

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- educatorId: string (optional)
- status: string (optional)
- format: string (optional, values: json, csv, default: json)

**Response Example (JSON):**
```json
{
  "success": true,
  "reportData": {
    "summary": {
      "totalTransactions": 150,
      "totalAmount": 7520.45,
      "avgTransactionValue": 50.14,
      "successRate": 98.5,
      "refundRate": 1.2
    },
    "transactions": [
      {
        "id": "txn_1K2OvVJs9ciOaJs9c",
        "amount": 49.99,
        "currency": "USD",
        "status": "succeeded",
        "created": "2023-11-15T09:32:01.000Z",
        "courseId": "course_123456",
        "educatorId": "edu_789012"
      }
    ],
    "generatedAt": "2023-11-15T15:45:22.000Z"
  }
}
```

## Refund Endpoints

### POST /api/refunds
Process a refund.

**Required Body Parameters:**
- transactionId: string
- amount: number (optional)
- reason: string (optional)

**Request Body Example:**
```json
{
  "transactionId": "txn_1K2OvVJs9ciOaJs9c",
  "amount": 49.99,
  "reason": "Course content did not meet expectations"
}
```

**Response Example:**
```json
{
  "success": true,
  "refund": {
    "id": "re_3K2PwXJs9ciOaJs9c0X2pXqZ",
    "amount": 49.99,
    "currency": "USD",
    "status": "succeeded",
    "transactionId": "txn_1K2OvVJs9ciOaJs9c",
    "created": "2023-11-15T10:15:22.000Z"
  }
}
```

### GET /api/refunds/transaction/:transactionId
Get refund information by transaction ID.

**Response Example:**
```json
{
  "success": true,
  "refunds": [
    {
      "id": "re_3K2PwXJs9ciOaJs9c0X2pXqZ",
      "amount": 49.99,
      "currency": "USD",
      "status": "succeeded",
      "reason": "Course content did not meet expectations",
      "created": "2023-11-15T10:15:22.000Z",
      "transactionId": "txn_1K2OvVJs9ciOaJs9c"
    }
  ],
  "transaction": {
    "id": "txn_1K2OvVJs9ciOaJs9c",
    "amount": 49.99,
    "refundedAmount": 49.99,
    "status": "refunded"
  }
}
```

## Invoice Endpoints

### GET /api/invoices/user
Get invoices for the current user.

**Query Parameters:**
- page: number (optional, default: 1)
- limit: number (optional, between 1-50, default: 10)
- status: string (optional, values: paid, pending, overdue)
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)

**Response Example:**
```json
{
  "success": true,
  "invoices": [
    {
      "id": "inv_1K2PxYJs9ciOaJs9d",
      "number": "INV-2023-001",
      "amount": 49.99,
      "currency": "USD",
      "status": "paid",
      "created": "2023-11-15T09:32:01.000Z",
      "dueDate": "2023-11-15T09:32:01.000Z",
      "courseId": "course_123456",
      "courseName": "Advanced JavaScript Course",
      "pdfUrl": "/api/invoices/inv_1K2PxYJs9ciOaJs9d/pdf"
    },
    {
      "id": "inv_1K1NvVJs9ciOaJs9e",
      "number": "INV-2023-002",
      "amount": 29.99,
      "currency": "USD",
      "status": "paid",
      "created": "2023-11-10T14:22:33.000Z",
      "dueDate": "2023-11-10T14:22:33.000Z",
      "courseId": "course_789012",
      "courseName": "Introduction to Python Programming",
      "pdfUrl": "/api/invoices/inv_1K1NvVJs9ciOaJs9e/pdf"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1,
    "limit": 10
  }
}
```

### GET /api/invoices/:invoiceId
Get a specific invoice.

**Response Example:**
```json
{
  "success": true,
  "invoice": {
    "id": "inv_1K2PxYJs9ciOaJs9d",
    "number": "INV-2023-001",
    "amount": 49.99,
    "currency": "USD",
    "status": "paid",
    "created": "2023-11-15T09:32:01.000Z",
    "dueDate": "2023-11-15T09:32:01.000Z",
    "paidDate": "2023-11-15T09:32:01.000Z",
    "courseId": "course_123456",
    "courseName": "Advanced JavaScript Course",
    "educatorId": "edu_789012",
    "educatorName": "John Doe",
    "studentId": "user_345678",
    "studentName": "Alice Smith",
    "items": [
      {
        "description": "Course enrollment: Advanced JavaScript Course",
        "amount": 49.99,
        "quantity": 1
      }
    ],
    "subtotal": 49.99,
    "tax": 0,
    "total": 49.99,
    "notes": "Thank you for your purchase!",
    "paymentMethod": "Credit Card",
    "pdfUrl": "/api/invoices/inv_1K2PxYJs9ciOaJs9d/pdf"
  }
}
```

### GET /api/invoices/:invoiceId/pdf
Download a specific invoice as PDF.

**Response:**
Binary PDF file with appropriate headers:
- Content-Type: application/pdf
- Content-Disposition: attachment; filename=invoice-{invoiceId}.pdf

## Report Endpoints

### GET /api/reports/financial
Generate a financial report with optional filters.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- educatorId: string (optional) - Admin can query any educator, educator can only query own data
- groupBy: string (optional, values: day, week, month)

**Response Example:**
```json
{
  "success": true,
  "report": {
    "summary": {
      "totalRevenue": 8750.45,
      "platformFees": 875.04,
      "educatorPayouts": 7875.41,
      "transactionCount": 175,
      "averageTransactionValue": 50.00,
      "refundRate": 1.7
    },
    "timeSeriesData": [
      {
        "period": "2023-11-01",
        "revenue": 1250.75,
        "transactionCount": 25
      },
      {
        "period": "2023-11-02",
        "revenue": 975.50,
        "transactionCount": 19
      }
    ],
    "topCourses": [
      {
        "courseId": "course_123456",
        "courseName": "Advanced JavaScript Course",
        "revenue": 2499.50,
        "enrollments": 50
      },
      {
        "courseId": "course_789012",
        "courseName": "Introduction to Python Programming",
        "revenue": 1799.40,
        "enrollments": 60
      }
    ],
    "generatedAt": "2023-11-15T15:45:22.000Z"
  }
}
```

### GET /api/reports/financial/pdf
Generate and download a financial report as PDF.

**Query Parameters:**
- Same as GET /api/reports/financial

**Response:**
Binary PDF file with appropriate headers:
- Content-Type: application/pdf
- Content-Disposition: attachment; filename=financial-report-{date}.pdf

### GET /api/reports/educators/:educatorId/earnings
Get an earnings report for a specific educator.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- groupBy: string (optional, values: day, week, month)

**Response Example:**
```json
{
  "success": true,
  "report": {
    "educatorId": "edu_789012",
    "educatorName": "John Doe",
    "summary": {
      "totalEarnings": 5250.75,
      "platformFees": 525.08,
      "netEarnings": 4725.67,
      "coursesSold": 105,
      "averageEarningsPerCourse": 50.01
    },
    "earningsOverTime": [
      {
        "period": "2023-11-01",
        "earnings": 750.25,
        "coursesSold": 15
      },
      {
        "period": "2023-11-02",
        "earnings": 600.50,
        "coursesSold": 12
      }
    ],
    "coursePerformance": [
      {
        "courseId": "course_123456",
        "courseName": "Advanced JavaScript Course",
        "earnings": 2499.50,
        "enrollments": 50
      },
      {
        "courseId": "course_234567",
        "courseName": "Web Development Bootcamp",
        "earnings": 1750.25,
        "enrollments": 35
      }
    ],
    "generatedAt": "2023-11-15T15:45:22.000Z",
    "period": "2023-11-01 to 2023-11-15"
  }
}
```

### GET /api/reports/commission-analysis
Get a commission analysis report.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- educatorId: string (optional) - Admin can query any educator, educator can only query own data

**Response Example:**
```json
{
  "success": true,
  "report": {
    "summary": {
      "totalTransactions": 175,
      "totalRevenue": 8750.45,
      "platformCommission": 875.04,
      "educatorEarnings": 7875.41,
      "averageCommissionRate": 10.0
    },
    "commissionDetails": [
      {
        "educatorId": "edu_789012",
        "educatorName": "John Doe",
        "totalRevenue": 5250.75,
        "platformCommission": 525.08,
        "netEarnings": 4725.67,
        "commissionRate": 10.0,
        "courseCount": 3
      }
    ],
    "commissionOverTime": [
      {
        "period": "2023-11-01",
        "revenue": 1250.75,
        "commission": 125.08
      },
      {
        "period": "2023-11-02",
        "revenue": 975.50,
        "commission": 97.55
      }
    ],
    "generatedAt": "2023-11-15T15:45:22.000Z",
    "period": "2023-11-01 to 2023-11-15"
  }
}
```

## Statistics Endpoints

### GET /api/statistics/transaction-volumes
Get transaction volume metrics.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- groupBy: string (optional, values: day, week, month)

**Response Example:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalTransactions": 1250,
      "totalVolume": 62548.75,
      "averageTransactionValue": 50.04,
      "successRate": 98.7
    },
    "trends": [
      {
        "period": "2023-11-01",
        "transactions": 42,
        "volume": 2102.50
      },
      {
        "period": "2023-11-02",
        "transactions": 38,
        "volume": 1901.75
      }
    ],
    "paymentMethods": [
      {
        "method": "credit_card",
        "count": 875,
        "volume": 43784.12,
        "percentage": 70.0
      },
      {
        "method": "paypal",
        "count": 375,
        "volume": 18764.63,
        "percentage": 30.0
      }
    ]
  }
}
```

### GET /api/statistics/performance-metrics
Get performance metrics.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)

**Response Example:**
```json
{
  "success": true,
  "data": {
    "transactionSuccess": {
      "successRate": 98.7,
      "failureRate": 1.3,
      "averageProcessingTime": 1.2
    },
    "errors": {
      "total": 16,
      "byType": [
        {
          "type": "card_declined",
          "count": 8,
          "percentage": 50.0
        },
        {
          "type": "insufficient_funds",
          "count": 5,
          "percentage": 31.25
        },
        {
          "type": "expired_card",
          "count": 3,
          "percentage": 18.75
        }
      ]
    },
    "availability": {
      "uptime": 99.98,
      "responseTime": {
        "p50": 120,
        "p90": 250,
        "p99": 450
      }
    }
  }
}
```

### GET /api/statistics/financial-analysis
Get financial analysis.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- groupBy: string (optional, values: day, week, month)

**Response Example:**
```json
{
  "success": true,
  "data": {
    "revenue": {
      "total": 62548.75,
      "platformCommission": 6254.88,
      "educatorPayouts": 56293.87,
      "trends": [
        {
          "period": "2023-11-01",
          "revenue": 2102.50,
          "commission": 210.25
        },
        {
          "period": "2023-11-02",
          "revenue": 1901.75,
          "commission": 190.18
        }
      ]
    },
    "refunds": {
      "total": 1250.75,
      "count": 25,
      "refundRate": 2.0,
      "averageRefundAmount": 50.03
    },
    "growth": {
      "revenueGrowth": 12.5,
      "transactionGrowth": 8.2,
      "userGrowth": 15.1
    }
  }
}
```

### GET /api/statistics/payment-operations
Get payment operations metrics.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)

**Response Example:**
```json
{
  "success": true,
  "data": {
    "payouts": {
      "total": 42000.00,
      "count": 150,
      "averageAmount": 280.00,
      "successRate": 99.3
    },
    "disputes": {
      "total": 3,
      "resolved": 2,
      "pending": 1,
      "amountDisputed": 149.97,
      "amountResolved": 99.98,
      "winRate": 66.7
    },
    "transfers": {
      "total": 56293.87,
      "count": 150,
      "successRate": 100.0,
      "averageTransferTime": 2.1
    }
  }
}
```

### GET /api/statistics/dashboard
Get comprehensive dashboard statistics.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)

**Response Example:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRevenue": 62548.75,
      "totalTransactions": 1250,
      "platformCommission": 6254.88,
      "educatorPayouts": 56293.87,
      "activeEducators": 42,
      "activeStudents": 875
    },
    "trends": {
      "revenue": [
        { "period": "2023-11-01", "value": 2102.50 },
        { "period": "2023-11-02", "value": 1901.75 }
      ],
      "transactions": [
        { "period": "2023-11-01", "value": 42 },
        { "period": "2023-11-02", "value": 38 }
      ],
      "newUsers": [
        { "period": "2023-11-01", "value": 15 },
        { "period": "2023-11-02", "value": 12 }
      ]
    },
    "topEducators": [
      {
        "educatorId": "edu_789012",
        "name": "John Doe",
        "revenue": 15250.75,
        "coursesSold": 305
      },
      {
        "educatorId": "edu_345678",
        "name": "Jane Smith",
        "revenue": 12750.25,
        "coursesSold": 255
      }
    ],
    "topCourses": [
      {
        "courseId": "course_123456",
        "name": "Advanced JavaScript Course",
        "revenue": 7499.50,
        "enrollments": 150
      },
      {
        "courseId": "course_234567",
        "name": "Web Development Bootcamp",
        "revenue": 6000.00,
        "enrollments": 120
      }
    ]
  }
}
```

### GET /api/statistics/educators/:educatorId/payment-analytics
Get detailed payment analytics for an educator.

**Query Parameters:**
- startDate: string (optional, format: YYYY-MM-DD)
- endDate: string (optional, format: YYYY-MM-DD)
- groupBy: string (optional, values: day, week, month)

**Response Example:**
```json
{
  "success": true,
  "data": {
    "educatorId": "edu_789012",
    "educatorName": "John Doe",
    "summary": {
      "totalRevenue": 15250.75,
      "platformCommission": 1525.08,
      "netEarnings": 13725.67,
      "coursesSold": 305,
      "averageRevenuePerCourse": 50.00,
      "refundRate": 1.5
    },
    "revenueOverTime": [
      {
        "period": "2023-11-01",
        "revenue": 525.00,
        "coursesSold": 10
      },
      {
        "period": "2023-11-02",
        "revenue": 475.00,
        "coursesSold": 9
      }
    ],
    "coursePerformance": [
      {
        "courseId": "course_123456",
        "courseName": "Advanced JavaScript Course",
        "revenue": 7499.50,
        "enrollments": 150,
        "refunds": 2
      },
      {
        "courseId": "course_234567",
        "courseName": "Web Development Bootcamp",
        "revenue": 5000.00,
        "enrollments": 100,
        "refunds": 3
      }
    ],
    "paymentMethods": [
      {
        "method": "credit_card",
        "count": 215,
        "volume": 10675.53,
        "percentage": 70.0
      },
      {
        "method": "paypal",
        "count": 90,
        "volume": 4575.22,
        "percentage": 30.0
      }
    ]
  }
}
```

## Webhook Endpoints

### POST /api/webhooks/stripe
Handle Stripe webhook events.

**Header Requirements:**
- stripe-signature: Stripe signature for webhook verification

**Note:** This endpoint expects the raw body to be preserved for signature verification.

**Request Body:**
The request body is the raw event data sent by Stripe, which varies by event type.

**Response Example:**
```json
{
  "received": true
}
```

