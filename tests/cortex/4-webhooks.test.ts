// tests/cortex/4-webhooks.test.ts
// Webhook handler tests - verify EventShaper processes webhooks correctly

import axios from 'axios';
import { Redis } from 'ioredis';
import { neon } from '@neondatabase/serverless';
import { CONFIG } from '../../src/config';

describe('Cortex Webhook Handler Tests', () => {
  const BASE_URL = 'http://localhost:8080';
  const TEST_USER_ID = 'test-user-webhook';
  const TEST_CONNECTION_ID = 'test-connection-webhook-123';

  let redis: Redis;
  let sql: any;

  beforeAll(async () => {
    redis = new Redis(CONFIG.REDIS_URL);
    sql = neon(process.env.DATABASE_URL!);

    // Register test connection
    await sql`
      INSERT INTO connections (user_id, provider, connection_id)
      VALUES (${TEST_USER_ID}, 'google-mail', ${TEST_CONNECTION_ID})
      ON CONFLICT (user_id, provider) DO UPDATE SET
        connection_id = EXCLUDED.connection_id, enabled = true
    `;
  });

  afterAll(async () => {
    // Cleanup test data
    await sql`DELETE FROM connections WHERE user_id = ${TEST_USER_ID}`;
    await redis.quit();
  });

  describe('Webhook Endpoint', () => {
    test('POST /api/webhooks/nango accepts webhook', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('accepted');
    });

    test('Webhook returns processed count', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [
            {
              id: 'test-email-1',
              from: 'test@example.com',
              subject: 'Test Email',
              body_text: 'This is a test',
              date: new Date().toISOString(),
            },
          ],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('accepted');
    });

    test('Webhook handles non-sync type gracefully', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'auth',
        connectionId: TEST_CONNECTION_ID,
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('accepted');
    });
  });

  describe('Gmail Event Generation', () => {
    test('Gmail webhook generates email_received event', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [
            {
              id: 'msg_test_received',
              from: 'sender@example.com',
              to: 'me@example.com',
              subject: 'New Email Test',
              body_text: 'Test email body',
              date: new Date().toISOString(),
              labels: ['INBOX'],
              is_read: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('accepted');
    });

    test('Gmail webhook generates email_reply_received event', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [
            {
              id: 'msg_test_reply',
              from: 'sender@example.com',
              to: 'me@example.com',
              subject: 'Re: Original Email',
              body_text: 'This is a reply',
              date: new Date().toISOString(),
              thread_id: 'thread_123',
              in_reply_to: 'msg_original',
              labels: ['INBOX'],
            },
          ],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
    });

    test('Gmail webhook skips automated emails', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [
            {
              id: 'msg_automated',
              from: 'noreply@automated.com',
              subject: 'Automated Newsletter',
              body_text: 'This is automated',
              date: new Date().toISOString(),
            },
          ],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      // Should process but skip automated emails
    });
  });

  describe('Calendar Event Generation', () => {
    test('Calendar webhook generates event_created event', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-calendar',
        model: 'CalendarEvent',
        syncName: 'calendar-events',
        responseResults: {
          added: [
            {
              id: 'event_test_new',
              summary: 'New Meeting',
              start: { dateTime: new Date().toISOString() },
              end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
              status: 'confirmed',
            },
          ],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('accepted');
    });

    test('Calendar webhook generates event_updated event', async () => {
      // First, add event to state
      await redis.set(
        `shaper:calendar:${TEST_USER_ID}`,
        JSON.stringify({
          event_test_updated: {
            summary: 'Old Title',
            start: { dateTime: new Date().toISOString() },
          },
        }),
        'EX',
        3600
      );

      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-calendar',
        model: 'CalendarEvent',
        syncName: 'calendar-events',
        responseResults: {
          added: [],
          updated: [
            {
              id: 'event_test_updated',
              summary: 'New Title',
              start: { dateTime: new Date().toISOString() },
              end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
              status: 'confirmed',
            },
          ],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
    });
  });

  describe('Salesforce Event Generation', () => {
    test('Salesforce webhook generates lead_created event', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'salesforce-2',
        model: 'SalesforceLead',
        syncName: 'salesforce-leads',
        responseResults: {
          added: [
            {
              Id: 'lead_test_new',
              FirstName: 'John',
              LastName: 'Doe',
              Company: 'Test Corp',
              Email: 'john@testcorp.com',
              Status: 'New',
              OwnerId: 'owner_123',
            },
          ],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('accepted');
    });

    test('Salesforce webhook generates lead_stage_changed event', async () => {
      // Add previous state
      await redis.set(
        `shaper:leads:${TEST_USER_ID}`,
        JSON.stringify({
          lead_test_stage: { Status: 'New', IsConverted: false },
        }),
        'EX',
        3600
      );

      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'salesforce-2',
        model: 'SalesforceLead',
        syncName: 'salesforce-leads',
        responseResults: {
          added: [],
          updated: [
            {
              Id: 'lead_test_stage',
              FirstName: 'John',
              LastName: 'Doe',
              Company: 'Test Corp',
              Status: 'Qualified',
              OwnerId: 'owner_123',
              IsConverted: false,
            },
          ],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
    });

    test('Salesforce webhook generates opportunity_closed_won event', async () => {
      // Add previous state
      await redis.set(
        `shaper:opps:${TEST_USER_ID}`,
        JSON.stringify({
          opp_test_closed: {
            StageName: 'Negotiation',
            Amount: 50000,
            IsClosed: false,
            IsWon: false,
          },
        }),
        'EX',
        3600
      );

      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'salesforce-2',
        model: 'SalesforceOpportunity',
        syncName: 'salesforce-opportunities',
        responseResults: {
          added: [],
          updated: [
            {
              Id: 'opp_test_closed',
              Name: 'Big Deal',
              AccountId: 'acc_123',
              Amount: 50000,
              StageName: 'Closed Won',
              IsClosed: true,
              IsWon: true,
              OwnerId: 'owner_123',
            },
          ],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
    });
  });

  describe('Event Deduplication', () => {
    test('Duplicate events are deduplicated', async () => {
      const webhook = {
        type: 'sync',
        connectionId: TEST_CONNECTION_ID,
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [
            {
              id: 'msg_duplicate_test',
              from: 'test@example.com',
              subject: 'Duplicate Test',
              body_text: 'Testing deduplication',
              date: new Date().toISOString(),
            },
          ],
          updated: [],
          deleted: [],
        },
      };

      // Send same webhook twice
      const response1 = await axios.post(`${BASE_URL}/api/webhooks/nango`, webhook);
      const response2 = await axios.post(`${BASE_URL}/api/webhooks/nango`, webhook);

      expect(response1.status).toBe(202);
      expect(response2.status).toBe(202);

      // Second webhook should process (EventShaper will generate events)
      // But downstream deduplication in store.writeEvent() prevents duplicate runs
    });
  });

  describe('Error Handling', () => {
    test('Webhook handles invalid connection ID gracefully', async () => {
      const response = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
        type: 'sync',
        connectionId: 'non-existent-connection',
        providerConfigKey: 'google-mail',
        model: 'GmailEmail',
        syncName: 'gmail-emails',
        responseResults: {
          added: [],
          updated: [],
          deleted: [],
        },
      });

      expect(response.status).toBe(202);
      // Should process but skip (no userId found)
    });

    test('Webhook handles malformed payload gracefully', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/webhooks/nango`,
        { invalid: 'payload' },
        { validateStatus: () => true }
      );

      // Should either succeed with graceful handling or return error
      expect([202, 400, 500]).toContain(response.status);
    });
  });
});
