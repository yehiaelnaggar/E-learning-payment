// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock process.exit
process.exit = jest.fn();

// Mock the logger
jest.mock('./src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }
}));
