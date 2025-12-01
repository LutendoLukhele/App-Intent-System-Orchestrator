# 📚 Practical Implementation Guide & Examples

## Table of Contents
1. [Quick Start](#quick-start)
2. [Step-by-Step Setup](#step-by-step-setup)
3. [Complete Working Examples](#complete-working-examples)
4. [Testing Your Features](#testing-your-features)
5. [Advanced Patterns](#advanced-patterns)
6. [Debugging & Tips](#debugging--tips)

---

## Quick Start

### 5-Minute Setup

```bash
# 1. Copy the framework files to your project
mkdir -p testing-framework/{core,modules,config,utils}

# 2. Install dependencies
npm install ws events

# 3. Copy provided templates
cp agentic-client.js testing-framework/core/
cp test-runner.js testing-framework/core/
# ... etc

# 4. Create your first test
cat > testing-framework/modules/hello-world.js << 'EOF'
class HelloWorldTest {
  constructor(client) {
    this.client = client;
  }

  async testBasic() {
    const response = await this.client.sendMessage('Hello!');
    const parsed = this.client.parseResponse(response);
    return { passed: parsed.content.length > 0 };
  }
}
module.exports = HelloWorldTest;
EOF

# 5. Run your first test
node run-first-test.js
```

### run-first-test.js

```javascript
const EnhancedAgenticClient = require('./testing-framework/core/agentic-client');
const TestRunner = require('./testing-framework/core/test-runner');
const HelloWorldTest = require('./testing-framework/modules/hello-world');

(async () => {
  const client = new EnhancedAgenticClient();
  await client.connect();
  await client.authenticate();

  const runner = new TestRunner();
  const tests = new HelloWorldTest(client);
  runner.registerSuite('hello-world', tests);

  const results = await runner.runSuite('hello-world');
  console.log(JSON.stringify(results, null, 2));

  await client.disconnect();
})().catch(console.error);
```

---

## Step-by-Step Setup

### Step 1: Project Structure

```bash
your-project/
├── src/                  # Your app code
├── testing-framework/
│   ├── core/
│   │   ├── agentic-client.js
│   │   ├── test-runner.js
│   │   └── result-aggregator.js
│   ├── modules/
│   │   ├── calendar-tests.js      # Feature tests
│   │   ├── auth-tests.js
│   │   └── custom-tests.js        # Template
│   ├── config/
│   │   └── default.config.js
│   ├── utils/
│   │   ├── response-parser.js
│   │   └── logger.js
│   ├── scripts/
│   │   ├── run-semi-automated.js
│   │   ├── run-automated.js
│   │   └── run-all.js
│   └── package.json
├── package.json
└── README.md
```

### Step 2: Setup Configuration

```javascript
// testing-framework/config/default.config.js

const config = {
  // Server settings
  server: {
    baseUrl: process.env.WS_URL || 'ws://localhost:8080',
    port: process.env.PORT || 8080,
    host: 'localhost'
  },

  // Client behavior
  client: {
    connectionTimeout: 5000,
    messageTimeout: 30000,
    autoAuth: true,
    logLevel: process.env.LOG_LEVEL || 'info'
  },

  // Test execution
  testing: {
    concurrency: 5,
    retryFailed: false,
    captureMetrics: true,
    captureRawData: process.env.DEBUG === 'true'
  },

  // Features
  features: [
    'calendar',
    'authentication',
    'streaming'
  ],

  // Reporting
  reporting: {
    format: 'json',
    outputPath: './test-results/',
    html: true,
    verbose: process.env.VERBOSE === 'true'
  }
};

module.exports = config;
```

### Step 3: Create Utility Helpers

```javascript
// testing-framework/utils/response-parser.js

class ResponseParser {
  static parse(rawResponse) {
    return {
      messages: rawResponse || [],
      content: ResponseParser.extractContent(rawResponse),
      toolCalls: ResponseParser.extractToolCalls(rawResponse),
      errors: ResponseParser.extractErrors(rawResponse),
      placeholders: ResponseParser.detectPlaceholders(rawResponse),
      metadata: ResponseParser.buildMetadata(rawResponse)
    };
  }

  static extractContent(response) {
    if (!response) return '';
    return response
      .filter(m => m.type === 'content' || m.type === 'text')
      .map(m => m.content || m.data)
      .join('\n');
  }

  static extractToolCalls(response) {
    if (!response) return [];
    return response
      .filter(m => m.type === 'tool_call')
      .map(m => ({
        name: m.name,
        arguments: m.arguments || m.payload || {}
      }));
  }

  static extractErrors(response) {
    if (!response) return [];
    return response
      .filter(m => m.type === 'error')
      .map(m => ({
        message: m.message,
        severity: m.severity || 'unknown',
        code: m.code
      }));
  }

  static detectPlaceholders(response) {
    const pattern = /\{\{PLACEHOLDER_(\w+)\}\}/g;
    const matched = new Set();
    const text = JSON.stringify(response);
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matched.add(match[1]);
    }
    return Array.from(matched);
  }

  static buildMetadata(response) {
    if (!response || response.length === 0) {
      return {
        totalMessages: 0,
        hasContent: false,
        hasErrors: false,
        hasToolCalls: false
      };
    }

    return {
      totalMessages: response.length,
      hasContent: response.some(m => m.type === 'content'),
      hasErrors: response.some(m => m.type === 'error'),
      hasToolCalls: response.some(m => m.type === 'tool_call'),
      types: [...new Set(response.map(m => m.type))],
      firstMessage: response[0]?.timestamp,
      lastMessage: response[response.length - 1]?.timestamp
    };
  }
}

module.exports = ResponseParser;
```

### Step 4: Logger Setup

```javascript
// testing-framework/utils/logger.js

class TestLogger {
  constructor(logLevel = 'info') {
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      SILENT: 4
    };
    this.currentLevel = this.levels[logLevel] || this.levels.INFO;
  }

  _log(level, ...args) {
    if (this.levels[level] >= this.currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level}] ${args.join(' ')}`);
    }
  }

  debug(...args) { this._log('DEBUG', ...args); }
  info(...args) { this._log('INFO', ...args); }
  warn(...args) { this._log('WARN', ...args); }
  error(...args) { this._log('ERROR', ...args); }

  group(name) {
    console.group(`ℹ️  ${name}`);
  }

  groupEnd() {
    console.groupEnd();
  }

  table(data) {
    console.table(data);
  }
}

module.exports = TestLogger;
```

---

## Complete Working Examples

### Example 1: Calendar Feature Test (Production-Ready)

```javascript
// testing-framework/modules/calendar-tests.js

const ResponseParser = require('../utils/response-parser');

class CalendarTests {
  constructor(client, logger) {
    this.client = client;
    this.logger = logger;
    this.artifacts = new Map();
  }

  // Test 1: Complete calendar request
  async testCompleteRequest() {
    this.logger.info('Testing complete calendar request...');

    const input = 'Schedule a meeting with the sales team tomorrow at 2pm for 1 hour';
    const response = await this.client.sendMessage(input);
    const parsed = ResponseParser.parse(response);

    const assertions = [
      {
        name: 'Has conversational response',
        result: parsed.content.length > 50,
        details: `Content length: ${parsed.content.length}`
      },
      {
        name: 'Has tool call',
        result: parsed.toolCalls.length > 0,
        details: `Tool calls: ${parsed.toolCalls.length}`
      },
      {
        name: 'No critical errors',
        result: !parsed.errors.some(e => e.severity === 'critical'),
        details: `Errors: ${parsed.errors.length}`
      },
      {
        name: 'No placeholders needed',
        result: parsed.placeholders.length === 0,
        details: `Placeholders: ${parsed.placeholders.join(', ')}`
      }
    ];

    const passed = assertions.every(a => a.result);

    this.logger.group('Complete Request Test');
    this.logger.info(`Input: "${input}"`);
    this.logger.table(assertions);
    this.logger.groupEnd();

    return {
      passed,
      assertions,
      parsed,
      duration: this.client.metrics.responseTimes[this.client.metrics.responseTimes.length - 1]
    };
  }

  // Test 2: Vague calendar request
  async testVagueRequest() {
    this.logger.info('Testing vague calendar request...');

    const input = 'make a meeting for my team';
    const response = await this.client.sendMessage(input);
    const parsed = ResponseParser.parse(response);

    const assertions = [
      {
        name: 'Has conversational response',
        result: parsed.content.length > 30,
        details: `Content: "${parsed.content.substring(0, 50)}..."`
      },
      {
        name: 'Generated placeholders',
        result: parsed.placeholders.length > 0,
        details: `Placeholders: [${parsed.placeholders.join(', ')}]`
      },
      {
        name: 'No critical errors',
        result: !parsed.errors.some(e => e.severity === 'critical'),
        details: `Error count: ${parsed.errors.length}`
      },
      {
        name: 'Still has tool info',
        result: parsed.toolCalls.length > 0 || parsed.placeholders.length > 0,
        details: `Tool calls: ${parsed.toolCalls.length}, Placeholders: ${parsed.placeholders.length}`
      }
    ];

    const passed = assertions.every(a => a.result);

    this.logger.group('Vague Request Test');
    this.logger.table(assertions);
    this.logger.groupEnd();

    return {
      passed,
      assertions,
      parsed
    };
  }

  // Test 3: Error recovery
  async testErrorRecovery() {
    this.logger.info('Testing error recovery...');

    // Send bad input
    const badInput = '@#$%^&* xyz abc qwerty';
    const response1 = await this.client.sendMessage(badInput);
    const parsed1 = ResponseParser.parse(response1);

    // Try to recover
    const recoveryInput = 'Can you still understand normal requests?';
    const response2 = await this.client.sendMessage(recoveryInput);
    const parsed2 = ResponseParser.parse(response2);

    const assertions = [
      {
        name: 'Handled bad input gracefully',
        result: !parsed1.errors.some(e => e.severity === 'critical'),
        details: `Errors on bad input: ${parsed1.errors.length}`
      },
      {
        name: 'System recovered',
        result: parsed2.content.length > 20,
        details: `Response length: ${parsed2.content.length}`
      },
      {
        name: 'No cascading failures',
        result: parsed2.errors.length < 2,
        details: `Errors after recovery: ${parsed2.errors.length}`
      }
    ];

    const passed = assertions.every(a => a.result);

    this.logger.group('Error Recovery Test');
    this.logger.table(assertions);
    this.logger.groupEnd();

    return {
      passed,
      assertions,
      steps: [
        { step: 'Send bad input', result: parsed1 },
        { step: 'Recovery attempt', result: parsed2 }
      ]
    };
  }

  // Test 4: Parameter extraction accuracy
  async testParameterExtraction() {
    this.logger.info('Testing parameter extraction...');

    const input = 'Schedule "Product Review" with john@company.com and sarah@company.com on Friday at 10:30am for 90 minutes';
    const response = await this.client.sendMessage(input);
    const parsed = ResponseParser.parse(response);

    const toolCall = parsed.toolCalls[0];
    const assertions = [
      {
        name: 'Title extracted',
        result: toolCall?.title && toolCall.title.includes('Product Review'),
        details: `Title: "${toolCall?.title || 'N/A'}"`
      },
      {
        name: 'Attendees extracted',
        result: toolCall?.attendees?.length >= 2,
        details: `Attendees: ${toolCall?.attendees?.join(', ') || 'N/A'}`
      },
      {
        name: 'Time extracted',
        result: toolCall?.startTime && toolCall.startTime.includes('10:30'),
        details: `Time: "${toolCall?.startTime || 'N/A'}"`
      },
      {
        name: 'Duration extracted',
        result: toolCall?.duration && toolCall.duration.includes('90'),
        details: `Duration: "${toolCall?.duration || 'N/A'}"`
      }
    ];

    const passed = assertions.every(a => a.result);

    this.logger.group('Parameter Extraction Test');
    this.logger.info(`Input: "${input}"`);
    this.logger.table(assertions);
    this.logger.groupEnd();

    return {
      passed,
      assertions,
      extractedParameters: toolCall
    };
  }

  // Run all calendar tests
  async runAllTests() {
    this.logger.info('🚀 Running all calendar tests...\n');

    const results = {
      complete: await this.testCompleteRequest(),
      vague: await this.testVagueRequest(),
      errorRecovery: await this.testErrorRecovery(),
      parameterExtraction: await this.testParameterExtraction()
    };

    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(r => r.passed).length;

    this.logger.info(`\n📊 Summary: ${passedTests}/${totalTests} tests passed`);

    return results;
  }
}

module.exports = CalendarTests;
```

### Example 2: Full Test Runner Script

```javascript
// testing-framework/scripts/run-automated.js

const EnhancedAgenticClient = require('../core/agentic-client');
const TestRunner = require('../core/test-runner');
const TestLogger = require('../utils/logger');
const CalendarTests = require('../modules/calendar-tests');
const config = require('../config/default.config.js');

async function main() {
  const logger = new TestLogger(config.client.logLevel);

  logger.info('🤖 Starting Automated Integration Test Suite');
  logger.info(`Config: ${JSON.stringify(config, null, 2)}\n`);

  const client = new EnhancedAgenticClient(config.client);

  try {
    // Connect
    logger.info('Connecting to application...');
    await client.connect();
    logger.info('✅ Connected\n');

    // Authenticate
    logger.info('Authenticating...');
    await client.authenticate();
    logger.info('✅ Authenticated\n');

    // Create runner
    const runner = new TestRunner();

    // Register test suites
    const calendarTests = new CalendarTests(client, logger);
    runner.registerSuite('calendar', calendarTests);

    // Run all suites
    const report = await runner.runAllSuites(config.testing.concurrency);

    // Display summary
    logger.info('\n' + '='.repeat(60));
    logger.info('📈 TEST SUMMARY');
    logger.info('='.repeat(60));
    logger.table(report.summary);

    logger.info('\n📋 SUITE RESULTS');
    Object.entries(report.suites).forEach(([suiteName, suite]) => {
      const passRate = ((suite.passed / (suite.passed + suite.failed)) * 100).toFixed(2);
      logger.info(`${suiteName}: ${suite.passed} passed, ${suite.failed} failed (${passRate}%)`);
    });

    // Save report
    const fs = require('fs');
    const outputPath = `${config.reporting.outputPath}/report-${Date.now()}.json`;
    fs.mkdirSync(config.reporting.outputPath, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    logger.info(`\n💾 Report saved to: ${outputPath}`);

    // Exit with appropriate code
    const hasFailures = report.summary.failed > 0;
    process.exit(hasFailures ? 1 : 0);

  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

main();
```

---

## Testing Your Features

### Template: Test Your Own Feature

```javascript
// testing-framework/modules/my-feature-tests.js

const ResponseParser = require('../utils/response-parser');

class MyFeatureTests {
  constructor(client, logger) {
    this.client = client;
    this.logger = logger;
  }

  // TODO: Implement your tests following this pattern:
  async testYourFeature() {
    const testInput = 'Your test input here';
    const response = await this.client.sendMessage(testInput);
    const parsed = ResponseParser.parse(response);

    // Validate
    const assertions = [
      {
        name: 'Your assertion 1',
        result: parsed.content.length > 0,
        details: 'Details about what you checked'
      },
      {
        name: 'Your assertion 2',
        result: true, // Your validation logic
        details: 'More details'
      }
    ];

    return {
      passed: assertions.every(a => a.result),
      assertions,
      parsed
    };
  }

  async runAllTests() {
    return {
      feature1: await this.testYourFeature(),
      // Add more tests...
    };
  }
}

module.exports = MyFeatureTests;
```

### Register and Run Your Feature

```javascript
// In your test script

const MyFeatureTests = require('./modules/my-feature-tests');

// Add to runner
const myTests = new MyFeatureTests(client, logger);
runner.registerSuite('my_feature', myTests);

// Run it
const results = await runner.runSuite('my_feature');
```

---

## Advanced Patterns

### Pattern 1: Parameterized Tests

```javascript
async testWithParameters() {
  const testCases = [
    { input: 'case 1', expectedPass: true },
    { input: 'case 2', expectedPass: false },
    { input: 'case 3', expectedPass: true }
  ];

  const results = [];

  for (const testCase of testCases) {
    const response = await this.client.sendMessage(testCase.input);
    const parsed = ResponseParser.parse(response);
    const passed = this.validate(parsed) === testCase.expectedPass;

    results.push({
      input: testCase.input,
      passed,
      parsed
    });
  }

  return {
    passed: results.every(r => r.passed),
    cases: results
  };
}
```

### Pattern 2: Chain Multiple Requests

```javascript
async testMultiStepProcess() {
  this.logger.info('Testing multi-step process...');

  // Step 1
  const step1Response = await this.client.sendMessage('Create event');
  const step1Parsed = ResponseParser.parse(step1Response);
  const eventId = this.extractId(step1Parsed);

  this.logger.info(`Step 1 created: ${eventId}`);

  // Step 2
  const step2Response = await this.client.sendMessage(`Update event ${eventId}`);
  const step2Parsed = ResponseParser.parse(step2Response);

  // Step 3
  const step3Response = await this.client.sendMessage(`Delete event ${eventId}`);
  const step3Parsed = ResponseParser.parse(step3Response);

  return {
    passed: step1Parsed.content && step2Parsed.content && step3Parsed.content,
    steps: [step1Parsed, step2Parsed, step3Parsed]
  };
}

extractId(parsed) {
  // Extract ID from response
  return parsed.raw[0]?.eventId || 'unknown';
}
```

### Pattern 3: Performance Testing

```javascript
async testPerformance() {
  const measurements = [];
  const iterations = 10;

  this.logger.info(`Running performance test (${iterations} iterations)...`);

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    await this.client.sendMessage('Test message');
    const duration = Date.now() - startTime;
    measurements.push(duration);
  }

  const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
  const max = Math.max(...measurements);
  const min = Math.min(...measurements);

  return {
    passed: avg < 5000, // 5 second threshold
    metrics: { avg, max, min, measurements }
  };
}
```

---

## Debugging & Tips

### Tip 1: Enable Debug Logging

```javascript
const client = new EnhancedAgenticClient({
  logLevel: 'debug',
  captureRawData: true
});

// After test
const rawData = client.getRawDataCapture();
console.log(JSON.stringify(rawData, null, 2));
```

### Tip 2: Inspect Response Structure

```javascript
const response = await client.sendMessage('test');
console.log(JSON.stringify(response, null, 2));
// Shows complete message structure for debugging
```

### Tip 3: Check Metrics Real-Time

```javascript
const metrics = client.getMetrics();
console.log(`Avg response time: ${metrics.avgResponseTime}`);
console.log(`Error rate: ${metrics.errorRate}`);
console.log(`Messages received: ${metrics.messagesReceived}`);
```

### Tip 4: Test Isolation

```javascript
// Each test should be independent
async function eachTest() {
  const client = new EnhancedAgenticClient();
  await client.connect();
  // Run test
  await client.disconnect();
}
```

### Tip 5: Common Issues & Fixes

```javascript
// Issue: Tests timing out
// Fix: Increase timeout
client.config.messageTimeout = 60000;

// Issue: State pollution between tests  
// Fix: Create fresh client per test
const freshClient = new EnhancedAgenticClient();

// Issue: Response parsing errors
// Fix: Use ResponseParser for robust parsing
const parsed = ResponseParser.parse(response);

// Issue: Flaky tests
// Fix: Add retry logic or lenient assertions
const passed = parsed.content.length > 0; // Instead of exact match
```

---

## Summary

You now have:

✅ **Complete testing framework** ready to deploy  
✅ **Production-ready calendar tests** for reference  
✅ **Reusable patterns** for your own features  
✅ **Step-by-step guides** for getting started  
✅ **Debugging tips** for common issues  

**Next Steps:**
1. Copy the framework to your project
2. Create your first test module
3. Run the test suite
4. Integrate with CI/CD

Happy testing! 🚀
