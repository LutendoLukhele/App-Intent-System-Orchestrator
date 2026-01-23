# Cortex Webhook Architecture - Automated Testing Plan

## Prerequisites Setup

### 1. Configure Nango Webhook (REQUIRED)

In your Nango dashboard:

```yaml
# Set webhook URL for each integration
Webhook URL: https://your-server.com/api/webhooks/nango

# Or for local testing with ngrok:
Webhook URL: https://abc123.ngrok.io/api/webhooks/nango
```

### 2. Deploy Nango Syncs (REQUIRED)

Configure these syncs in Nango:

| Provider | Sync Name | Model | Frequency |
|----------|-----------|-------|-----------|
| google-mail | gmail-emails | GmailEmail | Every 5 min |
| google-calendar | calendar-events | CalendarEvent | Every 5 min |
| salesforce-2 | salesforce-leads | SalesforceLead | Every 10 min |
| salesforce-2 | salesforce-opportunities | SalesforceOpportunity | Every 10 min |

### 3. Environment Variables

```bash
# Required
NANGO_SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
GROQ_API_KEY=your-groq-key

# For local testing
PORT=8080
NODE_ENV=development
```

---

## Test Execution Plan

### Phase 1: Infrastructure Tests (Automated)

**Goal:** Verify all components are connected and working

```bash
# Run infrastructure test suite
npm run test:cortex:infra
```

**Tests:**
- ✅ Redis connection
- ✅ PostgreSQL connection
- ✅ Nango API connection
- ✅ Database tables exist (connections, units, runs, run_steps)
- ✅ Server starts without errors

---

### Phase 2: Cache Layer Tests (Automated)

**Goal:** Verify Nango cache reading works for all providers

```bash
# Run cache test suite
npm run test:cortex:cache
```

**Tests:**
- ✅ NangoService.fetchFromCache() - Gmail
- ✅ NangoService.fetchFromCache() - Calendar
- ✅ NangoService.fetchFromCache() - Salesforce Leads
- ✅ NangoService.fetchFromCache() - Salesforce Opportunities
- ✅ NangoService.triggerSync() - Manual sync trigger
- ✅ Cache returns data within 200ms (performance check)

---

### Phase 3: Tool Routing Tests (Automated)

**Goal:** Verify cache vs action routing works correctly

```bash
# Run tool routing test suite
npm run test:cortex:routing
```

**Tests:**
- ✅ fetch_emails routes to cache
- ✅ send_email routes to action
- ✅ fetch_calendar_events routes to cache
- ✅ create_calendar_event routes to action
- ✅ fetch_entity routes to cache
- ✅ create_entity routes to action
- ✅ Client-side email filtering works
- ✅ Client-side calendar filtering works
- ✅ Client-side CRM filtering works

---

### Phase 4: Webhook Handler Tests (Automated)

**Goal:** Verify EventShaper processes webhooks correctly

```bash
# Run webhook test suite
npm run test:cortex:webhooks
```

**Tests:**
- ✅ Webhook endpoint accepts POST /api/webhooks/nango
- ✅ Gmail webhook generates email_received event
- ✅ Gmail webhook generates email_reply_received event
- ✅ Calendar webhook generates event_created event
- ✅ Calendar webhook generates event_updated event
- ✅ Salesforce webhook generates lead_created event
- ✅ Salesforce webhook generates lead_stage_changed event
- ✅ Salesforce webhook generates opportunity_closed_won event
- ✅ Event deduplication works (same event twice → processes once)
- ✅ State tracking in Redis works (change detection)

---

### Phase 5: End-to-End Automation Tests (Semi-Automated)

**Goal:** Verify complete automation flow works

```bash
# Run E2E test suite
npm run test:cortex:e2e
```

**Tests:**
- ✅ Create automation via API
- ✅ Force sync to trigger webhook
- ✅ Webhook generates events
- ✅ Matcher finds matching automation
- ✅ Runtime executes automation
- ✅ Run recorded in database
- ✅ Run steps logged correctly
- ✅ Waiting runs resume correctly

---

### Phase 6: Performance Tests (Automated)

**Goal:** Verify performance improvements are realized

```bash
# Run performance test suite
npm run test:cortex:performance
```

**Tests:**
- ✅ Cache fetch < 200ms (vs 500-2000ms before)
- ✅ Event detection < 2s from webhook (vs 5-60s before)
- ✅ Client-side filtering < 50ms for 100 records
- ✅ Webhook processing < 500ms
- ✅ Automation execution starts within 1s of event

---

## Automated Test Scripts

I'll create these test files for you:

### 1. Infrastructure Tests
`tests/cortex/1-infrastructure.test.ts`

### 2. Cache Tests
`tests/cortex/2-cache.test.ts`

### 3. Routing Tests
`tests/cortex/3-routing.test.ts`

### 4. Webhook Tests
`tests/cortex/4-webhooks.test.ts`

### 5. E2E Tests
`tests/cortex/5-e2e.test.ts`

### 6. Performance Tests
`tests/cortex/6-performance.test.ts`

---

## Quick Test Commands

```bash
# Run all Cortex tests
npm run test:cortex

# Run individual test suites
npm run test:cortex:infra
npm run test:cortex:cache
npm run test:cortex:routing
npm run test:cortex:webhooks
npm run test:cortex:e2e
npm run test:cortex:performance

# Run with watch mode
npm run test:cortex:watch

# Run with coverage
npm run test:cortex:coverage
```

---

## Manual Testing Checklist

For tests that are hard to fully automate:

### Real Provider Integration

- [ ] **Gmail**: Send real email, verify webhook triggers within 5s
- [ ] **Calendar**: Create real event, verify webhook triggers within 5s
- [ ] **Salesforce**: Update real lead, verify webhook triggers within 10s
- [ ] **Multi-step automation**: Verify complex automations execute correctly

### Edge Cases

- [ ] **No cache data**: Verify graceful handling when cache is empty
- [ ] **Invalid webhook payload**: Verify error handling
- [ ] **Nango API down**: Verify fallback behavior
- [ ] **Redis connection lost**: Verify error logging
- [ ] **Database connection lost**: Verify error logging

### Production Readiness

- [ ] **Load test**: 100 concurrent webhook requests
- [ ] **Memory test**: 24-hour run with monitoring
- [ ] **Error recovery**: Kill server mid-execution, verify resume
- [ ] **Webhook signature verification**: Verify security (if Nango supports)

---

## Test Data Setup

### Create Test Connection

```bash
curl -X POST http://localhost:8080/api/connections \
  -H "x-user-id: test-user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google-mail",
    "connectionId": "test-connection-abc123"
  }'
```

### Create Test Automation

```bash
curl -X POST http://localhost:8080/api/cortex/units \
  -H "x-user-id: test-user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "when": "I receive an email from test@example.com",
    "then": "log it to console"
  }'
```

---

## Success Criteria

### Must Pass (Critical)
- ✅ All cache reads < 200ms
- ✅ All webhooks process within 1s
- ✅ Event deduplication works (no duplicate runs)
- ✅ No memory leaks over 24 hours
- ✅ Zero data loss (all events logged)

### Should Pass (Important)
- ✅ Client-side filtering accurate for all providers
- ✅ State tracking correct (detects changes)
- ✅ Error messages helpful and actionable
- ✅ Logs structured and searchable

### Nice to Have (Optional)
- ✅ Test coverage > 80%
- ✅ Performance 10x better than polling
- ✅ Webhook signature validation
- ✅ Rate limiting for webhook endpoint

---

## Continuous Integration Setup

```yaml
# .github/workflows/cortex-tests.yml
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
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
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
        run: npm ci

      - name: Run database migrations
        run: npm run migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

      - name: Run Cortex tests
        run: npm run test:cortex
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          NANGO_SECRET_KEY: ${{ secrets.NANGO_SECRET_KEY }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

```typescript
// Webhook processing time
cortex.webhook.processing_time_ms

// Cache hit rate
cortex.cache.hit_rate_percent

// Event generation rate
cortex.events.generated_per_minute

// Automation execution time
cortex.automation.execution_time_ms

// Error rate
cortex.errors.rate_per_minute
```

### Alert Thresholds

```yaml
alerts:
  - name: Webhook processing slow
    condition: cortex.webhook.processing_time_ms > 2000
    action: notify_team

  - name: Cache miss rate high
    condition: cortex.cache.hit_rate_percent < 90
    action: investigate_nango_syncs

  - name: Event generation stopped
    condition: cortex.events.generated_per_minute == 0 for 10 minutes
    action: check_webhook_configuration

  - name: High error rate
    condition: cortex.errors.rate_per_minute > 10
    action: page_oncall
```

---

## Rollback Plan

If tests fail or issues found in production:

### Step 1: Disable Webhook Processing
```typescript
// In index.ts, comment out webhook endpoint temporarily
// app.post('/api/webhooks/nango', async (req, res) => {
//   // Temporarily disabled
//   res.json({ received: true, processing: false });
// });
```

### Step 2: Revert to Polling (Emergency Only)
```bash
# 1. Restore poller.ts from git history
git checkout HEAD~1 src/cortex/poller.ts

# 2. Restore poller initialization in index.ts
git checkout HEAD~1 src/index.ts

# 3. Rebuild and restart
npm run build
npm restart
```

### Step 3: Investigation
- Check Nango sync status
- Check webhook logs
- Check Redis state
- Check database for errors

---

## Next Steps After Testing

1. **Deploy to staging** - Run all tests in staging environment
2. **Monitor for 24 hours** - Watch metrics and logs
3. **Gradual rollout** - Enable for 10% of users first
4. **Full deployment** - Enable for all users
5. **Continuous monitoring** - Set up alerts and dashboards
