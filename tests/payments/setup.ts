// Test environment setup for payment tests
import dotenv from 'dotenv';

dotenv.config();

// Mock data for testing
export const TEST_DATA = {
  validEmails: [
    `test-${Date.now()}@example.com`,
    `user-${Date.now()}@gmail.com`,
    `customer-${Date.now()}@company.com`,
  ],
  invalidEmails: [
    'no-at-sign',
    '@nodomain',
    'incomplete@',
    'spaces in@email.com',
    'double@@email.com',
    '',
  ],
  tempUserIds: [
    `temp_${Date.now()}_abc123`,
    `temp_${Date.now()}_xyz789`,
  ],
};

// Environment validation
export const validatePaymentEnv = () => {
  const required = [
    'STRIPE_SECRET_KEY_TEST',
    'STRIPE_PRICE_ID',
    'APP_SUCCESS_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️ Missing required env variables for payment tests: ${missing.join(', ')}`);
  }

  return missing.length === 0;
};

// Mock Stripe webhook events for testing
export const MOCK_STRIPE_EVENTS = {
  paymentLinkCreated: {
    id: 'evt_test_paymentlink',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        object: 'checkout.session',
        metadata: {
          revenuecat_user_id: 'temp_test_123',
          user_email: 'test@example.com',
          source: 'landing_page',
        },
      },
    },
  },
  subscriptionCreated: {
    id: 'evt_test_subscription',
    object: 'event',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_test_123',
        object: 'subscription',
        metadata: {
          revenuecat_user_id: 'temp_test_123',
        },
      },
    },
  },
};
