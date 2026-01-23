// Test: Verify cache tools are used in normal conversation flow
// This tests the ConversationService → ToolOrchestrator → NangoService.fetchFromCache pipeline

const axios = require('axios');

const BASE_URL = 'http://localhost:8080';
const TEST_SESSION_ID = `test_cache_${Date.now()}`;

async function testCacheInConversation() {
  console.log('\n🧪 Testing Cache Tools in Normal Conversation\n');
  console.log('This verifies that "fetch my emails" uses cache instead of live API\n');

  try {
    // Step 1: Send conversational message asking for emails
    console.log('1️⃣ Sending message: "Show me my latest 5 emails"\n');

    const startTime = Date.now();

    const response = await axios.post(`${BASE_URL}/api/chat`, {
      sessionId: TEST_SESSION_ID,
      message: 'Show me my latest 5 emails',
      userId: 'test-user-cache-demo',
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    const totalDuration = Date.now() - startTime;

    console.log(`✅ Response received in ${totalDuration}ms\n`);

    // Step 2: Check if tools were called
    console.log('2️⃣ Analyzing response for tool calls...\n');

    // The response might be streamed or contain tool execution results
    // Check server logs for "Routing fetch_emails to cache-based execution"

    console.log('📊 Expected behavior:');
    console.log('   - ToolOrchestrator should log: "Routing fetch_emails to cache-based execution"');
    console.log('   - NangoService.fetchFromCache() should be called');
    console.log('   - Duration: 1-3 seconds (cache) vs 3-5+ seconds (live API)');
    console.log('   - Response should include: { source: "cache" }');

    console.log('\n3️⃣ Performance Analysis:');

    if (totalDuration < 3000) {
      console.log(`   ✅ FAST (${totalDuration}ms) - Likely using cache`);
    } else if (totalDuration < 5000) {
      console.log(`   ⚠️  MODERATE (${totalDuration}ms) - Could be cache or slow network`);
    } else {
      console.log(`   ❌ SLOW (${totalDuration}ms) - Might be using live API (check logs)`);
    }

    // Step 3: Instructions for verification
    console.log('\n4️⃣ Verification Steps:');
    console.log('   Check backend logs for:');
    console.log('   ✅ "Routing fetch_emails to cache-based execution"');
    console.log('   ✅ "Executing cache-based tool"');
    console.log('   ✅ "fetchFromCache" API call');
    console.log('   ❌ Should NOT see "fetch-emails action trigger" (that would be live API)');

    console.log('\n5️⃣ Tool Config Verification:');
    console.log('   In config/tool-config.json, fetch_emails should have:');
    console.log('   {');
    console.log('     "name": "fetch_emails",');
    console.log('     "source": "cache",          ← CRITICAL');
    console.log('     "cache_model": "GmailEmail" ← MODEL NAME');
    console.log('   }');

    console.log('\n✅ Test Complete!\n');
    console.log('If logs show "cache-based execution" → Cache tools are working ✅');
    console.log('If logs show "action-based execution" → Need to add "source": "cache" ⚠️\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    console.error('\nPossible issues:');
    console.error('1. Server not running (start with: npm run dev)');
    console.error('2. User not connected to Gmail (check /api/cortex/connections)');
    console.error('3. Tool config missing "source": "cache" flag');
  }
}

// Run test
testCacheInConversation();
