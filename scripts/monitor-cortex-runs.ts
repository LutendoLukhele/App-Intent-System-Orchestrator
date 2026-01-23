// scripts/monitor-cortex-runs.ts
// Simple script to monitor Cortex runs for a user

import axios from 'axios';

const BASE_URL = 'http://localhost:8080';
const USER_ID = process.argv[2];

if (!USER_ID) {
  console.error('Usage: npx ts-node scripts/monitor-cortex-runs.ts <user-id>');
  process.exit(1);
}

async function monitorRuns() {
  console.log(`\n🔍 Monitoring Cortex runs for user: ${USER_ID}\n`);
  console.log('Press Ctrl+C to stop\n');

  let lastRunCount = 0;

  setInterval(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/cortex/runs`, {
        headers: { 'x-user-id': USER_ID },
      });

      const runs = res.data.runs || [];

      if (runs.length !== lastRunCount) {
        console.log(`\n📊 Found ${runs.length} run(s) (updated at ${new Date().toLocaleTimeString()}):\n`);

        runs.forEach((run: any, i: number) => {
          console.log(`${i + 1}. ${run.id}`);
          console.log(`   Status: ${run.status}`);
          console.log(`   Started: ${new Date(run.started_at).toLocaleString()}`);
          if (run.completed_at) {
            console.log(`   Completed: ${new Date(run.completed_at).toLocaleString()}`);
          }
          if (run.error) {
            console.log(`   ❌ Error: ${run.error}`);
          }
          console.log('');
        });

        lastRunCount = runs.length;
      } else {
        process.stdout.write(`\r⏳ ${new Date().toLocaleTimeString()} - ${runs.length} run(s) - Waiting for changes...`);
      }
    } catch (err: any) {
      console.error('\n❌ Error:', err.message);
    }
  }, 5000);
}

monitorRuns().catch(console.error);
