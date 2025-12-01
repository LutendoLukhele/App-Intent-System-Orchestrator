const WebSocket = require('ws');

const BASE_URL = 'ws://localhost:8080';

// Test data
const tests = [
  {
    name: 'Test 1: Complete Calendar Request',
    message: 'Schedule a meeting with the sales team tomorrow at 2pm for 1 hour.',
    expectedBehavior: 'Should identify create_calendar_event tool with complete parameters'
  },
  {
    name: 'Test 2: Vague Calendar Request (Placeholder Fallback)',
    message: 'please make an exmple meetign nmycalednar',
    expectedBehavior: 'Should generate plan with {{PLACEHOLDER_*}} format'
  },
  {
    name: 'Test 3: Simple Request',
    message: 'just use place holders',
    expectedBehavior: 'Should handle gracefully with conversational response + placeholder plan'
  }
];

let currentTestIndex = 0;
let ws = null;

function log(test, msg, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${test}: ${msg}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function runNextTest() {
  if (currentTestIndex >= tests.length) {
    log('FINAL', 'All tests completed!');
    process.exit(0);
  }

  const test = tests[currentTestIndex];
  log('TEST', `Starting: ${test.name}`);
  log('TEST', `Input: ${test.message}`);
  log('TEST', `Expected: ${test.expectedBehavior}`);

  connectAndSendMessage(test);
  currentTestIndex++;
}

function connectAndSendMessage(test) {
  return new Promise((resolve) => {
    ws = new WebSocket(BASE_URL);
    let messageCount = 0;
    let hasToolCalls = false;
    let hasConversationalText = false;
    let placeholdersFound = [];

    ws.on('open', () => {
      log(test.name, 'Connected to WebSocket');

      // Send init message without idToken (for unauthenticated/dev mode)
      const initMsg = {
        type: 'init'
      };
      ws.send(JSON.stringify(initMsg));
    });

    ws.on('message', (data) => {
      messageCount++;
      const msg = JSON.parse(data);

      if (msg.type === 'auth_success' || msg.type === 'session_init') {
        log(test.name, 'Authentication/session established');
        
        // Send content after authentication
        setTimeout(() => {
          const contentMsg = {
            type: 'content',
            content: test.message
          };
          ws.send(JSON.stringify(contentMsg));
          log(test.name, 'Sent user message');
        }, 500);
      }

      if (msg.type === 'conversational_text_segment') {
        hasConversationalText = true;
        if (msg.content?.status === 'STREAMING' && msg.content?.segment?.segment) {
          process.stdout.write(msg.content.segment.segment);
        }
      }

      if (msg.type === 'run_updated' && msg.content?.toolExecutionPlan) {
        const plan = msg.content.toolExecutionPlan;
        hasToolCalls = plan.length > 0;
        
        plan.forEach(step => {
          const args = JSON.stringify(step.toolCall?.arguments || {});
          const placeholders = args.match(/\{\{PLACEHOLDER_\w+\}\}/g) || [];
          placeholdersFound = [...new Set([...placeholdersFound, ...placeholders])];
        });

        log(test.name, 'Run Updated:', {
          toolExecutionPlanCount: plan.length,
          tools: plan.map(s => s.toolCall?.name),
          placeholdersDetected: placeholdersFound
        });
      }

      // Wait for stream_end
      if (msg.type === 'stream_end' && msg.isFinal) {
        setTimeout(() => {
          log(test.name, 'Test Summary:', {
            hasConversationalResponse: hasConversationalText,
            hasToolCalls: hasToolCalls,
            placeholdersFound: placeholdersFound,
            totalMessagesReceived: messageCount
          });

          ws.close();
          setTimeout(runNextTest, 1000);
        }, 500);
      }
    });

    ws.on('error', (error) => {
      log(test.name, 'WebSocket Error:', error.message);
      process.exit(1);
    });

    ws.on('close', () => {
      log(test.name, 'Connection closed');
    });
  });
}

// Start tests
console.log('\n' + '='.repeat(70));
console.log('INTEGRATION TEST SUITE: Calendar Tool & Placeholder Fallback');
console.log('='.repeat(70));

runNextTest();

// Timeout safety
setTimeout(() => {
  console.error('Test suite timeout');
  process.exit(1);
}, 60000);
