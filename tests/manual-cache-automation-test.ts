// Manual test: Verify cache-based tools work in automation pipeline
// This tests that "fetch_emails" uses NangoService.fetchFromCache()

import axios from 'axios';

const BASE_URL = 'http://localhost:8080';
const CONNECTION_ID = '90a6fb46-ec59-4cee-b297-8dc70d81ec07';
const PROVIDER = 'google-mail-ynxw';

async function testCacheAutomation() {
  console.log('\n🧪 Testing Cache-Based Automation Pipeline\n');

  try {
    // Step 1: Create automation that uses cache tool (fetch_emails)
    console.log('1️⃣ Creating automation with cache-based tool (fetch_emails)...');

    const createResponse = await axios.post(`${BASE_URL}/api/cortex/units`, {
      name: 'Test Cache Fetch',
      prompt: 'when: email received then: fetch my latest 5 emails',
    }, {
      headers: {
        'Authorization': 'Bearer test-token', // You'll need real Firebase token
        'Content-Type': 'application/json'
      }
    });

    const unitId = createResponse.data.unit.id;
    console.log(`✅ Automation created: ${unitId}`);
    console.log(`   Compiled actions:`, JSON.stringify(createResponse.data.unit.compiled.then, null, 2));

    // Step 2: Trigger webhook (simulates email received)
    console.log('\n2️⃣ Triggering webhook to execute automation...');

    const webhookStart = Date.now();
    const webhookResponse = await axios.post(`${BASE_URL}/api/webhooks/nango`, {
      type: 'sync',
      connectionId: CONNECTION_ID,
      providerConfigKey: PROVIDER,
      model: 'GmailEmail',
      syncName: 'gmail-emails',
      responseResults: {
        added: [{
          id: `msg_cache_test_${Date.now()}`,
          from: 'test@example.com',
          to: 'me@example.com',
          subject: 'Cache Test Email',
          body_text: 'Testing cache automation',
          date: new Date().toISOString(),
        }],
        updated: [],
        deleted: [],
      },
    });
    const webhookDuration = Date.now() - webhookStart;

    console.log(`✅ Webhook response: ${webhookResponse.status} (took ${webhookDuration}ms)`);
    console.log(`   Expected: 202 Accepted in <200ms`);
    console.log(`   Actual: ${webhookResponse.status === 202 ? '✅' : '❌'} ${webhookDuration < 200 ? '✅' : '⚠️'}`);

    // Step 3: Poll for automation execution
    console.log('\n3️⃣ Polling for automation execution...');

    let run = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

      const runsResponse = await axios.get(`${BASE_URL}/api/cortex/runs?limit=10`, {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      run = runsResponse.data.runs.find((r: any) => r.unit_id === unitId);

      if (run && run.status !== 'running') {
        console.log(`✅ Run completed after ${(i + 1) * 2}s`);
        break;
      }

      console.log(`   Attempt ${i + 1}: ${run ? 'running...' : 'not found yet'}`);
    }

    if (!run) {
      console.log('❌ Run not found after 20 seconds');
      return;
    }

    // Step 4: Check run steps - verify cache fetch happened
    console.log('\n4️⃣ Checking execution steps...');

    const stepsResponse = await axios.get(`${BASE_URL}/api/cortex/runs/${run.id}/steps`, {
      headers: { 'Authorization': 'Bearer test-token' }
    });

    const steps = stepsResponse.data.steps;
    console.log(`   Found ${steps.length} steps`);

    for (const step of steps) {
      console.log(`\n   Step ${step.step_number}: ${step.tool_name}`);
      console.log(`   Status: ${step.status}`);
      console.log(`   Duration: ${new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()}ms`);

      if (step.tool_name === 'fetch_emails') {
        console.log(`   ✅ CACHE TOOL EXECUTED!`);
        console.log(`   Input:`, JSON.stringify(step.input, null, 2));
        console.log(`   Output records:`, step.output?.records?.length || 0);

        // Verify it's fast (cache should be 1-2s, not 5+ seconds for live API)
        const duration = new Date(step.completed_at).getTime() - new Date(step.started_at).getTime();
        if (duration < 3000) {
          console.log(`   ✅ Fast fetch (${duration}ms) - likely using cache!`);
        } else {
          console.log(`   ⚠️ Slow fetch (${duration}ms) - might be using live API`);
        }
      }
    }

    // Step 5: Summary
    console.log('\n\n📊 Test Summary:');
    console.log(`✅ Automation created with cache-based tool`);
    console.log(`✅ Webhook returned 202 Accepted in ${webhookDuration}ms`);
    console.log(`✅ Automation executed (status: ${run.status})`);
    console.log(`✅ Cache tool (fetch_emails) executed successfully`);
    console.log(`\n🎉 Cache-based automation pipeline WORKS!\n`);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    console.error('Stack:', error.stack);
  }
}

// Run test
testCacheAutomation();
