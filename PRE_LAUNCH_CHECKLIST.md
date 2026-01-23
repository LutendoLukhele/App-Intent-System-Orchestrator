# Pre-Launch Backend Robustness Checklist

**Status:** In Progress
**Target:** Production-Ready Backend
**Date:** 2026-01-09

---

## 1. Sync Implementations (Provider Cache)

### ✅ Gmail - COMPLETE
- **Status:** ✅ Thread-based sync implemented
- **Model:** GmailThread
- **Features:**
  - ✅ Incremental sync via History API
  - ✅ Semantic classification (security, billing, calendar, support, promotion)
  - ✅ Parallel fetching with concurrency control
  - ✅ Body parsing and cleaning
- **Backfill:** 50 most recent threads
- **Performance:** 10-15s initial, 2-5s incremental

### ❌ Google Calendar - MISSING
**Priority:** HIGH (needed for cache-based fetch_calendar_events)

**Required:**
```typescript
// nango-integrations/google-calendar/syncs/calendar-events.ts

export default async function fetchData(nango: any): Promise<void> {
  const lastSyncToken = nango.lastSyncMetadata?.syncToken;

  if (!lastSyncToken) {
    await initialBackfill(nango);
    return;
  }

  // Incremental sync with sync token
  await incrementalSync(nango, lastSyncToken);
}

async function initialBackfill(nango: any) {
  // Fetch upcoming events (next 30 days)
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const events = await nango.proxy({
    method: 'GET',
    endpoint: '/calendar/v3/calendars/primary/events',
    params: {
      timeMin,
      timeMax,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime'
    }
  });

  const normalized = events.data.items.map(normalizeEvent);
  await nango.batchSave(normalized, 'CalendarEvent');
  await nango.setLastSyncMetadata({ syncToken: events.data.nextSyncToken });
}
```

**Model:** CalendarEvent
```typescript
{
  id: string,
  summary: string,
  description?: string,
  location?: string,
  start: { dateTime: string, timeZone: string },
  end: { dateTime: string, timeZone: string },
  attendees?: Array<{ email: string, responseStatus: string }>,
  creator: { email: string },
  organizer: { email: string },
  status: 'confirmed' | 'tentative' | 'cancelled',
  recurringEventId?: string,
  htmlLink: string
}
```

**Estimated effort:** 4-6 hours

---

### ❌ Salesforce - MISSING
**Priority:** MEDIUM (needed for cache-based fetch_entity)

**Required:**
```typescript
// nango-integrations/salesforce/syncs/salesforce-leads.ts
// nango-integrations/salesforce/syncs/salesforce-contacts.ts
// nango-integrations/salesforce/syncs/salesforce-accounts.ts
// nango-integrations/salesforce/syncs/salesforce-opportunities.ts

export default async function fetchData(nango: any): Promise<void> {
  const lastModifiedDate = nango.lastSyncMetadata?.lastModifiedDate;

  const query = lastModifiedDate
    ? `SELECT Id, Name, Email, Phone, Company, Status, CreatedDate, LastModifiedDate
       FROM Lead
       WHERE LastModifiedDate > ${lastModifiedDate}
       ORDER BY LastModifiedDate ASC`
    : `SELECT Id, Name, Email, Phone, Company, Status, CreatedDate, LastModifiedDate
       FROM Lead
       ORDER BY LastModifiedDate DESC
       LIMIT 500`;

  const result = await nango.proxy({
    method: 'GET',
    endpoint: '/services/data/v58.0/query',
    params: { q: query }
  });

  await nango.batchSave(result.data.records, 'SalesforceLead');

  const latest = result.data.records[result.data.records.length - 1];
  await nango.setLastSyncMetadata({
    lastModifiedDate: latest.LastModifiedDate
  });
}
```

**Models:** SalesforceLead, SalesforceContact, SalesforceAccount, SalesforceOpportunity

**Estimated effort:** 8-12 hours (4 object types)

---

### ⚠️ Notion - OPTIONAL
**Priority:** LOW (nice-to-have)

**Status:** Can skip for MVP, use action-based tools only

---

### ⚠️ Outlook - OPTIONAL
**Priority:** LOW (nice-to-have)

**Status:** Can skip for MVP, use action-based tools only

---

## 2. Action Methods Testing (Create/Update/Delete)

### ✅ Gmail Actions
**Tools:** send_email

**Test checklist:**
- [ ] Send email with plain text
- [ ] Send email with HTML body
- [ ] Send with attachments
- [ ] Send to multiple recipients
- [ ] Error handling (invalid email, quota exceeded)
- [ ] Rate limiting test (50 emails/min)

**Test script:**
```bash
curl -X POST http://localhost:8787/api/chat \
  -d '{
    "message": "Send an email to test@example.com with subject Test and body Hello",
    "userId": "test-user"
  }'
```

---

### ❌ Google Calendar Actions - NEEDS TESTING
**Tools:** create_calendar_event, update_calendar_event

**Test checklist:**
- [ ] Create simple event (title, start, end)
- [ ] Create all-day event
- [ ] Create with attendees
- [ ] Create recurring event
- [ ] Update event time
- [ ] Update event attendees
- [ ] Cancel event
- [ ] Error handling (invalid dates, calendar not found)

**Test script:**
```bash
curl -X POST http://localhost:8787/api/chat \
  -d '{
    "message": "Create a meeting tomorrow at 2pm for 1 hour titled Team Sync",
    "userId": "test-user"
  }'
```

---

### ❌ Salesforce Actions - NEEDS TESTING
**Tools:** create_entity, update_entity

**Test checklist:**
- [ ] Create Lead with required fields
- [ ] Create Contact with Account link
- [ ] Create Account
- [ ] Create Opportunity
- [ ] Update Lead status
- [ ] Batch create (multiple leads)
- [ ] Error handling (duplicate email, missing required fields)
- [ ] Field validation

**Test script:**
```bash
curl -X POST http://localhost:8787/api/chat \
  -d '{
    "message": "Create a new lead named John Doe at Acme Corp with email john@acme.com",
    "userId": "test-user"
  }'
```

---

## 3. Error Handling & Resilience

### ✅ Webhook Error Handling
**Status:** Implemented in EventShaper

**Checklist:**
- [x] Malformed payload handling
- [x] Unknown provider handling
- [x] Invalid connection ID
- [x] Async error catching
- [ ] **MISSING:** Retry mechanism for failed events
- [ ] **MISSING:** Dead letter queue for permanent failures

**Recommendation:**
```typescript
// Add to EventShaper.ts
private async retryFailedEvent(event: any, attempt: number = 1): Promise<void> {
  if (attempt > 3) {
    await this.saveToDeadLetterQueue(event);
    return;
  }

  try {
    await this.processEvent(event);
  } catch (error) {
    await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
    await this.retryFailedEvent(event, attempt + 1);
  }
}
```

---

### ⚠️ API Rate Limiting
**Status:** Partial (handled by Nango, not enforced locally)

**Checklist:**
- [ ] **MISSING:** Rate limit tracking per user
- [ ] **MISSING:** Rate limit headers in responses
- [ ] **MISSING:** Queuing for rate-limited requests
- [ ] **MISSING:** User notification on quota exceeded

**Recommendation:**
```typescript
// Add to ToolOrchestrator.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

private rateLimiter = new RateLimiterMemory({
  points: 100,          // 100 requests
  duration: 60,         // per 60 seconds
  blockDuration: 60,    // Block for 60 seconds if exceeded
});

async executeTool(toolCall: ToolCall): Promise<any> {
  try {
    await this.rateLimiter.consume(toolCall.userId);
    // ... existing code
  } catch (rejRes) {
    throw new Error(`Rate limit exceeded. Try again in ${rejRes.msBeforeNext}ms`);
  }
}
```

---

### ⚠️ Database Connection Pooling
**Status:** Using @vercel/postgres (built-in pooling)

**Checklist:**
- [x] Connection pooling enabled
- [ ] **MISSING:** Pool size configuration
- [ ] **MISSING:** Connection timeout handling
- [ ] **MISSING:** Pool exhaustion monitoring

**Recommendation:**
```typescript
// Update database config
import { createPool } from '@vercel/postgres';

export const pool = createPool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Wait 2s for connection
});
```

---

### ❌ Cache Timeout Handling - MISSING
**Status:** No timeout protection on Nango cache calls

**Risk:** If Nango API is slow (>10s), requests hang

**Recommendation:**
```typescript
// Add to NangoService.ts
public async fetchFromCache(
  provider: string,
  connectionId: string,
  model: string,
  options?: any
): Promise<{ records: any[]; nextCursor?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await axios.get(
      'https://api.nango.dev/records',
      {
        headers: { ... },
        params: { ... },
        signal: controller.signal  // ← Add timeout
      }
    );
    return response.data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Cache fetch timeout (>5s)');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## 4. Security Hardening

### ✅ Firebase Authentication
**Status:** Implemented

**Checklist:**
- [x] Token verification
- [x] User ID extraction
- [ ] **MISSING:** Token expiration checking
- [ ] **MISSING:** Revoked token handling

---

### ⚠️ API Key Security
**Status:** Environment variables used

**Checklist:**
- [x] API keys in .env (not committed)
- [ ] **MISSING:** API key rotation mechanism
- [ ] **MISSING:** Separate keys for dev/staging/prod
- [ ] **MISSING:** Key encryption at rest

**Recommendation:**
```bash
# Use different keys per environment
NANGO_SECRET_KEY_DEV=sk_dev_...
NANGO_SECRET_KEY_STAGING=sk_staging_...
NANGO_SECRET_KEY_PROD=sk_prod_...

GROQ_API_KEY_DEV=gsk_dev_...
GROQ_API_KEY_STAGING=gsk_staging_...
GROQ_API_KEY_PROD=gsk_prod_...
```

---

### ❌ Input Validation - MINIMAL
**Status:** Basic validation in tool configs, no runtime validation

**Checklist:**
- [ ] **MISSING:** Request body size limits
- [ ] **MISSING:** SQL injection protection (parameterized queries only)
- [ ] **MISSING:** XSS protection in responses
- [ ] **MISSING:** Email validation
- [ ] **MISSING:** Phone number validation

**Recommendation:**
```typescript
// Add validation middleware
import { z } from 'zod';

const EmailFilterSchema = z.object({
  sender: z.string().email().optional(),
  subject: z.object({
    contains: z.array(z.string().max(100)).optional(),
  }).optional(),
  limit: z.number().min(1).max(100).optional(),
});

// Use in endpoints
app.post('/api/chat', async (req, res) => {
  try {
    const validated = EmailFilterSchema.parse(req.body.filters);
    // ... proceed
  } catch (error) {
    return res.status(400).json({ error: 'Invalid input' });
  }
});
```

---

## 5. Monitoring & Observability

### ⚠️ Logging
**Status:** Winston logger implemented, but needs structure

**Checklist:**
- [x] Structured logging (winston)
- [ ] **MISSING:** Log levels per environment (debug in dev, error in prod)
- [ ] **MISSING:** Request ID tracking
- [ ] **MISSING:** Performance logging (request duration)
- [ ] **MISSING:** Log aggregation (e.g., Datadog, LogRocket)

**Recommendation:**
```typescript
// Add request ID middleware
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  req.id = uuidv4();
  logger.info('Request received', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    userId: req.userId,
  });
  next();
});
```

---

### ❌ Metrics & Alerting - MISSING
**Status:** No metrics collection

**Checklist:**
- [ ] **MISSING:** Request count per endpoint
- [ ] **MISSING:** Average response time
- [ ] **MISSING:** Error rate tracking
- [ ] **MISSING:** Cache hit/miss ratio
- [ ] **MISSING:** Tool execution success rate
- [ ] **MISSING:** Webhook processing time
- [ ] **MISSING:** Alerts on high error rates

**Recommendation:**
```typescript
// Use Prometheus or similar
import promClient from 'prom-client';

const requestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const requestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Request duration in ms',
  labelNames: ['method', 'route'],
});

// Track in middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    requestCounter.inc({ method: req.method, route: req.route?.path, status: res.statusCode });
    requestDuration.observe({ method: req.method, route: req.route?.path }, Date.now() - start);
  });
  next();
});
```

---

### ❌ Health Check Endpoint - BASIC
**Status:** Exists but doesn't check dependencies

**Current:**
```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

**Improved:**
```typescript
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    nango: await checkNango(),
    groq: await checkGroq(),
    redis: await checkRedis(),
  };

  const allHealthy = Object.values(checks).every(c => c.healthy);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});
```

---

## 6. Database Robustness

### ✅ Schema Validation
**Status:** TypeScript interfaces defined

**Checklist:**
- [x] Type-safe queries
- [ ] **MISSING:** Database migrations
- [ ] **MISSING:** Rollback mechanism
- [ ] **MISSING:** Schema versioning

**Recommendation:**
```bash
# Use a migration tool
npm install kysely kysely-codegen

# Create migrations/
migrations/
  001_initial_schema.sql
  002_add_semantic_type.sql
  003_add_user_preferences.sql

# Apply with version tracking
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);
```

---

### ⚠️ Data Retention
**Status:** No cleanup policy

**Checklist:**
- [ ] **MISSING:** Old session cleanup (>30 days)
- [ ] **MISSING:** Completed automation run cleanup
- [ ] **MISSING:** Error log retention policy

**Recommendation:**
```typescript
// Add cron job for cleanup
import cron from 'node-cron';

// Run daily at 2am
cron.schedule('0 2 * * *', async () => {
  await cleanupOldSessions();
  await cleanupOldRuns();
  await cleanupOldLogs();
});

async function cleanupOldSessions() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await sql`DELETE FROM conversation_sessions WHERE created_at < ${thirtyDaysAgo}`;
}
```

---

## 7. Testing Coverage

### ✅ Unit Tests
**Status:** 69/69 passing

**Checklist:**
- [x] Core routing tests
- [x] Cache layer tests
- [x] Infrastructure tests
- [ ] **MISSING:** Action tool tests (create/update)
- [ ] **MISSING:** Error handling tests
- [ ] **MISSING:** Rate limiting tests

---

### ❌ Integration Tests - PARTIAL
**Status:** E2E tests require running server

**Checklist:**
- [ ] **MISSING:** Webhook → Automation → Tool execution flow
- [ ] **MISSING:** Multi-user concurrent requests
- [ ] **MISSING:** Cache invalidation scenarios
- [ ] **MISSING:** Failed tool retry logic

---

### ❌ Load Testing - MISSING
**Status:** No load tests performed

**Recommendation:**
```bash
# Use k6 or Artillery
npm install -g artillery

# Create load-test.yml
config:
  target: "http://localhost:8787"
  phases:
    - duration: 60
      arrivalRate: 10  # 10 requests/sec
scenarios:
  - flow:
      - post:
          url: "/api/chat"
          json:
            message: "Show me my emails"
            userId: "load-test-user"

# Run
artillery run load-test.yml
```

**Target:** Handle 100 concurrent requests without degradation

---

## 8. Deployment Checklist

### ⚠️ Environment Configuration
**Status:** Manual .env file

**Checklist:**
- [x] .env.example provided
- [ ] **MISSING:** Environment-specific configs (dev/staging/prod)
- [ ] **MISSING:** Config validation on startup
- [ ] **MISSING:** Secret management (e.g., AWS Secrets Manager)

---

### ❌ CI/CD Pipeline - MISSING
**Status:** No automated deployment

**Recommendation:**
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run build
      - uses: vercel/deploy@v1  # or AWS, Railway, etc.
```

---

### ⚠️ Graceful Shutdown
**Status:** Basic process.on('SIGTERM')

**Checklist:**
- [x] SIGTERM handler
- [ ] **MISSING:** Drain in-flight requests
- [ ] **MISSING:** Close database connections
- [ ] **MISSING:** Flush logs

**Recommendation:**
```typescript
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Received SIGTERM, starting graceful shutdown');

  // Stop accepting new requests
  server.close(async () => {
    // Wait for in-flight requests (max 30s)
    await Promise.race([
      waitForInFlightRequests(),
      sleep(30000)
    ]);

    // Close connections
    await pool.end();
    await redisClient.quit();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
});
```

---

## Summary: Priority Matrix

### 🔴 CRITICAL (Must-Have Before Launch)

1. **Google Calendar Sync** - 4-6 hours
2. **Action Methods Testing** - 6-8 hours
   - Gmail send_email ✅
   - Calendar create/update ❌
   - Salesforce create/update ❌
3. **Cache Timeout Handling** - 2 hours
4. **Input Validation** - 4 hours
5. **Health Check Improvements** - 2 hours
6. **Error Retry Mechanism** - 3 hours

**Total:** ~21-27 hours (3-4 days)

---

### 🟡 HIGH (Should-Have)

1. **Salesforce Sync** - 8-12 hours
2. **Rate Limiting** - 4 hours
3. **Monitoring/Metrics** - 6 hours
4. **Database Migrations** - 4 hours
5. **Integration Tests** - 8 hours

**Total:** ~30-38 hours (5-7 days)

---

### 🟢 MEDIUM (Nice-to-Have)

1. **CI/CD Pipeline** - 4 hours
2. **Load Testing** - 4 hours
3. **Data Retention Cleanup** - 3 hours
4. **Log Aggregation** - 4 hours

**Total:** ~15 hours (2-3 days)

---

### ⚪ LOW (Post-Launch)

1. **Notion Sync** - 6 hours
2. **Outlook Sync** - 6 hours
3. **API Key Rotation** - 3 hours
4. **Advanced Alerting** - 6 hours

**Total:** ~21 hours (3-4 days)

---

## Recommended Launch Sequence

### Phase 1: Critical Fixes (Week 1)
- Day 1-2: Google Calendar sync + testing
- Day 3: Action methods testing (all providers)
- Day 4: Error handling (timeout, retry, validation)
- Day 5: Health checks + monitoring basics

**Deliverable:** Backend handles Gmail + Calendar robustly

---

### Phase 2: Salesforce + Hardening (Week 2)
- Day 1-3: Salesforce sync (4 object types)
- Day 4: Rate limiting + security hardening
- Day 5: Integration tests

**Deliverable:** Full CRM integration ready

---

### Phase 3: Production Prep (Week 3)
- Day 1-2: CI/CD pipeline
- Day 3: Load testing + performance tuning
- Day 4-5: Documentation + deployment

**Deliverable:** Production-ready deployment

---

## Current Status

✅ **Complete:**
- Gmail thread-based sync with semantic classification
- Cache-based tool routing
- Basic error handling
- 69/69 unit tests passing

❌ **Blocking Launch:**
- Google Calendar sync (HIGH)
- Action methods testing (HIGH)
- Cache timeout handling (CRITICAL)
- Input validation (CRITICAL)

⚠️ **Can Ship Without (but should add soon):**
- Salesforce sync (can use actions only)
- Rate limiting (low traffic MVP)
- Monitoring (can add post-launch)

---

**Estimated Time to Production-Ready:** 3-4 weeks
**Minimum Viable Launch:** 1 week (critical items only)

