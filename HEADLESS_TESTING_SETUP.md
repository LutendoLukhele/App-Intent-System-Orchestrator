# Automated Headless Testing - Complete Setup

## 📋 Overview

Your system now has **full automated testing capabilities** for rapid headless testing without the UI. This enables:
- ✅ Automated E2E testing (Mocha)
- ✅ Concurrent load testing (Bash/Node)
- ✅ Performance monitoring
- ✅ CI/CD integration (GitHub Actions)
- ✅ Copy-paste examples for quick testing

---

## 📦 What Was Created

### 1. **Core Testing Files** (`tests/`)

| File | Purpose | Size |
|------|---------|------|
| `headless-test-config.ts` | Test data factories, fixtures | ~600 lines |
| `headless-ws-client.ts` | WebSocket testing client | ~300 lines |
| `headless-e2e.test.ts` | Mocha E2E test suite | ~400 lines |
| `headless-examples.ts` | 6 copy-paste examples | ~400 lines |
| `headless-load-test.sh` | Concurrent load testing | ~250 lines |
| `setup-headless-tests.sh` | Environment setup | ~100 lines |

### 2. **Documentation**

| File | Purpose |
|------|---------|
| `HEADLESS_TESTING_GUIDE.md` | Full reference (400+ lines) |
| `HEADLESS_TESTING_QUICK_REFERENCE.md` | Quick lookup guide |
| `.github/workflows/headless-tests.yml` | CI/CD pipeline (GitHub Actions) |

---

## 🚀 Quick Start (Choose One)

### Option A: Run Everything (Recommended)
```bash
# 1. Setup
bash tests/setup-headless-tests.sh

# 2. Start server
npm run dev

# 3. In another terminal, run all tests
npm test tests/headless-e2e.test.ts
```

### Option B: Copy an Example
```bash
# Pick one from tests/headless-examples.ts and run it:
npx ts-node tests/headless-examples.ts
```

### Option C: Load Test Only
```bash
# Start server first
npm run dev

# Then run load test (5 users, 10 requests, 5 concurrent):
bash tests/headless-load-test.sh 5 10 5 results.json
```

---

## 🎯 What Data Do You Need?

| Field | Example | How to Get |
|-------|---------|-----------|
| **userId** | `test-user-001` | Generate or use actual user ID |
| **connectionId** | `nango-google-mail-abc123` | From Nango provider registration |
| **provider** | `google-mail` or `microsoft-outlook` | Depends on email service |
| **sessionId** | `session-001` | Auto-generated, or provide custom |
| **messageId** | `msg-001` | Auto-generated per message |

### Auto-Generated if Missing
- sessionId
- messageId

### Required from You
- userId (just needs to be unique)
- connectionId (or provide provider name)

---

## 📊 Test Scenarios

### Single User Test
```typescript
const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user-001',
});
await client.connect();
await client.sendUserMessage('Show my emails');
await client.disconnect();
```

### Multi-User Load Test
```bash
bash tests/headless-load-test.sh 10 5  # 10 users, 5 requests each
```

### Sequential Messages (Same Session)
```typescript
const client = new HeadlessWSClient({
    wsUrl: 'ws://localhost:3000',
    userId: 'test-user-001',
    sessionId: 'session-001',  // Same session for context
});
await client.sendUserMessage('Get my emails');
await client.sendUserMessage('Filter to unread');  // Has context
```

---

## ✅ Verification Checklist

- [ ] Run `bash tests/setup-headless-tests.sh` ✓ No errors?
- [ ] Start server: `npm run dev` ✓ Server running on 3000?
- [ ] Update `.env.test` with API keys
- [ ] Run E2E: `npm test tests/headless-e2e.test.ts` ✓ Tests pass?
- [ ] Run load test: `bash tests/headless-load-test.sh 5 10` ✓ Success rate > 95%?
- [ ] Check performance: Is avg latency < 2 seconds?

---

## 📈 Expected Performance

### Latency Expectations
```
Single message: 500-1000ms
Multiple concurrent: 1-3s average
Load test (10 users): 1-2s per request
```

### Success Rate Expectations
```
E2E Tests: ≥ 99%
Load Tests: ≥ 95%
Production: ≥ 99.9%
```

---

## 🔧 Common Commands

```bash
# Setup
bash tests/setup-headless-tests.sh

# Run server
npm run dev

# E2E tests (all 5 test suites)
npm test tests/headless-e2e.test.ts

# Run single example
npx ts-node tests/headless-examples.ts

# Load test with 10 users
bash tests/headless-load-test.sh 10 10 5 results.json

# Check results
cat results.json | jq '.metrics'

# Watch for changes (rebuild & retest)
npm test -- --watch tests/headless-e2e.test.ts
```

---

## 🏗️ Architecture

```
User Request
    ↓
HeadlessWSClient (tests/headless-ws-client.ts)
    ↓
WebSocket Connection (ws://localhost:3000)
    ↓
Server (index.ts)
    ├─ Auth: Firebase validation
    ├─ Message: ProcessMessageAndAggregateResults()
    └─ Tools: Email fetch, LLM processing
    ↓
Response (tool results, AI response, etc.)
    ↓
Test Assertion (Chai)
```

---

## 🔐 Security Notes

### Test Credentials
- **Use test database**: `cortex_test` (separate from production)
- **Use test Redis**: Local instance or test namespace
- **Use test API keys**: Create separate Groq/Nango keys for testing
- **Never use production user IDs in tests**

### Environment Separation
```bash
# Development
.env → Production settings

# Testing
.env.test → Test settings (different DB, Redis, keys)
```

---

## 🚀 CI/CD Integration

### GitHub Actions
```bash
# Automatically runs:
1. E2E tests (npm test)
2. Load tests (bash script)
3. Performance regression checks
4. Notifies on failure
```

### Manual Trigger
```bash
# Run tests before commit
npm test tests/headless-e2e.test.ts

# Run load test before push
bash tests/headless-load-test.sh 5 10 5
```

---

## 📖 Reference Files

| File | Purpose | Size |
|------|---------|------|
| `HEADLESS_TESTING_GUIDE.md` | Full documentation | 400+ lines |
| `HEADLESS_TESTING_QUICK_REFERENCE.md` | Quick lookup | 300+ lines |
| `tests/headless-examples.ts` | 6 copy-paste examples | 400+ lines |
| `tests/headless-test-config.ts` | Test utilities | 600+ lines |
| `tests/headless-ws-client.ts` | WebSocket client | 300+ lines |

---

## 🐛 Troubleshooting

### ❌ "Connection refused"
**Solution**: Start server first `npm run dev`

### ❌ "Timeout waiting for response"
**Solution**: Increase timeout or check server logs
```typescript
timeout: 120000  // 2 minutes instead of 45s
```

### ❌ "Low success rate in load test"
**Solution**: Check:
1. Database is running (PostgreSQL)
2. Redis is running
3. Server has enough memory
4. Network latency is acceptable

---

## 📞 Next Steps

1. **Setup**: Run `bash tests/setup-headless-tests.sh`
2. **Configure**: Update `.env.test` with your keys
3. **Test**: Start server and run E2E tests
4. **Validate**: Run load tests to check performance
5. **Integrate**: Add to GitHub Actions (ready to use!)
6. **Monitor**: Check performance baselines

---

## 💡 Pro Tips

- **Copy examples**: All 6 examples in `headless-examples.ts` are copy-paste ready
- **Reuse client**: Connection can be reused for multiple messages
- **Session state**: Use same `sessionId` to maintain context across messages
- **Load test JSON**: Output includes detailed latency metrics for analysis
- **Performance tracking**: Save load test results for trend analysis

---

## ✨ Summary

You now have:
- ✅ Automated E2E testing (Mocha)
- ✅ Load testing framework (bash + Node)
- ✅ Performance monitoring
- ✅ CI/CD ready (GitHub Actions)
- ✅ Complete documentation
- ✅ 6 copy-paste examples

**Start testing in 3 steps:**
```bash
bash tests/setup-headless-tests.sh
npm run dev  # In another terminal
npm test tests/headless-e2e.test.ts
```

