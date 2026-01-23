// Test Google Mail connection with real connection ID
import { NangoService } from '../src/services/NangoService';

const GOOGLE_MAIL_CONNECTION_ID = '90a6fb46-ec59-4cee-b297-8dc70d81ec07';
const GOOGLE_MAIL_PROVIDER = 'google-mail-ynxw'; // Provider config key from Nango

async function testGmailConnection() {
  console.log('🧪 Testing Google Mail connection...\n');

  const nangoService = new NangoService();

  try {
    // Test 1: Validate connection
    console.log('1️⃣  Validating connection...');
    const validation = await nangoService.validateConnection(
      GOOGLE_MAIL_PROVIDER,
      GOOGLE_MAIL_CONNECTION_ID
    );
    console.log('✅ Connection valid:', validation);

    // Test 2: Fetch recent emails from cache
    console.log('\n2️⃣  Fetching recent emails from Nango cache...');
    const result = await nangoService.fetchFromCache(
      GOOGLE_MAIL_PROVIDER,
      GOOGLE_MAIL_CONNECTION_ID,
      'GmailEmail',
      { limit: 5 }
    );

    console.log(`✅ Fetched ${result.records.length} emails`);

    if (result.records.length > 0) {
      console.log('\n📧 Sample email:');
      const email = result.records[0];
      console.log({
        from: email.from || email.sender,
        subject: email.subject,
        date: email.date || email.receivedAt,
        snippet: email.body_text?.substring(0, 100) || 'No preview',
      });
    }

    console.log('\n✅ All tests passed! Google Mail connection is working.');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testGmailConnection();
