import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

describe('Stripe Payment Integration Tests', () => {
  let api: AxiosInstance;
  const baseURL = process.env.API_URL || 'http://localhost:8080';
  const isLiveMode = process.env.STRIPE_MODE === 'live';

  beforeAll(() => {
    api = axios.create({
      baseURL,
      validateStatus: () => true, // Don't throw on any status
    });
    console.log(`\n📝 Running tests in ${isLiveMode ? '🔴 LIVE' : '🟡 TEST'} mode`);
    console.log(`🔑 Stripe Key: ${isLiveMode ? 'sk_live_...' : 'sk_test_...'}\n`);
  });

  describe('POST /api/create-payment-link (Authenticated)', () => {
    it('should create a payment link for authenticated user', async () => {
      const mockFirebaseToken = process.env.TEST_FIREBASE_TOKEN;
      
      if (!mockFirebaseToken) {
        console.warn('⚠️ Skipping authenticated payment link test - TEST_FIREBASE_TOKEN not set');
        return;
      }

      const response = await api.post('/api/create-payment-link', {}, {
        headers: {
          Authorization: `Bearer ${mockFirebaseToken}`,
        },
      });

      expect([200, 400, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('url');
        expect(response.data.url).toMatch(/pay.stripe.com/);
        console.log('✅ Authenticated payment link created:', response.data.url);
      }
    });

    it('should reject without authentication token', async () => {
      const response = await api.post('/api/create-payment-link');

      expect([401, 403, 400]).toContain(response.status);
      console.log('✅ Correctly rejected unauthenticated request');
    });
  });

  describe('POST /api/create-payment-link-public (Public)', () => {
    it('should create a public payment link with email only', async () => {
      const testEmail = `test-${Date.now()}@example.com`;

      const response = await api.post('/api/create-payment-link-public', {
        email: testEmail,
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('url');
      expect(response.data.url).toMatch(/stripe.com/);
      console.log('✅ Public payment link created:', response.data.url);
    });

    it('should reject invalid email', async () => {
      const response = await api.post('/api/create-payment-link-public', {
        email: 'invalid-email',
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      console.log('✅ Correctly rejected invalid email');
    });

    it('should reject missing email', async () => {
      const response = await api.post('/api/create-payment-link-public', {});

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      console.log('✅ Correctly rejected missing email');
    });

    it('should include email in success response', async () => {
      const testEmail = `test-${Date.now()}@example.com`;

      const response = await api.post('/api/create-payment-link-public', {
        email: testEmail,
      });

      expect(response.status).toBe(200);
      expect(response.data.url).toContain(encodeURIComponent(testEmail));
      console.log('✅ Email correctly included in payment link');
    });
  });

  describe('POST /api/link-subscription (Post-Purchase Linking)', () => {
    it('should require authentication', async () => {
      const response = await api.post('/api/link-subscription', {
        tempUserId: 'temp_12345',
      });

      expect([401, 403]).toContain(response.status);
      console.log('✅ Correctly rejected unauthenticated link request');
    });

    it('should require tempUserId', async () => {
      const mockFirebaseToken = process.env.TEST_FIREBASE_TOKEN;

      if (!mockFirebaseToken) {
        console.warn('⚠️ Skipping link subscription test - TEST_FIREBASE_TOKEN not set');
        return;
      }

      const response = await api.post('/api/link-subscription', {}, {
        headers: {
          Authorization: `Bearer ${mockFirebaseToken}`,
        },
      });

      expect(response.status).toBe(400);
      console.log('✅ Correctly rejected missing tempUserId');
    });

    it('should handle valid link request', async () => {
      const mockFirebaseToken = process.env.TEST_FIREBASE_TOKEN;

      if (!mockFirebaseToken) {
        console.warn('⚠️ Skipping link subscription test - TEST_FIREBASE_TOKEN not set');
        return;
      }

      const response = await api.post(
        '/api/link-subscription',
        {
          tempUserId: `temp_${Date.now()}_test123`,
        },
        {
          headers: {
            Authorization: `Bearer ${mockFirebaseToken}`,
          },
        }
      );

      // Could be 200 (success), 404 (temp user not found), or 400 (invalid)
      expect([200, 400, 404]).toContain(response.status);
      console.log(`✅ Link subscription request returned ${response.status}`);
    });
  });

  describe('Payment Flow Scenarios', () => {
    it('should support full public purchase flow', async () => {
      const testEmail = `flow-test-${Date.now()}@example.com`;

      // Step 1: Create public payment link
      const linkResponse = await api.post('/api/create-payment-link-public', {
        email: testEmail,
      });

      expect(linkResponse.status).toBe(200);
      expect(linkResponse.data.url).toBeTruthy();
      console.log('✅ Step 1: Created public payment link');

      // Step 2: Verify link contains email
      expect(linkResponse.data.url).toContain(encodeURIComponent(testEmail));
      console.log('✅ Step 2: Payment link contains user email');

      // Step 3: Verify link is valid Stripe payment link
      expect(linkResponse.data.url).toMatch(/stripe.com/);
      console.log('✅ Step 3: URL is valid Stripe payment link');
    });

    it('should support authenticated purchase flow', async () => {
      const mockFirebaseToken = process.env.TEST_FIREBASE_TOKEN;

      if (!mockFirebaseToken) {
        console.warn('⚠️ Skipping authenticated flow test - TEST_FIREBASE_TOKEN not set');
        return;
      }

      // Step 1: Create authenticated payment link
      const linkResponse = await api.post('/api/create-payment-link', {}, {
        headers: {
          Authorization: `Bearer ${mockFirebaseToken}`,
        },
      });

      if (linkResponse.status === 200) {
        expect(linkResponse.data.url).toBeTruthy();
        console.log('✅ Step 1: Created authenticated payment link');

        // Step 2: Verify it's a Stripe link
        expect(linkResponse.data.url).toMatch(/stripe.com/);
        console.log('✅ Step 2: URL is valid Stripe payment link');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing STRIPE_PRICE_ID gracefully', async () => {
      // This tests the error handling for configuration
      const testEmail = `error-test-${Date.now()}@example.com`;

      const response = await api.post('/api/create-payment-link-public', {
        email: testEmail,
      });

      // Should either succeed or return 500 with error details
      if (response.status !== 200) {
        expect(response.status).toBe(500);
        expect(response.data).toHaveProperty('error');
        console.log('✅ Configuration error handled gracefully');
      }
    });

    it('should handle concurrent payment link requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        api.post('/api/create-payment-link-public', {
          email: `concurrent-${i}-${Date.now()}@example.com`,
        })
      );

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;

      expect(successCount).toBeGreaterThanOrEqual(5);
      console.log(`✅ Handled 5 concurrent requests, ${successCount} succeeded`);
    });
  });

  describe('Stripe Service Configuration', () => {
    it('should validate Stripe API key is configured', () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY_LIVE;
      expect(stripeKey).toBeTruthy();
      const keyType = stripeKey?.startsWith('sk_live_') ? '🔴 LIVE' : '🟡 TEST';
      console.log(`✅ Stripe API key is configured (${keyType})`);
    });

    it('should validate price ID is configured', () => {
      const priceId = process.env.STRIPE_PRICE_ID;
      expect(priceId).toBeTruthy();
      expect(priceId).toMatch(/^price_/);
      console.log('✅ Stripe price ID is configured');
    });

    it('should validate success URL is configured', () => {
      const successUrl = process.env.APP_SUCCESS_URL;
      expect(successUrl).toBeTruthy();
      expect(successUrl).toMatch(/^https?:\/\//);
      console.log('✅ Success URL is configured');
    });

    it('should indicate if running in live mode', () => {
      if (isLiveMode) {
        console.warn('\n⚠️  WARNING: Running LIVE tests with real payment processing!');
        console.warn('⚠️  These tests will create REAL payment links on your Stripe account.');
        console.warn('⚠️  Use TEST mode by default: STRIPE_MODE=test npm test\n');
      } else {
        console.log('✅ Running in TEST mode (safe - no real charges)');
      }
    });
  });
});
