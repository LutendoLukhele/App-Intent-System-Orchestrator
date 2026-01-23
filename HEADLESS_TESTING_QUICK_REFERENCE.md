# Headless Testing Quick Reference

## What You Need for Testing

### Core Data Requirements

| Parameter | Example | Purpose | Required |
|-----------|---------|---------|----------|
| **userId** | `test-user-001` | Identify test user | ✅ Yes |
| **connectionId** | `nango-google-mail-abc123` | Link to email provider | ✅ Yes |
| **sessionId** | `session-001` | Group related messages | ⚠️ Auto-generated if missing |
| **messageId** | `msg-001` | Track individual messages | ⚠️ Auto-generated |
| **provider** | `google-mail`, `microsoft-outlook` | Email service type | ✅ Yes (via connection) |

### Authentication
- **Firebase Token**: Auto-handled by `HeadlessWSClient` (from userId)
- **Nango Connection**: Stored in `connectionId` reference

---

## Files Created

```
tests/
├── headless-test-config.ts      ← Test data factories & utilities
├── headless-ws-client.ts        ← WebSocket testing client
├── headless-e2e.test.ts         ← Mocha test suite
├── headless-load-test.sh        ← Concurrent load testing
├── headless-examples.ts         ← Copy-paste examples
├── setup-headless-tests.sh      ← Environment setup
└── HEADLESS_TESTING_GUIDE.md    ← Full documentation
```

---

## Quick Start (3 Steps)

### Step 1: Setup Environment
```bash
bash tests/setup-headless-tests.sh
# Creates .env.test and checks dependencies
```

### Step 2: Start Your Server
```bash
npm run dev
# Server should be at ws://localhost:3000
```

### Step 3: Run Tests
```bash
# Option A: E2E tests (Mocha)
npm test tests/headless-e2e.test.ts

# Option B: Copy example and modify
npx ts-node tests/headless-examples.ts

# Option C: Load test (5 users, 10 requests each)
bash tests/headless-load-test.sh 5 10 5 results.json
```

---

## Usage Patterns

### Pattern 1: Single User, Single Message
```typescript
import { HeadlessWSClient } from './tests/headless-ws-client';

const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user-001',
    verbose: true,
});

await client.connect();
const response = await client.sendUserMessage('Show my emails');
await client.disconnect();
```

### Pattern 2: Sequential Messages (Session State)
```typescript
const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user-001',
    sessionId: 'session-001',  // Keep same sessionId
});

await client.connect();
await client.sendUserMessage('Get my emails');
await client.sendUserMessage('Filter to unread');  // Has context from previous
await client.disconnect();
```

### Pattern 3: Multi-User Concurrent
```typescript
const promises = [];
for (let i = 1; i <= 5; i++) {
    promises.push((async () => {
        const client = new HeadlessWSClient({
            wsUrl: 'ws://localhost:3000',
            userId: `user-${i}`,
        });
        await client.connect();
        const result = await client.sendUserMessage('Show my emails');
        await client.disconnect();
        return result;
    })());
}
await Promise.all(promises);
```

### Pattern 4: Error Handling
```typescript
const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user',
    timeout: 5000,  // 5 second timeout
});

try {
    await client.connect();
    const response = await client.sendUserMessage('Test');
} catch (err) {
    if (err.message.includes('timeout')) {
        console.log('Request took too long');
    } else {
        console.log('Other error:', err.message);
    }
} finally {
    await client.disconnect();
}
```

---

## Load Testing

### Basic Load Test
```bash
# 10 users, 5 requests per user, 2 concurrent connections
bash tests/headless-load-test.sh 10 5 2
```

### Load Test with Output File
```bash
bash tests/headless-load-test.sh 10 5 2 results.json
# Outputs JSON with latency metrics (min, max, avg)
# Exit code: 0 = pass (>95% success), 1 = fail
```

### CI/CD Integration
```bash
# In your pipeline:
bash tests/headless-load-test.sh 5 10 5 ci-results.json
if [ $? -eq 0 ]; then
    echo "Load test passed"
else
    echo "Load test failed"
    exit 1
fi
```

---

## Environment Variables

### .env.test
```
# WebSocket
TEST_WS_URL=ws://localhost:3000

# API
TEST_API_URL=http://localhost:3000/api

# Database (use TEST database!)
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cortex_test

# Redis
TEST_REDIS_URL=redis://localhost:6379

# Logging
TEST_LOG_LEVEL=debug

# API Keys (from your .env)
GROQ_API_KEY=your_key_here
NANGO_API_KEY=your_key_here
```

---

## Common Issues & Fixes

### ❌ "Connection refused"
```
Error: getaddrinfo ECONNREFUSED 127.0.0.1:3000
```
**Fix**: Start your server first
```bash
npm run dev
```

### ❌ "Request timeout"
```
Error: WebSocket request timeout after 45000ms
```
**Fix**: Increase timeout or check server logs
```typescript
const client = new HeadlessWSClient({
    timeout: 120000,  // Increase to 2 minutes
});
```

### ❌ "Invalid user"
```
Error: Firebase auth failed
```
**Fix**: Use valid userId format (alphanumeric + hyphens)
```typescript
userId: 'test-user-123'  // Good
userId: 'test@user'      // Bad (@ invalid)
```

### ❌ "Load test shows low success rate"
```
Success rate: 45.2%
```
**Fix**: Check:
1. Server is handling connections
2. Database is available
3. Redis is running
4. Network latency is acceptable

---

## Performance Expectations

### Latency Targets
| Metric | Target | Acceptable Range |
|--------|--------|------------------|
| **P50** (median) | 500ms | 300-800ms |
| **P95** (95th percentile) | 2s | 1-5s |
| **P99** (99th percentile) | 5s | 3-10s |

### Throughput Targets
| Scenario | Target | Notes |
|----------|--------|-------|
| **Single user** | 1-2 req/s | Low latency, full processing |
| **10 concurrent users** | 5-10 req/s | Depends on server resources |
| **100 concurrent users** | 20-50 req/s | May require load balancing |

### Success Rate Targets
- **E2E Tests**: ≥ 99% (must pass)
- **Load Tests**: ≥ 95% (acceptable)
- **Production**: ≥ 99.9% (target)

---

## Test Data Factory

Generate test data programmatically:

```typescript
import { TestDataFactory } from './tests/headless-test-config';

// Generate unique IDs
const userId = TestDataFactory.generateUserId();           // "user-abc123..."
const sessionId = TestDataFactory.generateSessionId();     // "session-def456..."
const connectionId = TestDataFactory.generateConnectionId('gmail');  // "nango-google-mail-..."
const messageId = TestDataFactory.generateMessageId();     // "msg-ghi789..."

// Create full test fixtures
const fixture = TestDataFactory.generateTestFixture({
    numUsers: 5,
    emailsPerUser: 50,
    providers: ['gmail', 'outlook'],
});

// Access:
fixture.users[0].userId          // test-user-001
fixture.users[0].connectionId    // nango-google-mail-...
fixture.emails[0]                // Sample email object
```

---

## Test Message Types

### User Message
```json
{
    "type": "user_message",
    "query": "Show my unread emails",
    "sessionId": "session-001",
    "messageId": "msg-001"
}
```

### Expected Response Types
- `ai_response` - LLM thinking/response
- `tool_call` - Tool execution request
- `tool_result` - Tool execution result
- `error_message` - Error occurred

---

## Next Steps

1. **Run Setup**: `bash tests/setup-headless-tests.sh`
2. **Start Server**: `npm run dev`
3. **Try Example**: `npx ts-node tests/headless-examples.ts`
4. **Run E2E Tests**: `npm test tests/headless-e2e.test.ts`
5. **Run Load Test**: `bash tests/headless-load-test.sh 5 10`
6. **Integrate to CI/CD**: See examples in HEADLESS_TESTING_GUIDE.md

---

## Support

- **Full Guide**: [HEADLESS_TESTING_GUIDE.md](HEADLESS_TESTING_GUIDE.md)
- **Config Reference**: [headless-test-config.ts](headless-test-config.ts)
- **WebSocket Client**: [headless-ws-client.ts](headless-ws-client.ts)
- **Mocha Tests**: [headless-e2e.test.ts](headless-e2e.test.ts)

