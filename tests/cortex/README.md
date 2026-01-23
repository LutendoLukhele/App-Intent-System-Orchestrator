# Cortex Automated Tests

Comprehensive test suite for the Cortex webhook + cache architecture.

## Quick Start

```bash
# Install dependencies (includes jest, ts-jest)
npm install

# Run all Cortex tests
npm run test:cortex

# Run specific test suite
npm run test:cortex:infra      # Infrastructure tests
npm run test:cortex:cache       # Cache layer tests
npm run test:cortex:routing     # Tool routing tests
npm run test:cortex:webhooks    # Webhook handler tests
npm run test:cortex:e2e         # End-to-end tests
npm run test:cortex:performance # Performance benchmarks
```

## Prerequisites

### 1. Configure Environment Variables

Create or update `.env` file:

```bash
# Required
NANGO_SECRET_KEY=your-nango-secret-key
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=your-groq-api-key

# Optional (for testing)
TEST_CONNECTION_ID=8716bc9a-694a-4891-98dc-61fcadd7cde4
PORT=8080
```

### 2. Start Required Services

```bash
# Start PostgreSQL (if local)
# brew services start postgresql@15

# Start Redis (if local)
# brew services start redis

# Or use Docker
docker-compose up -d postgres redis
```

### 3. Run Database Migrations

```bash
# Run Cortex migration
npx ts-node scripts/run-migration.ts

# Verify tables created
psql $DATABASE_URL -c "\dt"
# Should see: connections, units, runs, run_steps
```

### 4. Start Server (for integration tests)

```bash
# In one terminal
npm run dev

# Or in background
npm run dev > server.log 2>&1 &
```

### 5. Configure Nango Webhook (IMPORTANT)

In your Nango dashboard, set webhook URL:
```
http://localhost:8080/api/webhooks/nango

# Or for remote testing with ngrok:
https://your-subdomain.ngrok.io/api/webhooks/nango
```

## Test Suites

### 1. Infrastructure Tests (1-infrastructure.test.ts)

**What it tests:**
- Redis connection
- PostgreSQL connection
- Nango API connectivity
- Database tables exist
- Server health endpoint
- Environment variables configured

**Run:**
```bash
npm run test:cortex:infra
```

**Expected output:**
```
✓ Redis connection works (50ms)
✓ PostgreSQL connection works (100ms)
✓ Nango API connection works (200ms)
✓ Database table: connections exists (50ms)
✓ Database table: units exists (50ms)
✓ Database table: runs exists (50ms)
✓ Database table: run_steps exists (50ms)
✓ Server health endpoint responds (100ms)
✓ Groq API key is configured (5ms)
✓ Nango secret key is configured (5ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Time:        2.5s
```

### 2. Cache Tests (2-cache.test.ts)

**What it tests:**
- NangoService.fetchFromCache() for all providers
- Limit and filter parameters
- Performance (< 200ms)
- Manual sync triggering
- Error handling

**Run:**
```bash
npm run test:cortex:cache
```

**Note:** Requires Nango syncs to be running and cache populated.

### 3. Routing Tests (3-routing.test.ts)

**What it tests:**
- Cache-based tools route correctly
- Action-based tools route correctly
- Client-side filtering works
- Performance improvements realized

**Run:**
```bash
npm run test:cortex:routing
```

### 4. Webhook Tests (4-webhooks.test.ts)

**What it tests:**
- Webhook endpoint accepts POST /api/webhooks/nango
- EventShaper generates correct event types
- Gmail events: email_received, email_reply_received
- Calendar events: event_created, event_updated
- Salesforce events: lead_created, lead_stage_changed, etc.
- Event deduplication
- State tracking in Redis

**Run:**
```bash
npm run test:cortex:webhooks
```

**Example output:**
```
✓ POST /api/webhooks/nango accepts webhook (150ms)
✓ Gmail webhook generates email_received event (100ms)
✓ Calendar webhook generates event_created event (120ms)
✓ Salesforce webhook generates lead_created event (110ms)
✓ Duplicate events are deduplicated (200ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Time:        3.2s
```

### 5. E2E Tests (5-e2e.test.ts)

**What it tests:**
- Complete automation flow: create → webhook → match → execute
- Automation status management (pause/resume)
- Force sync triggers webhook
- Execution history recording
- Multi-step automations
- Error recovery

**Run:**
```bash
npm run test:cortex:e2e
```

**This is the most important test suite** - it verifies the entire system works together.

### 6. Performance Tests (6-performance.test.ts)

**What it tests:**
- Cache reads < 200ms (vs 500-2000ms before)
- Webhook processing < 500ms
- Batch processing performance
- Client-side filtering < 50ms
- Memory leak detection
- Performance consistency (low variance)

**Run:**
```bash
npm run test:cortex:performance
```

**Example output:**
```
✓ Gmail cache fetch completes in < 200ms
  Average Gmail cache fetch time: 85ms
✓ Calendar cache fetch completes in < 200ms
  Average Calendar cache fetch time: 72ms
✓ Webhook processing completes in < 500ms
  Webhook processing time: 245ms
✓ Cache reads are 10x faster than old polling
  New system avg: 90ms (Old system: ~1000ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Time:        45s
```

## Running Tests

### Run All Tests
```bash
npm run test:cortex
```

### Run with Watch Mode
```bash
npm run test:cortex:watch
```

### Run with Coverage
```bash
npm run test:coverage
```

Coverage report will be in `coverage/lcov-report/index.html`

### Run Individual Test
```bash
npx jest tests/cortex/1-infrastructure.test.ts
```

## Debugging Failed Tests

### Infrastructure Test Failures

**Redis connection fails:**
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Check Redis URL
echo $REDIS_URL
```

**PostgreSQL connection fails:**
```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Check if tables exist
psql $DATABASE_URL -c "\dt"
```

### Cache Test Failures

**fetchFromCache() returns empty:**
- Wait for Nango syncs to complete (5-10 minutes after connection)
- Verify syncs are configured in Nango dashboard
- Check sync status: `GET /sync/status` in Nango API

**Performance tests fail:**
- Cold start: First request may be slower
- Network latency: Check connection to Nango API
- Cache size: Larger caches may be slower

### Webhook Test Failures

**Webhook endpoint not responding:**
```bash
# Check if server is running
curl http://localhost:8080/health

# Test webhook endpoint
curl -X POST http://localhost:8080/api/webhooks/nango \
  -H "Content-Type: application/json" \
  -d '{"type":"sync"}'
```

**Events not generating:**
- Check Redis state: `redis-cli KEYS shaper:*`
- Check logs: `tail -f server.log | grep EventShaper`
- Verify connectionId → userId mapping in database

### E2E Test Failures

**Automations not executing:**
- Check unit status: `GET /api/cortex/units`
- Check matcher logs
- Verify GROQ_API_KEY is valid

**Runs not recorded:**
- Check database: `SELECT * FROM runs ORDER BY created_at DESC LIMIT 5`
- Check run_steps table for error details

## Test Data Cleanup

Tests create temporary data. To clean up:

```bash
# Delete test connections
psql $DATABASE_URL -c "DELETE FROM connections WHERE user_id LIKE 'test-user-%'"

# Delete test units
psql $DATABASE_URL -c "DELETE FROM units WHERE owner LIKE 'test-user-%'"

# Delete test runs
psql $DATABASE_URL -c "DELETE FROM runs WHERE owner LIKE 'test-user-%'"

# Clear test Redis keys
redis-cli KEYS "shaper:*test-user*" | xargs redis-cli DEL
```

## CI/CD Integration

Tests can run in GitHub Actions, GitLab CI, etc.

Example GitHub Actions workflow:

```yaml
name: Cortex Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run build
      - run: npm run test:cortex
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          NANGO_SECRET_KEY: ${{ secrets.NANGO_SECRET_KEY }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
```

## Success Criteria

For tests to pass in production:

- ✅ All infrastructure tests pass
- ✅ Cache reads < 200ms average
- ✅ Webhook processing < 500ms
- ✅ Event deduplication works
- ✅ E2E automation flow completes
- ✅ No memory leaks over 100 webhook batches
- ✅ Test coverage > 70%

## Troubleshooting

### Tests hang indefinitely

**Cause:** Server not running or webhook endpoint blocked

**Fix:**
```bash
# Check if server is accessible
curl http://localhost:8080/health

# Check if port is in use
lsof -i :8080
```

### "Connection refused" errors

**Cause:** Redis or PostgreSQL not running

**Fix:**
```bash
# Start services
brew services start redis
brew services start postgresql@15

# Or use Docker
docker-compose up -d
```

### TypeScript compilation errors

**Fix:**
```bash
npm run build
```

If build fails, fix TypeScript errors before running tests.

## Next Steps After Tests Pass

1. ✅ All tests passing locally
2. Deploy to staging environment
3. Run tests in staging
4. Monitor for 24 hours
5. Gradual production rollout (10% → 50% → 100%)
6. Set up continuous monitoring and alerts
