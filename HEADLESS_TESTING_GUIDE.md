# Headless Testing Guide

## Overview

Automated headless testing allows you to test your entire application flow without a UI. Perfect for:
- CI/CD pipelines
- Load testing
- Regression testing
- Performance benchmarking
- Rapid iteration

## What You Need

### Required Data

1. **userId** - Unique identifier for test user
   - Format: `test-user-xyz` or UUID
   - Must exist in your database (or mocked)

2. **connectionId** - Nango connection ID
   - Format: `nango-{provider}-{id}` e.g., `nango-gmail-001`
   - Links user to their email/calendar provider
   - Obtain from Nango dashboard or API

3. **sessionId** - WebSocket session identifier
   - Auto-generated: `session-{uuid}`
   - Groups related messages together

4. **Provider** - Which service provider
   - `google-mail-ynxw` (Gmail)
   - `microsoft-outlook` (Outlook)
   - `notion` (Notion)
   - etc.

5. **Message ID** - Individual message tracking
   - Auto-generated: `msg-{uuid}`
   - Tracks message through pipeline

## Quick Start

### 1. Unit Tests (Mocha)

```bash
# Run E2E tests with real server
npm test -- tests/headless-e2e.test.ts

# Run with verbose logging
TEST_LOG_LEVEL=debug npm test -- tests/headless-e2e.test.ts

# Run specific test suite
npm test -- tests/headless-e2e.test.ts --grep "User Message Processing"
```

### 2. Load Testing (Bash)

```bash
# Test with 5 users, 10 requests each
bash tests/headless-load-test.sh 5 10

# Test with custom configuration
bash tests/headless-load-test.sh \
  10 \              # 10 users
  20 \              # 20 requests per user
  5 \               # 5 concurrent connections
  results.json      # Output file

# Results are saved to JSON file
cat results.json | jq '.results.latency'
```

### 3. Direct WebSocket Testing (Node.js)

```typescript
import { HeadlessWSClient } from './tests/headless-ws-client';

const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user-001',
    timeout: 45000,
    verbose: true,
});

await client.connect();
const response = await client.sendUserMessage(
    'Show my recent emails from today'
);
console.log(response);
await client.disconnect();
```

## Environment Setup

Create `.env.test`:

```bash
# WebSocket
TEST_WS_URL=ws://localhost:3000

# API
TEST_API_URL=http://localhost:3000/api

# Database (use test database!)
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/cortex_test

# Redis
TEST_REDIS_URL=redis://localhost:6379/1

# APIs
GROQ_API_KEY=your_key
NANGO_API_KEY=your_key
```

Or export environment variables:

```bash
export TEST_WS_URL=ws://localhost:3000
export TEST_DATABASE_URL=postgresql://...
npm test
```

## Test Data Generation

### Manual Creation

```typescript
import { TestDataFactory, generateTestFixture } from './tests/headless-test-config';

// Create single user
const user = TestDataFactory.createTestUser({
    userId: 'my-user-001',
    email: 'user@example.com'
});

// Create connection for that user
const connection = TestDataFactory.createTestConnection(user.userId, {
    provider: 'google-mail-ynxw'
});

// Create session
const session = TestDataFactory.createTestSession(user.userId, [connection.connectionId]);
```

### Bulk Creation

```typescript
import { generateTestFixture } from './tests/headless-test-config';

// Create 10 users with 2 connections each
const fixture = generateTestFixture(10, 2);
// fixture.users: User[]
// fixture.connections: Connection[]
// fixture.sessions: Session[]
```

## Message Types

### Auth Message
```json
{
  "type": "auth_message",
  "payload": {
    "userId": "test-user-001",
    "sessionId": "session-abc123",
    "authToken": "mock-token-xyz"
  }
}
```

### User Message (Triggers pipeline)
```json
{
  "type": "user_message",
  "payload": {
    "userMessage": "Show my recent emails",
    "sessionId": "session-abc123",
    "userId": "test-user-001",
    "messageId": "msg-xyz789"
  }
}
```

### Action Execution
```json
{
  "type": "action_execute",
  "payload": {
    "actionId": "action-001",
    "planId": "plan-001",
    "sessionId": "session-abc123",
    "userId": "test-user-001",
    "arguments": {
      "operation": "fetch",
      "filters": { "limit": 5 }
    }
  }
}
```

## Response Types

```typescript
interface TestResponse {
    type: string;
    content?: any;
    error?: string;
    timestamp: Date;
}
```

Common response types:
- `conversational_text_segment` - LLM streaming response
- `conversational_response_complete` - LLM finished
- `tool_call` - Tool invocation
- `tool_result` - Tool result
- `plan_created` - Action plan generated
- `execution_started` - Tool execution started
- `error` - Error occurred

## Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Connect latency | < 1s | < 2s |
| Message process | < 30s | < 45s |
| P95 latency | < 25s | < 35s |
| Success rate | > 99% | > 95% |
| Throughput | > 1 req/s | > 0.5 req/s |

## Common Issues & Fixes

### Connection Timeouts
```bash
# Increase timeout
TEST_TIMEOUT=60000 npm test

# Check server is running
curl http://localhost:3000/health
```

### Rate Limit Errors (Groq)
- Reduce number of concurrent requests
- Compress email bodies more aggressively
- Use smaller test dataset

### Database Not Found
```bash
# Create test database
createdb cortex_test

# Verify connection
psql -c "SELECT 1" $TEST_DATABASE_URL
```

### Redis Connection Failed
```bash
# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:latest
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Headless Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: cortex_test
          POSTGRES_PASSWORD: test
      redis:
        image: redis:latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test -- tests/headless-e2e.test.ts
      - run: bash tests/headless-load-test.sh 3 5
```

### GitLab CI Example
```yaml
headless_tests:
  image: node:18
  services:
    - postgres:14
    - redis:latest
  script:
    - npm install
    - npm test -- tests/headless-e2e.test.ts
    - bash tests/headless-load-test.sh 3 5
```

## Debugging

### Enable verbose logging
```typescript
const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user-001',
    verbose: true,  // Log all messages
});
```

### Inspect message queue
```typescript
const messages = client.getMessages();
messages.forEach(msg => {
    console.log(`${msg.type}: `, JSON.stringify(msg.content, null, 2));
});
```

### Monitor server logs
```bash
# In separate terminal
tail -f server.log | grep -E "sessionId|userId|error"
```

## Best Practices

1. **Isolate test data** - Use separate test database/user
2. **Parallel testing** - Use load test for concurrent users
3. **Realistic queries** - Test actual user workflows
4. **Monitor resources** - Check CPU/memory during load tests
5. **Measure baseline** - Record initial performance
6. **Track regressions** - Compare results across runs
7. **Test edge cases** - Empty results, large datasets, slow responses

## Metrics to Track

- **Connection latency** - Time to connect
- **First response** - Time to first character
- **Full response** - Time to completion
- **Success rate** - % of requests that succeed
- **Error types** - Connection, timeout, validation, etc.
- **Token usage** - Groq API tokens consumed
- **Database queries** - Number and duration
- **Memory usage** - Peak and average

## Next Steps

1. Start with E2E tests: `npm test tests/headless-e2e.test.ts`
2. Run load test: `bash tests/headless-load-test.sh 5 10`
3. Integrate into CI/CD pipeline
4. Monitor and optimize based on metrics
5. Add regression tests for bugs found

## Support

For issues:
1. Check `.env` configuration
2. Verify server is running
3. Check logs: `tail -f server.log`
4. Run with verbose: `TEST_LOG_LEVEL=debug npm test`
5. Review error messages in test output
