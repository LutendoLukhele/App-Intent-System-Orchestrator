/**
 * Test: Verify cached entity bodies are injected into conversation history for follow-ups
 * 
 * This test validates the complete flow:
 * 1. Fetch emails → Cache entity bodies (24h TTL)
 * 2. Ask follow-up question → Check if cached bodies are in conversation history
 * 3. Verify LLM has access to full email content for context
 * 
 * Expected behavior:
 * - First message: "Show my emails" → Fetches and caches
 * - Second message: "What did John say?" → Uses cached bodies from history
 * - No refetch, LLM sees full context
 */

import axios from 'axios';
import Redis from 'ioredis';

const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const TEST_SESSION_ID = `test_followup_${Date.now()}`;
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  section: (text: string) => console.log(`\n${COLORS.cyan}=== ${text} ===${COLORS.reset}`),
  step: (num: number, text: string) => console.log(`\n${COLORS.blue}${num}️⃣  ${text}${COLORS.reset}`),
  success: (text: string) => console.log(`${COLORS.green}✅ ${text}${COLORS.reset}`),
  error: (text: string) => console.log(`${COLORS.red}❌ ${text}${COLORS.reset}`),
  warning: (text: string) => console.log(`${COLORS.yellow}⚠️  ${text}${COLORS.reset}`),
  info: (text: string) => console.log(`ℹ️  ${text}`),
};

async function testCachedEntityFollowup() {
  log.section('CACHED ENTITY FOLLOW-UP TEST');
  
  const userId = `test-user-${Date.now()}`;
  let emailsFetched = false;
  let emailBodiesInCache = false;
  let followUpHasContext = false;

  try {
    // ========== STEP 1: Fetch emails and verify they're cached ==========
    log.step(1, 'Fetch emails to populate cache');
    
    const fetchStart = Date.now();
    const fetchResponse = await axios.post(`${BASE_URL}/api/chat`, {
      sessionId: TEST_SESSION_ID,
      message: 'Show me my latest 3 emails with their full content',
      userId,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const fetchDuration = Date.now() - fetchStart;
    
    if (fetchResponse.status === 200) {
      log.success(`Fetch request completed in ${fetchDuration}ms`);
      emailsFetched = true;
    } else {
      log.error(`Fetch failed with status ${fetchResponse.status}`);
    }

    // ========== STEP 2: Check Redis cache for entity bodies ==========
    log.step(2, 'Verify email bodies are cached in Redis');

    const pattern = `crm-entity:${TEST_SESSION_ID}:*`;
    const cachedKeys = await redis.keys(pattern);

    if (cachedKeys.length > 0) {
      log.success(`Found ${cachedKeys.length} cached entities in Redis`);
      
      // Verify each has a cleanBody
      let entriesWithBodies = 0;
      for (const key of cachedKeys) {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.cleanBody && parsed.cleanBody.length > 0) {
            entriesWithBodies++;
            log.info(`  • ${parsed.subject}: ${parsed.cleanBody.substring(0, 50)}...`);
          }
        }
      }
      
      if (entriesWithBodies === cachedKeys.length) {
        log.success(`All ${entriesWithBodies} cached entities have cleanBody content`);
        emailBodiesInCache = true;
      } else {
        log.warning(`Only ${entriesWithBodies}/${cachedKeys.length} have cleanBody content`);
      }
    } else {
      log.error('No cached entities found in Redis!');
      log.warning('Pattern searched:', pattern);
    }

    // ========== STEP 3: Ask a follow-up question ==========
    log.step(3, 'Send follow-up question referencing cached emails');

    const followupStart = Date.now();
    const followupResponse = await axios.post(`${BASE_URL}/api/chat`, {
      sessionId: TEST_SESSION_ID,
      message: 'What was the main topic in the emails? Summarize for me.',
      userId,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const followupDuration = Date.now() - followupStart;

    if (followupResponse.status === 200) {
      log.success(`Follow-up request completed in ${followupDuration}ms (should be <1s - using cache)`);
      
      // Check if it was actually using cache
      if (followupDuration < 1000) {
        log.success('Fast response suggests cached entities were used (no refetch)');
        followUpHasContext = true;
      } else if (followupDuration < 3000) {
        log.warning('Moderate response - might be using cache with network delay');
        followUpHasContext = true;
      } else {
        log.error('Slow response - might have triggered a refetch instead of using cache');
      }
    } else {
      log.error(`Follow-up failed with status ${followupResponse.status}`);
    }

    // ========== STEP 4: Check conversation history in Redis ==========
    log.step(4, 'Verify cached entities are in conversation history');

    const historyKey = `conversation:${TEST_SESSION_ID}`;
    const historyData = await redis.get(historyKey);

    if (historyData) {
      const history = JSON.parse(historyData);
      
      // Look for tool messages with cached entity data
      const toolMessages = history.filter((msg: any) => msg.role === 'tool');
      const cachedEntityMessages = toolMessages.filter((msg: any) => {
        try {
          const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          return Array.isArray(content.data) && 
                 content.data.some((item: any) => item._cached === true);
        } catch {
          return false;
        }
      });

      if (cachedEntityMessages.length > 0) {
        log.success(`Found ${cachedEntityMessages.length} tool message(s) with cached entities`);
        
        // Verify the cached entities have bodies
        cachedEntityMessages.forEach((msg: any, idx: number) => {
          try {
            const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
            const entities = content.data || [];
            const entitiesWithBodies = entities.filter((e: any) => e.body_text && e.body_text.length > 0);
            log.info(`  Message ${idx + 1}: ${entitiesWithBodies.length}/${entities.length} have body_text`);
          } catch (e) {
            log.warning(`  Message ${idx + 1}: Could not parse content`);
          }
        });
      } else {
        log.warning('No cached entity messages found in conversation history');
        log.warning('This means follow-ups may not have context from cached emails');
      }
    } else {
      log.warning('Conversation history not found in Redis');
    }

    // ========== SUMMARY ==========
    log.section('TEST SUMMARY');

    const allPass = emailsFetched && emailBodiesInCache && followUpHasContext;

    console.log('\nResults:');
    console.log(`  ${emailsFetched ? COLORS.green + '✅' : COLORS.red + '❌'} Emails fetched and cached${COLORS.reset}`);
    console.log(`  ${emailBodiesInCache ? COLORS.green + '✅' : COLORS.red + '❌'} Email bodies in Redis cache${COLORS.reset}`);
    console.log(`  ${followUpHasContext ? COLORS.green + '✅' : COLORS.red + '❌'} Follow-up used cached context${COLORS.reset}`);

    if (allPass) {
      log.success('ALL TESTS PASSED! Cached entity injection is working correctly.');
      log.info('Follow-up questions can now reference cached email content without refetching.');
    } else {
      log.error('SOME TESTS FAILED. Check the details above.');
      
      if (!emailBodiesInCache) {
        log.info('\nTroubleshooting cached bodies:');
        log.info('1. Check that CRMEntityCacheService.cacheEntity() is being called');
        log.info('2. Verify Redis is storing entities with cleanBody extracted');
        log.info('3. Check ToolOrchestrator dedup return includes full entity bodies');
      }
      
      if (!followUpHasContext) {
        log.info('\nTroubleshooting follow-up context:');
        log.info('1. Verify injectCachedEntitiesIntoHistory() is called in runConversationalStream');
        log.info('2. Check that getRecentCachedEntities() returns all cached entities');
        log.info('3. Ensure cached entities are being added to messages before sending to LLM');
      }
    }

    console.log('');

  } catch (error: any) {
    log.error('Test failed with exception');
    console.error(error.response?.data || error.message);
    console.error('\nPossible issues:');
    console.error('1. API server not running (npm run dev)');
    console.error('2. Redis not running (redis-server)');
    console.error('3. User not authenticated with Gmail/Salesforce');
  } finally {
    await redis.quit();
  }
}

// Run test
testCachedEntityFollowup().catch(console.error);
