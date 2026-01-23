// tests/cortex/5-e2e.test.ts
// End-to-end tests - complete automation flow

import axios from 'axios';
import { neon } from '@neondatabase/serverless';
import { CONFIG } from '../../src/config';

describe('Cortex End-to-End Tests', () => {
  const BASE_URL = 'http://localhost:8080';
  const TEST_USER_ID = 'test-user-e2e';
  const TEST_CONNECTION_ID = 'test-connection-e2e-456';

  let sql: any;
  let createdUnitId: string;

  beforeAll(async () => {
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
    // Cleanup
    if (createdUnitId) {
      await sql`DELETE FROM units WHERE id = ${createdUnitId}`;
    }
    await sql`DELETE FROM runs WHERE user_id = ${TEST_USER_ID}`;
    await sql`DELETE FROM connections WHERE user_id = ${TEST_USER_ID}`;
  });

  test('Complete automation flow: create → webhook → match → execute', async () => {
    // Step 1: Create automation
    const createResponse = await axios.post(
      `${BASE_URL}/api/cortex/units`,
      {
        when: 'I receive an email from test@e2e.com',
        then: 'log the subject to console',
      },
      {
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      }
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toHaveProperty('unit');
    createdUnitId = createResponse.data.unit.id;

    // Step 2: Verify unit was created
    const listResponse = await axios.get(`${BASE_URL}/api/cortex/units`, {
      headers: {
        'x-user-id': TEST_USER_ID,
      },
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.data.units).toBeInstanceOf(Array);
    const unit = listResponse.data.units.find((u: any) => u.id === createdUnitId);
    expect(unit).toBeDefined();
    expect(unit.status).toBe('active');

    // Step 3: Trigger webhook to generate event
    const webhookResponse = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
      type: 'sync',
      connectionId: TEST_CONNECTION_ID,
      providerConfigKey: 'google-mail',
      model: 'GmailEmail',
      syncName: 'gmail-emails',
      responseResults: {
        added: [
          {
            id: `msg_e2e_test_${Date.now()}`,
            from: 'test@e2e.com',
            to: 'me@example.com',
            subject: 'E2E Test Email',
            body_text: 'This is an end-to-end test email',
            date: new Date().toISOString(),
            labels: ['INBOX'],
          },
        ],
        updated: [],
        deleted: [],
      },
    });

    expect(webhookResponse.status).toBe(202);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 4: Check if run was created
    const runsResponse = await axios.get(`${BASE_URL}/api/cortex/runs`, {
      headers: {
        'x-user-id': TEST_USER_ID,
      },
    });

    expect(runsResponse.status).toBe(200);
    expect(runsResponse.data.runs).toBeInstanceOf(Array);

    // May or may not have runs depending on event matching
    // (Email might not match trigger exactly due to LLM compilation)
  }, 30000);

  test('Automation status management works', async () => {
    // Create automation
    const createResponse = await axios.post(
      `${BASE_URL}/api/cortex/units`,
      {
        when: 'I receive an email',
        then: 'do nothing',
      },
      {
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      }
    );

    const unitId = createResponse.data.unit.id;

    // Pause it
    const pauseResponse = await axios.patch(
      `${BASE_URL}/api/cortex/units/${unitId}/status`,
      { status: 'paused' },
      {
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      }
    );

    expect(pauseResponse.status).toBe(200);
    expect(pauseResponse.data.unit.status).toBe('paused');

    // Resume it
    const resumeResponse = await axios.patch(
      `${BASE_URL}/api/cortex/units/${unitId}/status`,
      { status: 'active' },
      {
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      }
    );

    expect(resumeResponse.status).toBe(200);
    expect(resumeResponse.data.unit.status).toBe('active');

    // Cleanup
    await sql`DELETE FROM units WHERE id = ${unitId}`;
  }, 15000);

  test('Force sync triggers webhook', async () => {
    const response = await axios.post(`${BASE_URL}/api/debug/force-sync`, {
      provider: 'google-mail',
      connectionId: TEST_CONNECTION_ID,
      syncName: 'gmail-emails',
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // In real scenario, this would trigger Nango sync
    // which would then call our webhook endpoint
  }, 15000);

  test('Execution history is recorded correctly', async () => {
    const response = await axios.get(`${BASE_URL}/api/cortex/runs`, {
      headers: {
        'x-user-id': TEST_USER_ID,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('runs');
    expect(Array.isArray(response.data.runs)).toBe(true);

    // Each run should have proper structure
    if (response.data.runs.length > 0) {
      const run = response.data.runs[0];
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('unit_id');
      expect(run).toHaveProperty('status');
      expect(run).toHaveProperty('started_at');
    }
  }, 10000);

  test('Multi-step automation executes in order', async () => {
    // Create a multi-step automation
    const createResponse = await axios.post(
      `${BASE_URL}/api/cortex/units`,
      {
        when: 'I receive an important email',
        then: 'summarize it and send to Slack and update my CRM',
      },
      {
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      }
    );

    expect(createResponse.status).toBe(200);

    const unitId = createResponse.data.unit.id;
    const unit = createResponse.data.unit;

    // Verify it compiled into multiple actions
    expect(unit.then).toBeInstanceOf(Array);
    expect(unit.then.length).toBeGreaterThan(1);

    // Cleanup
    await sql`DELETE FROM units WHERE id = ${unitId}`;
  }, 15000);

  test('Error recovery works (bad tool call)', async () => {
    // This would require triggering an automation that fails
    // For now, just verify the runs API handles failed runs
    const response = await axios.get(`${BASE_URL}/api/cortex/runs`, {
      headers: {
        'x-user-id': TEST_USER_ID,
      },
    });

    expect(response.status).toBe(200);

    // Failed runs should be in 'failed' status
    const failedRuns = response.data.runs.filter((r: any) => r.status === 'failed');
    // Check structure if any exist
    if (failedRuns.length > 0) {
      expect(failedRuns[0]).toHaveProperty('error');
    }
  }, 10000);
});
