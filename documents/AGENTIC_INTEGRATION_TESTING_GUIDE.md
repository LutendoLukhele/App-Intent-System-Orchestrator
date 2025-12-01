# 🤖 Agentic AI Integration Testing Guide

## Table of Contents
1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Testing Architectures](#testing-architectures)
4. [Semi-Automated Testing](#semi-automated-testing)
5. [Fully Automated Testing](#fully-automated-testing)
6. [Framework Templates](#framework-templates)
7. [Best Practices](#best-practices)
8. [Real-World Examples](#real-world-examples)

---

## Overview

This guide provides a complete methodology for integration testing agentic applications using AI-driven test clients. Unlike traditional testing, agentic integration testing uses intelligent clients that understand application semantics, generate test cases dynamically, and validate responses intelligently.

### Why Agentic Integration Testing?

**Traditional Integration Testing:**
```
Manual Test Script → Expected Output → Pass/Fail
```
- Limited to predefined scenarios
- Cannot handle dynamic responses
- Requires extensive test maintenance
- Limited to "happy paths"

**Agentic Integration Testing:**
```
Natural Language Intent → AI Generates Test Cases → Intelligent Validation → Rich Metrics
```
- Unlimited test scenarios
- Handles dynamic/natural responses
- Adaptive to application changes
- Validates semantics, not just output format

### Key Benefits

| Aspect | Traditional | Agentic |
|--------|-----------|---------|
| Test Generation | Manual | Automated |
| Response Validation | String matching | Semantic understanding |
| Edge Cases | Predefined | AI-discovered |
| Maintenance | High | Low |
| Coverage | Limited | Comprehensive |
| Feedback Quality | Binary (pass/fail) | Rich diagnostic info |

---

## Core Concepts

### 1. Test Intent vs Test Implementation

```javascript
// Traditional: Implementation-focused
describe('Calendar API', () => {
  it('should create event with title', async () => {
    const response = await api.createEvent({ title: 'Meeting' });
    assert(response.status === 201);
    assert(response.body.title === 'Meeting');
  });
});

// Agentic: Intent-focused
const testIntents = [
  'Create a calendar event for tomorrow at 2pm',
  'Schedule a meeting with vague details',
  'Update an existing calendar entry',
  'Handle missing parameters gracefully'
];

// AI generates implementations for each intent
```

### 2. Semantic vs Syntactic Validation

```javascript
// Syntactic: Exact match
response.body.title === 'Team Meeting'  // ✓ or ✗

// Semantic: Meaning-aware
llm.validate(`
  Does the response indicate a calendar event was created?
  Response: ${response}
`) // Understands context, variation, placeholders
```

### 3. Test State Management

```
┌─────────────────────────────────────────────┐
│          Session State (WebSocket)          │
├─────────────────────────────────────────────┤
│ userId         │ session-uuid                │
│ sessionId      │ generated from server       │
│ messages[]     │ conversation history        │
│ resources[]    │ created during tests        │
│ artifacts{}    │ maps names to IDs           │
└─────────────────────────────────────────────┘
```

### 4. Agentic Client Architecture

```
User Intent
    ↓
┌─────────────────────────────────────┐
│   Agentic Test Client               │
├─────────────────────────────────────┤
│ • Natural language processor        │
│ • WebSocket connection manager      │
│ • State tracker                     │
│ • Response validator                │
│ • Metric collector                  │
└─────────────────────────────────────┘
    ↓
Application
    ↓
Response
    ↓
┌─────────────────────────────────────┐
│   Intelligent Validator             │
├─────────────────────────────────────┤
│ • Parse tool arguments              │
│ • Detect placeholders               │
│ • Validate semantics                │
│ • Extract metrics                   │
│ • Generate report                   │
└─────────────────────────────────────┘
    ↓
Test Results (Rich + Diagnostic)
```

---

## Testing Architectures

### Architecture A: Semi-Automated (Human-in-Loop)

**Best for:** Exploratory testing, new features, complex validation

```
Human Tester (Intent) → AI Client (Execution) → Human Review (Validation)
     ↓
   "Create a calendar event
    with incomplete data"
     ↓
AI Client:
  • Connects to app
  • Sends vague message
  • Receives response
  • Collects diagnostics
     ↓
Human Reviews:
  ✓ Did system handle gracefully?
  ✓ Were placeholders generated?
  ✓ Was conversational response helpful?
  ✓ Was action blocked appropriately?
```

**Workflow:**
```
1. Tester provides intent (natural language)
2. AI client auto-generates test steps
3. AI executes against application
4. Rich output collected (responses, logs, metrics)
5. Tester reviews results
6. Tester validates outcomes
7. Issues documented automatically
```

### Architecture B: Fully Automated

**Best for:** Regression testing, CI/CD, performance monitoring

```
Test Suite (Predefined Intents) → AI Client (Parallel Execution) → Validator (Semantic) → Report
     ↓
20 test intents
(stored in DB/config)
     ↓
Parallel AI Clients:
  • Client 1: Complete params
  • Client 2: Vague params
  • Client 3: Edge cases
  • ... (20 total)
     ↓
Each collects:
  ✓ Response semantics
  ✓ Metrics
  ✓ Errors
  ✓ Artifacts
     ↓
Aggregated Validation:
  • Success rate: 95%+
  • Avg response time: 2.3s
  • Error recovery: 100%
  • Placeholder accuracy: 98%
     ↓
Report (Pass/Fail + Metrics)
```

**Characteristics:**
- Deterministic test suites
- Parallel execution
- Metric tracking
- Automated reporting
- CI/CD integration
- Performance baseline tracking

### Architecture C: Hybrid (Recommended)

**Best for:** Production systems, comprehensive testing

```
Continuous Integration
         ↓
┌─────────────────────────────────────┐
│ Fully Automated (Regression)        │
│ • 50+ core test cases               │
│ • 10 minute run                     │
│ • Blocks on failure                 │
└─────────────────────────────────────┘
         ↓
  ✓ Pass → Deploy to staging
  ✗ Fail → Block + Alert
         ↓
  (Manual trigger or on schedule)
         ↓
┌─────────────────────────────────────┐
│ Semi-Automated (Exploratory)        │
│ • Ad-hoc test generation            │
│ • Edge case discovery               │
│ • Performance profiling             │
│ • Once per day                      │
└─────────────────────────────────────┘
         ↓
  Issues found → Create tasks
  Performance delta → Alert team
         ↓
  Results to dashboard
```

---

## Semi-Automated Testing

### Phase 1: Setup

```javascript
// test-setup.js - Shared initialization

const TestEnvironment = {
  // Configuration
  config: {
    baseUrl: 'ws://localhost:8080',
    timeout: 30000,
    logLevel: 'debug',
    validateResponses: true,
    captureMetrics: true
  },

  // Test resources
  session: null,
  messageHistory: [],
  artifacts: new Map(), // name -> id mappings
  metrics: {
    requestCount: 0,
    errorCount: 0,
    responseTime: [],
    placeholderDetected: 0
  }
};

// Initialize environment
async function initEnvironment() {
  TestEnvironment.session = await connectWebSocket();
  TestEnvironment.session.on('message', (data) => {
    handleMessage(data);
  });
  console.log('✅ Test environment ready');
}

// Cleanup
async function cleanupEnvironment() {
  if (TestEnvironment.session) {
    TestEnvironment.session.close();
  }
  console.log('✅ Test environment cleaned up');
}

module.exports = { TestEnvironment, initEnvironment, cleanupEnvironment };
```

### Phase 2: Test Intent Definition

```javascript
// test-intents.js - Define what to test (not how)

const TestIntents = {
  // Calendar Tests
  calendar: {
    completeRequest: {
      intent: 'Create a calendar event with all required details',
      input: 'Schedule a meeting with the sales team tomorrow at 2pm for 1 hour',
      expectedBehavior: [
        'Should identify create_calendar_event tool',
        'Should extract all parameters from request',
        'Should provide conversational confirmation'
      ],
      validationCriteria: [
        'No JSON parsing errors',
        'Tool identified correctly',
        'Parameters extracted accurately'
      ]
    },

    vagueRequest: {
      intent: 'Handle request with missing parameters',
      input: 'please create a meeting for my team',
      expectedBehavior: [
        'Should generate placeholder plan',
        'Should ask for clarification conversationally',
        'Should not crash on vague input'
      ],
      validationCriteria: [
        'Contains {{PLACEHOLDER_*}} format',
        'Conversational response provided',
        'No errors in logs'
      ]
    },

    edgeCase: {
      intent: 'Handle malformed or unusual input',
      input: 'mkemtin w tim mor',
      expectedBehavior: [
        'Should handle gracefully',
        'Should offer template or clarification',
        'Should recover to working state'
      ],
      validationCriteria: [
        'No system errors',
        'Helpful response provided',
        'No unhandled exceptions'
      ]
    }
  },

  // Add more feature areas as needed
  authentication: { /* ... */ },
  streaming: { /* ... */ },
  errorHandling: { /* ... */ }
};

module.exports = TestIntents;
```

### Phase 3: Execution Framework

```javascript
// test-executor.js - Execute with human review points

class SemiAutomatedTestExecutor {
  constructor(testEnvironment) {
    this.env = testEnvironment;
    this.currentTest = null;
  }

  // Main execution loop
  async runTest(testIntent, testName) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Running: ${testName}`);
    console.log(`Intent: ${testIntent.intent}`);
    console.log(`${'='.repeat(60)}\n`);

    this.currentTest = {
      name: testName,
      intent: testIntent,
      startTime: Date.now(),
      output: {},
      issues: []
    };

    try {
      // 1. Setup
      this.logStep('SETUP', 'Preparing test environment');
      await this.setupTest(testIntent);

      // 2. Execute
      this.logStep('EXECUTE', `Sending: "${testIntent.input}"`);
      const response = await this.executeTest(testIntent.input);

      // 3. Capture Output
      this.logStep('CAPTURE', 'Collecting response data');
      await this.captureOutput(response);

      // 4. Immediate Validation
      this.logStep('VALIDATE', 'Validating response semantics');
      const validation = await this.validateResponse(testIntent);

      // 5. Present to Human
      this.logStep('REVIEW', '⏸️  AWAITING HUMAN REVIEW');
      await this.presentForReview(validation);

      // 6. Generate Report
      this.logStep('REPORT', 'Generating test report');
      return this.generateReport();

    } catch (error) {
      this.currentTest.issues.push({
        type: 'EXECUTION_ERROR',
        message: error.message,
        stack: error.stack
      });
      console.error('❌ Test execution failed:', error);
    }
  }

  logStep(phase, message) {
    console.log(`[${phase}] ${message}`);
  }

  async setupTest(testIntent) {
    // Reset test-specific state
    this.messageBuffer = [];
  }

  async executeTest(input) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test execution timeout'));
      }, this.env.config.timeout);

      this.env.session.send(JSON.stringify({
        type: 'content',
        content: input
      }));

      // Collect responses
      const responses = [];
      const handler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          responses.push(message);

          // Stop when we get final response
          if (message.type === 'response_complete') {
            clearTimeout(timeout);
            this.env.metrics.responseTime.push(Date.now() - startTime);
            resolve(responses);
          }
        } catch (e) {
          reject(e);
        }
      };

      this.env.session.once('message', handler);
    });
  }

  async captureOutput(response) {
    this.currentTest.output = {
      fullResponse: response,
      conversationalText: this.extractConversationalText(response),
      toolArguments: this.extractToolArguments(response),
      placeholders: this.detectPlaceholders(response),
      errors: this.extractErrors(response),
      metadata: {
        messageCount: response.length,
        duration: Date.now() - this.currentTest.startTime
      }
    };

    console.log('\n📊 Captured Output:');
    console.log(`  - Messages: ${this.currentTest.output.metadata.messageCount}`);
    console.log(`  - Duration: ${this.currentTest.output.metadata.duration}ms`);
    console.log(`  - Placeholders detected: ${this.currentTest.output.placeholders.length}`);
    console.log(`  - Errors: ${this.currentTest.output.errors.length}`);
  }

  extractConversationalText(response) {
    return response
      .filter(msg => msg.type === 'content')
      .map(msg => msg.content)
      .join('\n');
  }

  extractToolArguments(response) {
    return response
      .filter(msg => msg.type === 'tool_call')
      .map(msg => msg.arguments);
  }

  detectPlaceholders(response) {
    const placeholderPattern = /\{\{PLACEHOLDER_(\w+)\}\}/g;
    const allText = JSON.stringify(response);
    const matches = [...allText.matchAll(placeholderPattern)];
    return matches.map(m => m[1]);
  }

  extractErrors(response) {
    return response
      .filter(msg => msg.type === 'error')
      .map(msg => msg.message);
  }

  async validateResponse(testIntent) {
    const validation = {
      passed: [],
      failed: [],
      warnings: []
    };

    // Validate each criteria
    for (const criterion of testIntent.validationCriteria) {
      const result = await this.validateCriterion(criterion);
      if (result.passed) {
        validation.passed.push(criterion);
      } else {
        validation.failed.push(criterion);
      }
    }

    return validation;
  }

  async validateCriterion(criterion) {
    // Examples of what to check
    const checks = {
      'No JSON parsing errors': () => !this.currentTest.output.errors.some(
        e => e.includes('Failed to parse')
      ),
      'Tool identified correctly': () => this.currentTest.output.toolArguments.length > 0,
      'Parameters extracted accurately': () => this.checkParameterExtraction(),
      'Contains {{PLACEHOLDER_*}} format': () => this.currentTest.output.placeholders.length > 0,
      'Conversational response provided': () => this.currentTest.output.conversationalText.length > 100,
      'No errors in logs': () => this.currentTest.output.errors.length === 0,
      'Helpful response provided': () => this.currentTest.output.conversationalText.length > 50,
      'No system errors': () => !this.currentTest.output.errors.some(
        e => e.includes('System error') || e.includes('500')
      )
    };

    const checkFn = checks[criterion];
    if (!checkFn) {
      return { passed: null, message: `Unknown criterion: ${criterion}` };
    }

    try {
      const passed = checkFn();
      return { passed, message: criterion };
    } catch (e) {
      return { passed: false, message: `${criterion} - Error: ${e.message}` };
    }
  }

  checkParameterExtraction() {
    // Add specific logic for your application
    return this.currentTest.output.toolArguments.length > 0 &&
      this.currentTest.output.toolArguments[0].title !== undefined;
  }

  async presentForReview(validation) {
    console.log('\n' + '='.repeat(60));
    console.log('👁️  VALIDATION RESULTS - REVIEW REQUIRED');
    console.log('='.repeat(60));

    console.log('\n✅ PASSED:');
    validation.passed.forEach(p => console.log(`  ✓ ${p}`));

    if (validation.failed.length > 0) {
      console.log('\n❌ FAILED:');
      validation.failed.forEach(f => console.log(`  ✗ ${f}`));
    }

    console.log('\n📋 OUTPUT SUMMARY:');
    console.log(`  Conversational: ${this.currentTest.output.conversationalText.substring(0, 80)}...`);
    console.log(`  Tool Args: ${JSON.stringify(this.currentTest.output.toolArguments[0] || {})}`);
    console.log(`  Placeholders: [${this.currentTest.output.placeholders.join(', ')}]`);

    console.log('\n⏸️  AWAITING YOUR VALIDATION:');
    console.log('  Does the output match expected behavior?');
    console.log('  Are there any unexpected issues?');
    console.log('  Should this be marked as passed/failed?');

    // In real implementation, wait for user input
    // For now, auto-pass if criteria met
    this.currentTest.humanReviewPassed = validation.failed.length === 0;
  }

  generateReport() {
    return {
      name: this.currentTest.name,
      intent: this.currentTest.intent.intent,
      status: this.currentTest.humanReviewPassed ? 'PASSED' : 'REVIEW_NEEDED',
      duration: Date.now() - this.currentTest.startTime,
      output: this.currentTest.output,
      issues: this.currentTest.issues
    };
  }
}

module.exports = SemiAutomatedTestExecutor;
```

### Phase 4: Semi-Automated Test Runner

```bash
# run-semi-automated-tests.sh

#!/bin/bash

echo "🤖 Starting Semi-Automated Integration Tests"
echo "=============================================="

# Start server
npm run dev > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 3

# Run tests with human review
node -e "
const SemiAutomatedTestExecutor = require('./test-executor');
const TestIntents = require('./test-intents');
const { TestEnvironment, initEnvironment, cleanupEnvironment } = require('./test-setup');

(async () => {
  await initEnvironment();
  const executor = new SemiAutomatedTestExecutor(TestEnvironment);

  const results = [];
  for (const [feature, tests] of Object.entries(TestIntents)) {
    for (const [testType, intent] of Object.entries(tests)) {
      const testName = \`\${feature}/\${testType}\`;
      const result = await executor.runTest(intent, testName);
      results.push(result);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SEMI-AUTOMATED TEST SUMMARY');
  console.log('='.repeat(60));
  const passed = results.filter(r => r.status === 'PASSED').length;
  console.log(\`Total: \${results.length}\`);
  console.log(\`Passed: \${passed}\`);
  console.log(\`Review Needed: \${results.length - passed}\`);

  await cleanupEnvironment();
  process.exit(results.length - passed > 0 ? 1 : 0);
})();
"

# Cleanup
kill $SERVER_PID
echo "✅ Semi-automated tests complete"
```

---

## Fully Automated Testing

### Architecture

```javascript
// test-suite-automated.js - Deterministic, parallel, CI/CD ready

class FullyAutomatedTestSuite {
  constructor(config) {
    this.config = config;
    this.results = [];
    this.metrics = {
      startTime: Date.now(),
      testCount: 0,
      passCount: 0,
      failCount: 0,
      avgResponseTime: 0,
      placeholderAccuracy: 0
    };
  }

  async runParallel(testCases, concurrency = 5) {
    console.log(`🚀 Running ${testCases.length} tests with concurrency ${concurrency}`);

    // Chunk tests for parallel execution
    const chunks = [];
    for (let i = 0; i < testCases.length; i += concurrency) {
      chunks.push(testCases.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(testCase => this.executeTestCase(testCase))
      );
      this.results.push(...chunkResults);
    }

    return this.generateReport();
  }

  async executeTestCase(testCase) {
    const startTime = Date.now();

    try {
      // 1. Create isolated session
      const session = await this.createSession();

      // 2. Execute test
      const response = await this.sendMessage(session, testCase.input);

      // 3. Validate deterministically
      const validation = this.validateDeterministic(response, testCase);

      // 4. Extract metrics
      const metrics = this.extractMetrics(response, validation);

      // 5. Cleanup
      await this.closeSession(session);

      return {
        id: testCase.id,
        name: testCase.name,
        status: validation.passed ? 'PASS' : 'FAIL',
        duration: Date.now() - startTime,
        validation,
        metrics,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        id: testCase.id,
        name: testCase.name,
        status: 'ERROR',
        duration: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  validateDeterministic(response, testCase) {
    // Deterministic validation (no AI, pure logic)
    const validation = {
      passed: true,
      checks: []
    };

    // Check 1: Response structure
    if (!response || response.length === 0) {
      validation.passed = false;
      validation.checks.push('Response is empty');
    }

    // Check 2: No critical errors
    const errors = response.filter(msg => msg.type === 'error');
    if (errors.length > 0 && errors.some(e => e.severity === 'critical')) {
      validation.passed = false;
      validation.checks.push(`Critical errors: ${errors.map(e => e.message).join(', ')}`);
    }

    // Check 3: Expected content present
    const hasContent = response.some(msg => msg.type === 'content');
    if (!hasContent) {
      validation.passed = false;
      validation.checks.push('No conversational response');
    }

    // Check 4: Test-specific validation
    if (testCase.expectedValidations) {
      for (const validator of testCase.expectedValidations) {
        const result = validator(response);
        validation.checks.push(result);
        if (!result) validation.passed = false;
      }
    }

    return validation;
  }

  extractMetrics(response, validation) {
    const toolCalls = response.filter(m => m.type === 'tool_call');
    const errors = response.filter(m => m.type === 'error');
    const placeholderPattern = /\{\{PLACEHOLDER_(\w+)\}\}/g;
    const allText = JSON.stringify(response);
    const placeholders = [...allText.matchAll(placeholderPattern)].map(m => m[1]);

    return {
      toolCallCount: toolCalls.length,
      errorCount: errors.length,
      placeholderCount: placeholders.length,
      messageCount: response.length,
      hasToolCalls: toolCalls.length > 0,
      hasPlaceholders: placeholders.length > 0,
      placeholders: placeholders
    };
  }

  async createSession() {
    // Create isolated WebSocket session
    return new Promise((resolve, reject) => {
      // Implementation
    });
  }

  async sendMessage(session, content) {
    // Send and collect response
    return new Promise((resolve, reject) => {
      // Implementation
    });
  }

  async closeSession(session) {
    // Clean disconnect
  }

  generateReport() {
    this.metrics.testCount = this.results.length;
    this.metrics.passCount = this.results.filter(r => r.status === 'PASS').length;
    this.metrics.failCount = this.results.filter(r => r.status === 'FAIL').length;
    this.metrics.avgResponseTime = 
      this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;

    return {
      summary: {
        totalTests: this.metrics.testCount,
        passed: this.metrics.passCount,
        failed: this.metrics.failCount,
        errors: this.results.filter(r => r.status === 'ERROR').length,
        successRate: ((this.metrics.passCount / this.metrics.testCount) * 100).toFixed(2) + '%',
        avgResponseTime: this.metrics.avgResponseTime.toFixed(2) + 'ms',
        totalDuration: Date.now() - this.metrics.startTime + 'ms'
      },
      results: this.results,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = FullyAutomatedTestSuite;
```

### CI/CD Integration

```yaml
# .github/workflows/integration-tests.yml

name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  automated-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Start application
        run: npm run dev &
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          LOG_LEVEL: debug

      - name: Run automated integration tests
        run: npm run test:integration:automated
        timeout-minutes: 10

      - name: Generate test report
        if: always()
        run: npm run test:report

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('test-results/report.json'));
            const comment = `## 🤖 Integration Test Results
            
            - ✅ Passed: ${report.summary.passed}
            - ❌ Failed: ${report.summary.failed}
            - ⏱️ Avg Response: ${report.summary.avgResponseTime}
            - ✨ Success Rate: ${report.summary.successRate}
            `;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

      - name: Fail if tests failed
        if: failure()
        run: exit 1
```

---

## Framework Templates

### Template 1: Basic Agentic Client

```javascript
// agentic-test-client.js - Reusable base class

class AgenticTestClient {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'ws://localhost:8080',
      timeout: config.timeout || 30000,
      autoAuth: config.autoAuth !== false,
      captureMetrics: config.captureMetrics !== false,
      validateResponses: config.validateResponses !== false,
      ...config
    };

    this.session = null;
    this.messageBuffer = [];
    this.state = {
      authenticated: false,
      sessionId: null,
      userId: null,
      artifacts: new Map()
    };
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      responseTimes: [],
      messagesReceived: 0
    };
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.baseUrl);

      ws.on('open', () => {
        this.session = ws;
        console.log('✅ Connected to application');
        resolve();
      });

      ws.on('message', (data) => {
        this.handleMessage(data);
      });

      ws.on('error', (error) => {
        reject(error);
      });

      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.timeout);
    });
  }

  async authenticate() {
    if (!this.config.autoAuth) return;

    return new Promise((resolve) => {
      this.session.send(JSON.stringify({ type: 'init' }));

      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'authenticated') {
            this.state.authenticated = true;
            this.state.sessionId = msg.sessionId;
            this.state.userId = msg.userId;
            this.session.removeListener('message', handler);
            console.log('✅ Authenticated');
            resolve();
          }
        } catch (e) {
          // Continue waiting
        }
      };

      this.session.on('message', handler);
    });
  }

  async sendMessage(content) {
    this.metrics.requestCount++;
    const startTime = Date.now();

    return new Promise((resolve) => {
      this.messageBuffer = [];

      this.session.send(JSON.stringify({
        type: 'content',
        content
      }));

      const timeout = setTimeout(() => {
        this.metrics.responseTimes.push(Date.now() - startTime);
        resolve(this.messageBuffer);
      }, this.config.timeout);

      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.messageBuffer.push(msg);

          if (msg.type === 'response_complete') {
            clearTimeout(timeout);
            this.metrics.responseTimes.push(Date.now() - startTime);
            this.session.removeListener('message', handler);
            resolve(this.messageBuffer);
          }
        } catch (e) {
          // Continue collecting
        }
      };

      this.session.on('message', handler);
    });
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      this.metrics.messagesReceived++;

      if (msg.type === 'error') {
        this.metrics.errorCount++;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  parseResponse(response) {
    return {
      content: response.filter(m => m.type === 'content').map(m => m.content).join('\n'),
      toolCalls: response.filter(m => m.type === 'tool_call'),
      errors: response.filter(m => m.type === 'error'),
      placeholders: this.detectPlaceholders(response),
      raw: response
    };
  }

  detectPlaceholders(response) {
    const pattern = /\{\{PLACEHOLDER_(\w+)\}\}/g;
    const matches = [];
    response.forEach(msg => {
      const text = JSON.stringify(msg);
      let match;
      while ((match = pattern.exec(text)) !== null) {
        matches.push(match[1]);
      }
    });
    return [...new Set(matches)];
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgResponseTime: (
        this.metrics.responseTimes.reduce((a, b) => a + b, 0) /
        this.metrics.responseTimes.length
      ).toFixed(2) + 'ms',
      errorRate: ((this.metrics.errorCount / this.metrics.requestCount) * 100).toFixed(2) + '%'
    };
  }

  async disconnect() {
    return new Promise((resolve) => {
      if (this.session) {
        this.session.close();
      }
      resolve();
    });
  }
}

module.exports = AgenticTestClient;
```

### Template 2: Feature-Specific Test Module

```javascript
// calendar-tests.js - Feature-specific test module

class CalendarTestModule {
  constructor(agenticClient) {
    this.client = agenticClient;
    this.artifacts = new Map(); // Store created calendar IDs
  }

  // Test case: Complete request
  async testCompleteCalendarRequest() {
    const response = await this.client.sendMessage(
      'Schedule a meeting with the sales team tomorrow at 2pm for 1 hour'
    );

    const parsed = this.client.parseResponse(response);

    return {
      passed: this.validateComplete(parsed),
      parsed,
      assertions: [
        { name: 'Tool identified', passed: parsed.toolCalls.length > 0 },
        { name: 'Parameters extracted', passed: parsed.toolCalls[0]?.title !== undefined },
        { name: 'No errors', passed: parsed.errors.length === 0 },
        { name: 'No placeholders', passed: parsed.placeholders.length === 0 }
      ]
    };
  }

  // Test case: Vague request
  async testVagueCalendarRequest() {
    const response = await this.client.sendMessage(
      'create a meeting please'
    );

    const parsed = this.client.parseResponse(response);

    return {
      passed: this.validateVague(parsed),
      parsed,
      assertions: [
        { name: 'Placeholders generated', passed: parsed.placeholders.length > 0 },
        { name: 'Conversational response', passed: parsed.content.length > 50 },
        { name: 'No critical errors', passed: !parsed.errors.some(e => e.severity === 'critical') }
      ]
    };
  }

  // Test case: Error recovery
  async testErrorRecovery() {
    const response = await this.client.sendMessage(
      'xyz abc qwerty meeting'
    );

    const parsed = this.client.parseResponse(response);

    return {
      passed: this.validateErrorRecovery(parsed),
      parsed,
      assertions: [
        { name: 'No system crash', passed: true }, // If we got here, no crash
        { name: 'Helpful response', passed: parsed.content.length > 30 },
        { name: 'Recoverable state', passed: parsed.errors.length <= 1 }
      ]
    };
  }

  validateComplete(parsed) {
    return parsed.toolCalls.length > 0 &&
           parsed.errors.length === 0 &&
           parsed.placeholders.length === 0;
  }

  validateVague(parsed) {
    return parsed.placeholders.length > 0 &&
           parsed.content.length > 50 &&
           !parsed.errors.some(e => e.severity === 'critical');
  }

  validateErrorRecovery(parsed) {
    return parsed.content.length > 30 &&
           parsed.errors.length <= 1;
  }

  async runAllTests() {
    return {
      complete: await this.testCompleteCalendarRequest(),
      vague: await this.testVagueCalendarRequest(),
      errorRecovery: await this.testErrorRecovery()
    };
  }
}

module.exports = CalendarTestModule;
```

---

## Best Practices

### 1. State Management

✅ **DO:**
```javascript
// Create fresh session per test
async function runTest() {
  const client = new AgenticTestClient();
  await client.connect();
  await client.authenticate();
  
  // Test runs
  const response = await client.sendMessage('...');
  
  await client.disconnect(); // Clean cleanup
}
```

❌ **DON'T:**
```javascript
// Reuse same connection across tests
let client;
function setup() {
  client = new AgenticTestClient();
  client.connect();
}

function test1() { /* uses client */ }
function test2() { /* uses same client */ } // State pollution!
```

### 2. Response Validation

✅ **DO:**
```javascript
// Semantic validation
const validation = {
  hasConversationalResponse: response.some(m => m.type === 'content' && m.content.length > 50),
  hasErrorRecovery: response.filter(m => m.type === 'error').length < 2,
  hasPlaceholders: detectPlaceholders(response).length > 0,
  consistency: checkOutputConsistency(response)
};
```

❌ **DON'T:**
```javascript
// Syntactic validation
const validation = {
  response[0].type === 'content', // Too strict
  response.content === 'Meeting scheduled', // Hard-coded, fails on variation
  response.length === 5 // Brittle to API changes
};
```

### 3. Error Handling

✅ **DO:**
```javascript
try {
  const response = await client.sendMessage(input);
  const validation = validateResponse(response);
  
  if (!validation.passed) {
    logIssue({
      input,
      response: response.map(m => ({ type: m.type, preview: m.toString().substring(0, 100) })),
      validation
    });
  }
} catch (error) {
  if (error.message.includes('timeout')) {
    metrics.timeoutCount++;
  } else if (error.message.includes('connection')) {
    metrics.connectionCount++;
  }
  // Continue with next test
}
```

❌ **DON'T:**
```javascript
// Let errors propagate
try {
  await client.sendMessage(input);
} catch (e) {
  throw e; // Stops entire test suite
}
```

### 4. Metrics Collection

✅ **DO:**
```javascript
metrics.collect({
  testName: 'calendar_complete',
  duration: responseTime,
  success: validation.passed,
  placeholderAccuracy: detectedPlaceholders.length === expectedPlaceholders.length ? 1 : 0,
  errorCount: response.filter(m => m.type === 'error').length,
  placeholderCount: detectedPlaceholders.length,
  timestamp: new Date()
});
```

❌ **DON'T:**
```javascript
// Aggregate before analysis
totalTests++;
if (success) totalPassed++;
// No detail collection, can't diagnose issues later
```

### 5. Test Organization

✅ **DO:**
```javascript
// Organized by feature area
tests/
  ├── calendar/
  │   ├── complete-request.test.js
  │   ├── vague-request.test.js
  │   └── error-handling.test.js
  ├── authentication/
  ├── streaming/
  └── common/
      └── test-client.js
```

❌ **DON'T:**
```javascript
// Monolithic test file
tests/
  └── all-tests.js  // 5000 lines, hard to maintain
```

---

## Real-World Examples

### Example 1: Calendar Integration Test

```javascript
// Full example with all pieces

const AgenticTestClient = require('./agentic-test-client');
const CalendarTestModule = require('./calendar-tests');

async function runCalendarIntegrationTest() {
  console.log('🤖 Starting Calendar Integration Test Suite\n');

  const client = new AgenticTestClient({
    baseUrl: 'ws://localhost:8080',
    timeout: 30000,
    captureMetrics: true
  });

  try {
    // Setup
    await client.connect();
    await client.authenticate();

    // Run tests
    const calendarTests = new CalendarTestModule(client);
    const results = await calendarTests.runAllTests();

    // Report
    console.log('\n📊 Test Results:');
    Object.entries(results).forEach(([testName, result]) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${testName}`);
      result.assertions.forEach(a => {
        const check = a.passed ? '✓' : '✗';
        console.log(`  ${check} ${a.name}`);
      });
    });

    // Metrics
    const metrics = client.getMetrics();
    console.log('\n📈 Metrics:');
    console.log(`  Avg Response Time: ${metrics.avgResponseTime}`);
    console.log(`  Error Rate: ${metrics.errorRate}`);
    console.log(`  Total Messages: ${metrics.messagesReceived}`);

  } finally {
    await client.disconnect();
  }
}

runCalendarIntegrationTest().catch(console.error);
```

### Example 2: Parallel Test Execution

```javascript
// Multiple features tested in parallel

const features = [
  { name: 'Calendar', module: CalendarTestModule },
  { name: 'Authentication', module: AuthTestModule },
  { name: 'Streaming', module: StreamingTestModule },
  { name: 'ErrorHandling', module: ErrorHandlingTestModule }
];

async function runParallelTests() {
  const results = await Promise.all(
    features.map(async (feature) => {
      const client = new AgenticTestClient();
      await client.connect();
      await client.authenticate();

      const testModule = new feature.module(client);
      const result = await testModule.runAllTests();

      await client.disconnect();
      return { feature: feature.name, ...result };
    })
  );

  return results;
}
```

---

## Summary

### When to Use Which Approach?

| Approach | Best For | Duration | Cost |
|----------|----------|----------|------|
| **Semi-Automated** | New features, exploratory | 30-60 min | High (human time) |
| **Fully Automated** | Regression, CI/CD | 5-10 min | Low (cpu time) |
| **Hybrid** | Production systems | Continuous | Balanced |

### Key Takeaways

1. **Agentic clients** understand semantics, not just syntax
2. **Parallel execution** scales testing across multiple features
3. **Metrics collection** provides continuous improvement signal
4. **Error recovery** more important than error prevention
5. **Deterministic validation** works better than AI-based validation for automated tests
6. **State management** crucial for reliable results
7. **Documentation** through metrics and logs

### Next Steps

1. Choose your testing approach (Semi/Automated/Hybrid)
2. Adapt the templates to your application
3. Start with one feature module
4. Expand to full suite
5. Integrate with CI/CD
6. Monitor and iterate

Happy testing! 🚀
