// scripts/test-cortex-live.ts
// Live test with real Nango connection

import axios from 'axios';

const BASE_URL = 'http://localhost:8080';
const USER_ID = 'test-user-live-' + Date.now();
const CONNECTION_ID = '8716bc9a-694a-4891-98dc-61fcadd7cde4'; // Real Nango connection

async function testCortexLive() {
  console.log('\n🚀 Cortex Live Integration Test\n');
  console.log('='.repeat(60));
  console.log(`User ID: ${USER_ID}`);
  console.log(`Connection ID: ${CONNECTION_ID}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Register the connection
    console.log('\n📡 Step 1: Registering connection...');
    const connRes = await axios.post(
      `${BASE_URL}/api/connections`,
      {
        provider: 'google-mail',
        connectionId: CONNECTION_ID,
      },
      {
        headers: { 'x-user-id': USER_ID },
      }
    );
    console.log('✅ Connection registered:', connRes.data);

    // Step 2: Create a simple test automation
    console.log('\n📡 Step 2: Creating test automation...');
    const unitRes = await axios.post(
      `${BASE_URL}/api/cortex/units`,
      {
        when: 'I receive an email',
        then: 'log it',
      },
      {
        headers: { 'x-user-id': USER_ID },
      }
    );
    console.log('✅ Unit created:', {
      id: unitRes.data.unit.id,
      name: unitRes.data.unit.name,
      status: unitRes.data.unit.status,
      trigger: unitRes.data.unit.when,
      actions: unitRes.data.unit.then.map((a: any) => a.type),
    });

    const unitId = unitRes.data.unit.id;

    // Step 3: Instructions for testing
    console.log('\n' + '='.repeat(60));
    console.log('✅ Setup Complete! Now test the automation:\n');
    console.log('1. Send yourself a test email');
    console.log('2. Wait ~5-10 seconds for the poller to detect it');
    console.log('3. Check execution history with the command below:\n');
    console.log(`curl -X GET ${BASE_URL}/api/cortex/runs \\`);
    console.log(`  -H "x-user-id: ${USER_ID}"\n`);
    console.log('4. Or run this monitoring script:\n');
    console.log(`   npx ts-node scripts/monitor-cortex-runs.ts ${USER_ID}\n`);
    console.log('='.repeat(60));

    // Step 4: Monitor for runs
    console.log('\n🔄 Monitoring for automation runs (checking every 5 seconds)...');
    console.log('Press Ctrl+C to stop\n');

    let checkCount = 0;
    const maxChecks = 60; // Monitor for 5 minutes max

    const monitor = setInterval(async () => {
      try {
        checkCount++;
        const runsRes = await axios.get(`${BASE_URL}/api/cortex/runs`, {
          headers: { 'x-user-id': USER_ID },
        });

        const runs = runsRes.data.runs || [];

        if (runs.length > 0) {
          console.log(`\n🎉 SUCCESS! Found ${runs.length} run(s):\n`);
          runs.forEach((run: any, i: number) => {
            console.log(`Run ${i + 1}:`);
            console.log(`  ID: ${run.id}`);
            console.log(`  Status: ${run.status}`);
            console.log(`  Started: ${run.started_at}`);
            console.log(`  Completed: ${run.completed_at || 'In progress'}`);
            if (run.error) console.log(`  Error: ${run.error}`);
            console.log('');
          });
          clearInterval(monitor);
          process.exit(0);
        } else {
          process.stdout.write(`\r⏳ Check ${checkCount}/${maxChecks}: No runs yet... (Send yourself an email to trigger)`);
        }

        if (checkCount >= maxChecks) {
          console.log('\n\n⏱️  Timeout: No runs detected after 5 minutes');
          console.log('Make sure you:');
          console.log('  1. Sent yourself an email');
          console.log('  2. Server is running (npm run dev)');
          console.log('  3. Connection is valid and authorized');
          clearInterval(monitor);
          process.exit(1);
        }
      } catch (err: any) {
        console.error('\n❌ Error checking runs:', err.message);
      }
    }, 5000);

  } catch (error: any) {
    console.error('\n❌ Test Failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

console.log('Starting Cortex live test...');
console.log('Make sure the server is running on port 8080!\n');

testCortexLive().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
