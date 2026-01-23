// tests/setup.ts
// Global test setup

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Increase timeout for integration tests
jest.setTimeout(30000);

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test utilities
(global as any).waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add any global test data or helpers here
