// Mock Prisma client
jest.mock('../src/config/db', () => {
  return {
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    payout: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(), 
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    invoice: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
});

// Mock Stripe
jest.mock('../src/config/stripe', () => {
  return {
    charges: {
      create: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
    transfers: {
      create: jest.fn(),
    },
    setAppInfo: jest.fn(),
    setApiVersion: jest.fn(),
  };
});

// Mock logger
jest.mock('../src/utils/logger', () => {
  return {
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    auditLogger: {
      log: jest.fn(),
    },
    stream: {
      write: jest.fn(),
    },
  };
});

// Mock service notifier
jest.mock('../src/utils/serviceNotifier', () => {
  return {
    notifyUserService: jest.fn(),
    notifyCourseService: jest.fn(),
    notifyEducatorDashboard: jest.fn(),
  };
});
