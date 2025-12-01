# 🎴 Integration Testing - Quick Reference Card

Print this card. Keep it at your desk. Use it while developing.

---

## 📍 Which Document?

```
Need quick start?        → PRACTICAL_IMPLEMENTATION_GUIDE.md
Need to understand?      → AGENTIC_INTEGRATION_TESTING_GUIDE.md
Need code patterns?      → TESTING_FRAMEWORK_PATTERNS.md
Need visual overview?    → INTEGRATION_TESTING_VISUAL_SUMMARY.md
Lost or confused?        → INTEGRATION_TESTING_MASTER_INDEX.md (this file)
```

---

## ⚡ 5-Minute Quick Start

```bash
# 1. Create folder
mkdir testing-framework && cd testing-framework

# 2. Install dependencies
npm install ws events

# 3. Copy core files (from TESTING_FRAMEWORK_PATTERNS.md)
# - Copy: core/agentic-client.js
# - Copy: core/test-runner.js
# - Copy: config/default.config.js
# - Copy: utils/response-parser.js

# 4. Create first test (from PRACTICAL_IMPLEMENTATION_GUIDE.md)
# Copy: modules/calendar-tests.js

# 5. Run test
node run-first-test.js
```

---

## 🧪 Test Template (Copy & Modify)

```javascript
class MyFeatureTests {
  constructor(client, logger) {
    this.client = client;
    this.logger = logger;
  }

  async testMyScenario() {
    // 1. Send input
    const response = await this.client.sendMessage('Your input');
    
    // 2. Parse response
    const parsed = ResponseParser.parse(response);
    
    // 3. Create assertions
    const assertions = [
      { name: 'Check 1', result: parsed.content.length > 0 },
      { name: 'Check 2', result: parsed.errors.length === 0 }
    ];
    
    // 4. Return result
    return {
      passed: assertions.every(a => a.result),
      assertions,
      parsed
    };
  }

  async runAllTests() {
    return {
      scenario1: await this.testMyScenario()
    };
  }
}
```

---

## 📋 Common Validations

```javascript
// Has response
parsed.content.length > 0

// No errors
parsed.errors.length === 0

// Has tool calls
parsed.metadata.hasToolCalls

// Has placeholders
parsed.placeholders.length > 0

// Specific placeholder
parsed.placeholders.includes('meeting_title')

// Tool parameters exist
parsed.toolCalls[0]?.title !== undefined

// Keyword in response
parsed.content.toLowerCase().includes('meeting')

// Response time acceptable
duration < 5000
```

---

## 🔍 Response Structure

```javascript
const parsed = ResponseParser.parse(response);

parsed.content          // Conversational text
parsed.toolCalls        // Array of tool calls
parsed.errors           // Array of errors
parsed.placeholders     // Array of placeholder names
parsed.metadata         // Message counts and types
parsed.raw              // Original response array
```

---

## 🚀 Running Tests

```javascript
// Single test
const result = await testModule.testMyScenario();

// All tests in module
const results = await testModule.runAllTests();

// With runner
const runner = new TestRunner();
runner.registerSuite('my_feature', testModule);
const report = await runner.runSuite('my_feature');
```

---

## 🐛 Debugging Checklist

```
❓ Tests won't connect?
  → Check: baseUrl in config
  → Check: Server is running (curl http://localhost:8080)
  → Fix: Enable logLevel: 'debug'

❓ Tests timing out?
  → Check: messageTimeout setting (default 30s)
  → Check: Server performance
  → Fix: Increase timeout or check server logs

❓ Assertions always fail?
  → Check: Using semantic validation (not exact string match)
  → Check: ResponseParser is parsing correctly
  → Fix: Print parsed object to see what you actually got

❓ State pollution?
  → Check: Creating fresh client per test
  → Fix: Don't share client between tests

❓ Flaky tests?
  → Check: Assertions too strict
  → Fix: Use lenient validation with tolerance for variance
```

---

## 📊 Metrics to Track

```javascript
const metrics = client.getMetrics();

// What to look for:
metrics.avgResponseTime        // Should be < 5s
metrics.errorRate              // Should be < 5%
metrics.successRate            // Should be > 95%
metrics.messagesReceived       // Should match expected
metrics.responseTimes[]        // Track trend over time
```

---

## 🎯 Test Naming Convention

```
test + Feature + Scenario

testCalendarCompleteRequest()
testCalendarVagueRequest()
testCalendarErrorRecovery()
testAuthValidCredentials()
testAuthInvalidCredentials()
testStreamingLargePayload()
```

---

## 📌 Must-Know Files

```
core/agentic-client.js
  → Main class: EnhancedAgenticClient
  → Key methods: connect(), authenticate(), sendMessage()
  → Key methods: parseResponse(), getMetrics()

core/test-runner.js
  → Main class: TestRunner
  → Key methods: registerSuite(), runSuite(), runAllSuites()

modules/calendar-tests.js
  → Example implementation
  → Copy and adapt for your features

config/default.config.js
  → Connection settings
  → Test execution settings
  → Reporting options
```

---

## ⚙️ Configuration Essentials

```javascript
const config = {
  baseUrl: 'ws://localhost:8080',          // Your app URL
  messageTimeout: 30000,                   // Max wait for response (ms)
  connectionTimeout: 5000,                 // Max wait for connection (ms)
  logLevel: 'info',                        // debug, info, warn, error
  concurrency: 5,                          // Parallel tests
  captureMetrics: true                     // Collect metrics
};
```

---

## 🔄 Test Execution Flow

```
1. Connect to WebSocket
2. Authenticate
3. Send test message
4. Stream responses
5. Collect all data
6. Parse responses
7. Validate with assertions
8. Record metrics
9. Return result
10. Cleanup & disconnect
```

---

## ✅ Assertion Examples

```javascript
// Simple content check
{ name: 'Has content', result: parsed.content.length > 50 }

// Error validation
{ name: 'No critical errors', result: 
  !parsed.errors.some(e => e.severity === 'critical') 
}

// Tool validation
{ name: 'Tool identified', result: 
  parsed.toolCalls.some(tc => tc.name === 'create_calendar_event') 
}

// Placeholder validation
{ name: 'Placeholders generated', result: 
  parsed.placeholders.includes('meeting_title') 
}

// Parameter validation
{ name: 'Title extracted', result: 
  parsed.toolCalls[0]?.title?.length > 0 
}

// Performance validation
{ name: 'Fast response', result: 
  duration < 5000 
}
```

---

## 🎓 Key Concepts

**Semantic Validation**
- Checks meaning, not exact format
- Robust to changes
- Better for AI responses

**Placeholder Format**
- `{{PLACEHOLDER_parameter_name}}`
- Indicates missing info needed
- Status remains "ready" (not blocking)

**Agentic Client**
- WebSocket connection manager
- Response parser
- Metrics collector
- Reusable for any WebSocket app

**Test Module**
- Feature-specific tests
- Multiple test methods
- Returns assertion results
- Extends TestRunner

**Semi-Automated**
- Human reviews results
- Exploratory testing
- Good for new features

**Fully Automated**
- Deterministic validation
- CI/CD integration
- Performance monitoring

---

## 🚦 Status Quick Check

```
Test Status: PASS ✅
→ All assertions passed
→ No errors
→ Metrics normal

Test Status: FAIL ❌
→ One or more assertions failed
→ Check assertion names for details
→ Review parsed response

Test Status: ERROR ⚠️
→ Exception during test execution
→ Check error message and stack
→ Likely configuration issue

Test Status: TIMEOUT ⏱️
→ Didn't receive response in time
→ Check server is running
→ Increase timeout setting
```

---

## 📞 Support Matrix

| Issue | Check First | Then Try |
|-------|-------------|----------|
| Can't connect | Server running? | Check baseUrl, firewall |
| Timeout | Server responsive? | Increase timeout, check load |
| Parse errors | Valid JSON? | Enable captureRawData |
| Assertions fail | Output structure? | Print parsed object |
| Flaky tests | Assertions too strict? | Use lenient validation |
| State issues | Fresh client per test? | Don't share state |

---

## 🔗 Integration Patterns

**With Calendar API:**
```javascript
async testScheduleEvent() {
  const response = await this.client.sendMessage(
    'Schedule meeting tomorrow 2pm'
  );
  const parsed = ResponseParser.parse(response);
  return { passed: parsed.toolCalls.length > 0 };
}
```

**With Auth System:**
```javascript
async testLoginFlow() {
  const response = await this.client.sendMessage(
    'Log in as user@example.com'
  );
  const parsed = ResponseParser.parse(response);
  return { passed: parsed.metadata.hasContent };
}
```

**With Streaming:**
```javascript
async testStreamResponse() {
  const response = await this.client.sendMessage(
    'Process large file'
  );
  const parsed = ResponseParser.parse(response);
  return { passed: parsed.raw.length > 50 };
}
```

---

## 📈 Performance Baselines

```
Healthy Range:
  Avg Response Time:  2-5 seconds
  Error Rate:         < 5%
  Success Rate:       > 95%
  P95 Response Time:  < 10 seconds
  Connection Time:    < 1 second

Warning Signs:
  Avg > 10 seconds    → Server under load or slow
  Error Rate > 10%    → Application issues
  P95 > 20 seconds    → Outlier events occurring
  Connection fails    → Network or server issues
```

---

## 🎬 Common Commands

```bash
# Start dev server
npm run dev

# Run all tests
node scripts/run-all.js

# Run specific feature
node scripts/run-semi-automated.js

# Generate report
npm run test:report

# View metrics
npm run test:metrics

# Debug specific test
DEBUG=* node scripts/run-all.js

# With raw data capture
CAPTURE_RAW=true node scripts/run-all.js
```

---

## 📚 Documentation Structure

```
AGENTIC_INTEGRATION_TESTING_GUIDE.md
  ├─ Understanding concepts
  ├─ Architecture patterns
  ├─ Best practices
  └─ Real examples

TESTING_FRAMEWORK_PATTERNS.md
  ├─ Component details
  ├─ Test patterns
  ├─ Configuration
  └─ Troubleshooting

PRACTICAL_IMPLEMENTATION_GUIDE.md
  ├─ Quick start
  ├─ Step-by-step setup
  ├─ Working examples
  └─ Debugging tips

INTEGRATION_TESTING_VISUAL_SUMMARY.md
  ├─ Diagrams
  ├─ Visual explanations
  ├─ Architecture overview
  └─ Decision trees

THIS FILE: Quick Reference
  ├─ Checklists
  ├─ Templates
  ├─ Common solutions
  └─ Quick lookup
```

---

## 🎯 Next Steps

**Today:**
- [ ] Read quick start section
- [ ] Copy framework files
- [ ] Run first test

**This Week:**
- [ ] Test one feature completely
- [ ] Write 3-5 test cases
- [ ] Generate report

**Next Week:**
- [ ] Test all features
- [ ] Setup CI/CD
- [ ] Create baseline metrics

**Production:**
- [ ] Deploy to staging
- [ ] Monitor results
- [ ] Optimize performance

---

## 💾 Save This Reference

**Print it out** - Keep at your desk  
**Bookmark it** - In your browser  
**Share it** - With your team  
**Reference it** - While developing tests  

---

## 📞 When You Need Help

1. **Can't find something?**
   → Check INTEGRATION_TESTING_MASTER_INDEX.md

2. **Need visual explanation?**
   → Check INTEGRATION_TESTING_VISUAL_SUMMARY.md

3. **Need code example?**
   → Check PRACTICAL_IMPLEMENTATION_GUIDE.md

4. **Need to understand pattern?**
   → Check TESTING_FRAMEWORK_PATTERNS.md

5. **Need architectural guidance?**
   → Check AGENTIC_INTEGRATION_TESTING_GUIDE.md

6. **Still stuck?**
   → Print this card and refer to "Support Matrix" above

---

**Remember:** Start small, test one feature, then expand. You've got this! 🚀

---

*Last Updated: November 29, 2025*  
*Status: Production Ready*  
*Version: 1.0*
