# 🚀 Headless Testing Framework - START HERE

**Status**: ✅ **READY TO USE**

This document is your **main entry point** for the automated headless testing system.

---

## 📋 What Is This?

A **production-ready headless testing framework** for rapidly testing your system without a browser or UI.

**What was created in response to:**
> "How and what do you need for an automated headless way of testing user, id, connection id what else so we can make this process faster"

**Answer**: Everything you need, all at once.

---

## 🎯 Quick Links

### 🏃 First Time? Start Here
1. **[HEADLESS_TESTING_SETUP.md](HEADLESS_TESTING_SETUP.md)** ← Read this first (5 min)
2. **[HEADLESS_TESTING_QUICK_REFERENCE.md](HEADLESS_TESTING_QUICK_REFERENCE.md)** ← Copy-paste commands
3. **[tests/headless-examples.ts](tests/headless-examples.ts)** ← 6 runnable examples

### 📖 Documentation
- **[HEADLESS_TESTING_GUIDE.md](HEADLESS_TESTING_GUIDE.md)** - Full reference (20 min read)
- **[HEADLESS_TESTING_DELIVERABLE.md](HEADLESS_TESTING_DELIVERABLE.md)** - What was created
- **[HEADLESS_TESTING_QUICK_REFERENCE.md](HEADLESS_TESTING_QUICK_REFERENCE.md)** - Lookup guide

### 💻 Code Files (in `tests/`)
- **[headless-ws-client.ts](tests/headless-ws-client.ts)** - WebSocket testing client
- **[headless-test-config.ts](tests/headless-test-config.ts)** - Test data factories
- **[headless-e2e.test.ts](tests/headless-e2e.test.ts)** - Mocha test suite
- **[headless-examples.ts](tests/headless-examples.ts)** - 6 working examples

### 🔧 Scripts
- **[tests/setup-headless-tests.sh](tests/setup-headless-tests.sh)** - Setup environment
- **[tests/headless-load-test.sh](tests/headless-load-test.sh)** - Load testing
- **[tests/quick-ref.sh](tests/quick-ref.sh)** - Quick reference card

### ✅ Verification
- **[verify-headless-setup.sh](verify-headless-setup.sh)** - Verify everything is installed

---

## ⚡ Get Started in 3 Minutes

### Step 1: Setup
```bash
bash tests/setup-headless-tests.sh
```
Takes ~30 seconds, checks dependencies, creates .env.test

### Step 2: Start Server
```bash
npm run dev
```
Keep this running in a terminal

### Step 3: Run Tests
```bash
npm test tests/headless-e2e.test.ts
```
Should see: `✅ All tests passed`

---

## 📊 What Can You Do Now?

### 1️⃣ Automated E2E Tests
```bash
npm test tests/headless-e2e.test.ts
```
- ✅ 5 test suites
- ✅ 23 test cases
- ✅ ~2 minutes to run
- ✅ Mocha + Chai

### 2️⃣ Load Testing (Concurrent Users)
```bash
bash tests/headless-load-test.sh 10 10 5 results.json
```
- ✅ Simulates 10 concurrent users
- ✅ 10 requests per user
- ✅ 5 concurrent connections
- ✅ JSON output with metrics

### 3️⃣ Copy-Paste Examples
```bash
npx ts-node tests/headless-examples.ts
```
- ✅ Single message
- ✅ Sequential messages
- ✅ Multi-user concurrent
- ✅ Error handling
- ✅ Multi-provider
- ✅ Performance testing

### 4️⃣ Custom Tests
Modify any example to test your specific scenario

---

## 📌 Key Concepts

### Data You Need to Provide
```
userId          Example: "test-user-001"
provider        Example: "google-mail" or "microsoft-outlook"
```

### Data That's Auto-Generated
```
connectionId    Example: "nango-google-mail-abc123"
sessionId       Example: "session-001"
messageId       Example: "msg-001"
```

### How It Works
```
Test Code
   ↓
HeadlessWSClient (WebSocket)
   ↓
Your Server (index.ts)
   ↓
Tool Execution (Email fetch, LLM processing)
   ↓
Response
   ↓
Assertion (Pass/Fail)
```

---

## 📚 Documentation Map

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[HEADLESS_TESTING_SETUP.md](HEADLESS_TESTING_SETUP.md)** | Overview & quick start | 5 min |
| **[HEADLESS_TESTING_QUICK_REFERENCE.md](HEADLESS_TESTING_QUICK_REFERENCE.md)** | Lookup guide, copy-paste commands | 10 min |
| **[HEADLESS_TESTING_GUIDE.md](HEADLESS_TESTING_GUIDE.md)** | Complete reference with examples | 20 min |
| **[HEADLESS_TESTING_DELIVERABLE.md](HEADLESS_TESTING_DELIVERABLE.md)** | What was created | 10 min |

---

## 🔍 File Structure

```
/tests/
├── headless-test-config.ts       ← Test data factories
├── headless-ws-client.ts         ← WebSocket testing client
├── headless-e2e.test.ts          ← Mocha test suite
├── headless-examples.ts          ← 6 runnable examples
├── headless-load-test.sh         ← Load testing script
├── setup-headless-tests.sh       ← Setup script
└── quick-ref.sh                  ← Quick reference

/
├── HEADLESS_TESTING_SETUP.md               ← Start here
├── HEADLESS_TESTING_QUICK_REFERENCE.md     ← Lookup guide
├── HEADLESS_TESTING_GUIDE.md               ← Full guide
├── HEADLESS_TESTING_DELIVERABLE.md         ← What was created
├── HEADLESS_TESTING_INDEX.md               ← This file
├── verify-headless-setup.sh                ← Verification script
└── .github/workflows/headless-tests.yml    ← GitHub Actions CI/CD
```

---

## 🎯 Common Tasks

### Task: Run All Tests Before Committing
```bash
npm test tests/headless-e2e.test.ts
```

### Task: Check Performance Before Deploying
```bash
bash tests/headless-load-test.sh 20 10 5 pre-deploy.json
# Check: success rate > 95%, avg latency < 2s
```

### Task: Test a Specific Scenario
See [tests/headless-examples.ts](tests/headless-examples.ts)
- Copy example 1 for single message
- Copy example 3 for multi-user
- Copy example 6 for performance testing

### Task: Generate Test Data
```typescript
import { TestDataFactory } from './tests/headless-test-config';

const fixture = TestDataFactory.generateTestFixture({
    numUsers: 10,
    emailsPerUser: 50,
});
```

### Task: Monitor Performance Over Time
```bash
bash tests/headless-load-test.sh 10 10 5 results-$(date +%Y%m%d).json
# Save to file with date, compare multiple runs
```

---

## ✅ Verification

### Check Everything Is Installed
```bash
bash verify-headless-setup.sh
```

Expected output:
```
✓ Test data factory configuration
✓ WebSocket testing client
✓ E2E test suite (Mocha)
✓ Example test scenarios
✓ Load testing script
✓ Setup script
✓ mocha test framework
✓ chai assertion library
✓ ws WebSocket library

✅ ALL CHECKS PASSED
```

---

## 🚨 Troubleshooting

### Error: "Connection refused"
**Cause**: Server not running
**Fix**: 
```bash
npm run dev
```

### Error: "Timeout"
**Cause**: Server taking too long
**Fix**: Check server logs, increase timeout to 120000

### Error: "Low success rate"
**Cause**: Database/Redis issues
**Fix**: 
```bash
# Check PostgreSQL
psql -d cortex_test -c "SELECT 1"

# Check Redis
redis-cli ping
```

---

## 📊 Expected Performance

### Latency
- Single message: 500-1000ms
- 10 concurrent: 1-2s average
- 100 concurrent: 2-5s average

### Success Rate
- E2E tests: ≥ 99% (must pass)
- Load tests: ≥ 95% (acceptable)

---

## 🔐 Security

### Test Database
Use separate test database (`cortex_test`) not production

### Test Credentials
Use test API keys (create new ones if needed)

### Test Data
Use test users, not production users

---

## 🚀 Next Steps

### Immediate (Now)
1. Read [HEADLESS_TESTING_SETUP.md](HEADLESS_TESTING_SETUP.md)
2. Run `bash tests/setup-headless-tests.sh`
3. Run `npm test tests/headless-e2e.test.ts`

### This Week
- Integrate into development workflow
- Run load tests to establish baseline
- Copy examples for your specific use cases

### This Month
- Set up GitHub Actions CI/CD
- Track performance trends
- Add to pre-commit hooks

---

## 📞 Quick Commands Reference

```bash
# Setup
bash tests/setup-headless-tests.sh

# Start server
npm run dev

# E2E tests
npm test tests/headless-e2e.test.ts

# Load test (10 users, 10 requests)
bash tests/headless-load-test.sh 10 10 5

# Examples
npx ts-node tests/headless-examples.ts

# Verification
bash verify-headless-setup.sh

# Quick reference
bash tests/quick-ref.sh

# View results
cat results.json | jq '.metrics'
```

---

## 💡 Pro Tips

✨ **Tip 1**: Start with examples, then customize
```bash
npx ts-node tests/headless-examples.ts
# Pick one example and modify it
```

✨ **Tip 2**: Save load test results over time
```bash
bash tests/headless-load-test.sh 10 10 5 results-$(date +%Y%m%d).json
# Compare multiple runs to spot trends
```

✨ **Tip 3**: Use verbose mode for debugging
```typescript
verbose: true  // Adds detailed logging
```

✨ **Tip 4**: Reuse connection for multiple messages
```typescript
await client.connect();
await client.sendUserMessage('First message');
await client.sendUserMessage('Second message');
await client.disconnect();
```

✨ **Tip 5**: Use same sessionId to maintain state
```typescript
sessionId: 'session-001'  // Keeps context across messages
```

---

## 📈 Success Metrics

### What Success Looks Like
- [ ] Setup script runs without errors
- [ ] E2E tests all pass (23/23)
- [ ] Load test success rate > 95%
- [ ] Average latency < 2 seconds
- [ ] Can modify examples for custom scenarios

### Performance Baseline
After running tests:
- **Record**: Average latency from load test
- **Track**: Over time to spot regressions
- **Alert**: If degradation > 20%

---

## 🎓 Learning Path

### Beginner (30 minutes)
1. Read [HEADLESS_TESTING_SETUP.md](HEADLESS_TESTING_SETUP.md)
2. Run setup script
3. Run E2E tests
4. View results

### Intermediate (1-2 hours)
1. Copy one example from [tests/headless-examples.ts](tests/headless-examples.ts)
2. Modify it for your use case
3. Run custom test
4. Check results

### Advanced (2-4 hours)
1. Read [HEADLESS_TESTING_GUIDE.md](HEADLESS_TESTING_GUIDE.md)
2. Understand WebSocket client architecture
3. Create reusable test suite
4. Integrate into CI/CD

---

## 🎯 Summary

**What you have:**
✅ 8 test files (3000+ lines)
✅ 4 documentation files
✅ GitHub Actions workflow
✅ 6 runnable examples
✅ Complete test infrastructure

**What you can do:**
✅ Automated E2E testing
✅ Load testing (concurrent users)
✅ Performance monitoring
✅ Custom test scenarios
✅ CI/CD integration

**How to start:**
```bash
bash tests/setup-headless-tests.sh
npm run dev
npm test tests/headless-e2e.test.ts
```

---

## 📖 Where to Go From Here

- **Quick Start**: [HEADLESS_TESTING_SETUP.md](HEADLESS_TESTING_SETUP.md)
- **Copy Commands**: [HEADLESS_TESTING_QUICK_REFERENCE.md](HEADLESS_TESTING_QUICK_REFERENCE.md)
- **Full Guide**: [HEADLESS_TESTING_GUIDE.md](HEADLESS_TESTING_GUIDE.md)
- **Code Examples**: [tests/headless-examples.ts](tests/headless-examples.ts)

---

**Created**: Complete automated testing framework
**Status**: ✅ Ready to use
**Last Updated**: Today

