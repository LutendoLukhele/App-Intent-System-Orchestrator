// scripts/test-cache-reading.ts
// Test script to verify NangoService cache reading functionality

import { NangoService } from '../src/services/NangoService';

const CONNECTION_ID = '8716bc9a-694a-4891-98dc-61fcadd7cde4'; // Your real connection

async function testCacheReading() {
  console.log('\n🧪 Testing Nango Cache Reading Functionality\n');
  console.log('='.repeat(70));

  const nangoService = new NangoService();

  // Test 1: Fetch Gmail emails from cache
  console.log('\n📧 Test 1: Fetching Gmail emails from cache...');
  try {
    const emailResult = await nangoService.fetchFromCache(
      'google-mail',
      CONNECTION_ID,
      'GmailEmail',
      { limit: 5 }
    );

    console.log(`✅ Success! Found ${emailResult.records.length} emails in cache`);
    if (emailResult.records.length > 0) {
      console.log('\nSample email:');
      const sample = emailResult.records[0];
      console.log(`  ID: ${sample.id}`);
      console.log(`  From: ${sample.from || 'N/A'}`);
      console.log(`  Subject: ${sample.subject || 'N/A'}`);
      console.log(`  Date: ${sample.date || sample.received_at || 'N/A'}`);
    }
    if (emailResult.nextCursor) {
      console.log(`\nNext cursor available: ${emailResult.nextCursor}`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 Failed:', error.message);
    console.log('\nNote: This may fail if:');
    console.log('  1. Nango sync "gmail-emails" is not configured');
    console.log('  2. No data has been synced yet');
    console.log('  3. Model name "GmailEmail" does not match your Nango config');
  }

  // Test 2: Fetch Calendar events from cache
  console.log('\n\n📅 Test 2: Fetching Calendar events from cache...');
  try {
    const calendarResult = await nangoService.fetchFromCache(
      'google-calendar',
      CONNECTION_ID,
      'CalendarEvent',
      { limit: 5 }
    );

    console.log(`✅ Success! Found ${calendarResult.records.length} calendar events in cache`);
    if (calendarResult.records.length > 0) {
      console.log('\nSample event:');
      const sample = calendarResult.records[0];
      console.log(`  ID: ${sample.id}`);
      console.log(`  Summary: ${sample.summary || sample.title || 'N/A'}`);
      console.log(`  Start: ${sample.start || sample.start_time || 'N/A'}`);
    }
  } catch (error: any) {
    console.error('❌ Test 2 Failed:', error.message);
    console.log('\nNote: This may fail if calendar sync is not configured');
  }

  // Test 3: Fetch Salesforce leads from cache
  console.log('\n\n💼 Test 3: Fetching Salesforce leads from cache...');
  try {
    const leadsResult = await nangoService.fetchFromCache(
      'salesforce-2',
      CONNECTION_ID,
      'SalesforceLead',
      { limit: 3 }
    );

    console.log(`✅ Success! Found ${leadsResult.records.length} leads in cache`);
    if (leadsResult.records.length > 0) {
      console.log('\nSample lead:');
      const sample = leadsResult.records[0];
      console.log(`  ID: ${sample.Id || sample.id || 'N/A'}`);
      console.log(`  Name: ${sample.Name || sample.FirstName + ' ' + sample.LastName || 'N/A'}`);
      console.log(`  Company: ${sample.Company || 'N/A'}`);
      console.log(`  Status: ${sample.Status || 'N/A'}`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 Failed:', error.message);
    console.log('\nNote: This may fail if Salesforce sync is not configured');
  }

  // Test 4: Trigger a sync manually
  console.log('\n\n🔄 Test 4: Manually triggering sync...');
  try {
    const syncResult = await nangoService.triggerSync(
      'google-mail',
      CONNECTION_ID,
      'gmail-emails'
    );

    if (syncResult.success) {
      console.log('✅ Success! Sync triggered successfully');
      console.log('   Wait a few seconds and run this test again to see new data');
    }
  } catch (error: any) {
    console.error('❌ Test 4 Failed:', error.message);
    console.log('\nNote: This may fail if:');
    console.log('  1. Sync "gmail-emails" is not configured in Nango');
    console.log('  2. The sync name is incorrect');
    console.log('  3. Connection is not authorized');
  }

  // Test 5: Pagination test
  console.log('\n\n📄 Test 5: Testing pagination with modified_after filter...');
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const paginatedResult = await nangoService.fetchFromCache(
      'google-mail',
      CONNECTION_ID,
      'GmailEmail',
      {
        limit: 2,
        modifiedAfter: yesterday.toISOString(),
      }
    );

    console.log(`✅ Success! Found ${paginatedResult.records.length} recent emails`);
    console.log(`   Modified after: ${yesterday.toISOString()}`);
    if (paginatedResult.nextCursor) {
      console.log(`   Next cursor: ${paginatedResult.nextCursor}`);
    }
  } catch (error: any) {
    console.error('❌ Test 5 Failed:', error.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎉 Cache Reading Tests Complete!\n');
  console.log('Next steps:');
  console.log('  1. If tests failed, configure Nango syncs in dashboard');
  console.log('  2. Set up webhook URL in Nango: http://localhost:8080/api/webhooks/nango');
  console.log('  3. Wait for first sync to complete');
  console.log('  4. Re-run this test to verify cache is populated\n');
}

// Run if main module
if (require.main === module) {
  testCacheReading()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { testCacheReading };
