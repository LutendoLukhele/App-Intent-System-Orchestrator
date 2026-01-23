# Cortex Webhook & Automation - Production Deployment Checklist

**Goal:** Productionize webhook flow and automation management
**Status:** Backend ready (69/69 tests passing)

---

## ✅ Pre-Deployment (Backend)

### Database Setup
- [ ] PostgreSQL database provisioned (Neon/Supabase/RDS)
- [ ] Run migration: `psql $DATABASE_URL -f migrations/001_cortex.sql`
- [ ] Verify tables exist: `connections`, `units`, `runs`, `run_steps`, `events`
- [ ] Test database connection: `npm run test:cortex:infra`

### Redis Setup
- [ ] Redis instance provisioned (Upstash/Redis Cloud)
- [ ] Test Redis connection: `npm run test:cortex:infra`
- [ ] Verify cache working: `npm run test:cortex:cache`

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://default:pass@host:port

# Auth
FIREBASE_PROJECT_ID=assistant-b00f5

# APIs
NANGO_SECRET_KEY=***
GROQ_API_KEY=***

# Server
PORT=8080
NODE_ENV=production
```

- [ ] All env vars configured
- [ ] Secrets stored securely (not committed to git)
- [ ] CORS configured for frontend domain

---

## 🚀 Deployment

### Backend Server
- [ ] Deploy to hosting platform (Railway/Render/Fly.io)
- [ ] Health check endpoint working: `curl https://your-api.com/health`
- [ ] Logs accessible (Winston → stdout)
- [ ] SSL/TLS enabled
- [ ] Domain/subdomain configured

### Webhook Endpoint
- [ ] Webhook endpoint accessible: `POST https://your-api.com/api/webhooks/nango`
- [ ] Returns 202 Accepted in <200ms
- [ ] Test with curl:
  ```bash
  curl -X POST https://your-api.com/api/webhooks/nango \
    -H "Content-Type: application/json" \
    -d '{"type":"sync","connectionId":"test"}'
  ```
- [ ] Expected response:
  ```json
  {"status":"accepted","message":"Webhook received and queued for processing"}
  ```

### Nango Configuration
- [ ] Webhook URL registered in Nango dashboard
- [ ] Provider config keys match:
  - Gmail: `google-mail-ynxw`
  - Calendar: `google-calendar`
  - Salesforce: `salesforce-2`
- [ ] Test sync triggers webhook correctly

---

## 🔗 Frontend Integration

### API Client Setup
- [ ] Base URL configured: `CORTEX_API_URL=https://your-api.com`
- [ ] Firebase auth integrated
- [ ] Headers include: `Authorization: Bearer <token>`
- [ ] Test authenticated request to `/api/cortex/units`

### Automation Management
- [ ] **Create automation** working
  - [ ] Form with name + prompt inputs
  - [ ] POST `/api/cortex/units`
  - [ ] Success → shows in list
  - [ ] Error → displays message to user
- [ ] **List automations** working
  - [ ] GET `/api/cortex/units`
  - [ ] Displays automation cards
  - [ ] Shows status badges (active/paused/disabled)
- [ ] **Pause/Resume** working
  - [ ] PATCH `/api/cortex/units/:id/status`
  - [ ] Updates UI immediately
- [ ] **Delete** working
  - [ ] Confirmation dialog
  - [ ] DELETE `/api/cortex/units/:id`
  - [ ] Removes from UI

### Webhook Flow Integration
- [ ] **202 Handling** implemented
  - [ ] Webhook returns instantly
  - [ ] Shows "Received!" message
  - [ ] Doesn't block UI
- [ ] **Polling** implemented
  - [ ] GET `/api/cortex/runs?limit=10` every 3 seconds
  - [ ] Finds latest run for automation
  - [ ] Shows "Processing..." indicator
  - [ ] Updates when run completes
- [ ] **Run details** working
  - [ ] Click run → GET `/api/cortex/runs/:id/steps`
  - [ ] Shows execution timeline
  - [ ] Displays tool inputs/outputs

### Connection Management
- [ ] Nango SDK integrated (`@nangohq/frontend`)
- [ ] OAuth flow working for:
  - [ ] Gmail
  - [ ] Google Calendar
  - [ ] Salesforce
- [ ] POST `/api/cortex/connections` after OAuth
- [ ] GET `/api/cortex/connections` shows connected services
- [ ] Disconnect working (DELETE)

---

## 🧪 E2E Testing (Production)

### Test Flow 1: Create & Execute Automation
1. [ ] Create automation: "when: email from test@test.com then: do nothing"
2. [ ] Verify created in list (status: active)
3. [ ] Send test email from test@test.com
4. [ ] Nango webhook triggers Cortex
5. [ ] Verify webhook returns 202 in <200ms
6. [ ] Poll `/api/cortex/runs`
7. [ ] Verify run created with status: completed

### Test Flow 2: Pause & Resume
1. [ ] Create automation
2. [ ] Pause automation (status → paused)
3. [ ] Trigger webhook → verify NO run created
4. [ ] Resume automation (status → active)
5. [ ] Trigger webhook → verify run created

### Test Flow 3: Error Handling
1. [ ] Try creating invalid prompt: "when: something"
2. [ ] Verify error shown: "Invalid compilation..."
3. [ ] Try without connection
4. [ ] Verify error: "No connection found for provider..."
5. [ ] Try with expired token
6. [ ] Verify redirect to login (401)

---

## 📊 Performance Verification

### Webhook Performance
- [ ] Webhook response time: **<200ms** ✅
  ```bash
  time curl -X POST https://your-api.com/api/webhooks/nango \
    -H "Content-Type: application/json" \
    -d '{"type":"sync","connectionId":"test"}'
  ```
- [ ] Expected: `real 0m0.150s` or less

### Automation Execution
- [ ] First execution: 1-3s (Groq compilation + matching)
- [ ] Subsequent: 500ms-2s (Groq caching helps)
- [ ] Check logs for "Webhook processed (async)" within 5s

### API Response Times
- [ ] GET `/api/cortex/units`: <500ms
- [ ] POST `/api/cortex/units`: <3s (includes Groq compilation)
- [ ] PATCH `/api/cortex/units/:id/status`: <200ms
- [ ] GET `/api/cortex/runs`: <500ms

---

## 🔍 Monitoring & Alerts

### Logging
- [ ] Backend logs accessible
- [ ] Log levels configured (info/warn/error)
- [ ] Key events logged:
  - Webhook received
  - Automation matched
  - Automation executed
  - Errors during execution

### Metrics to Monitor
- [ ] Webhook response time (<200ms)
- [ ] Automation execution time (2-5s)
- [ ] Error rate (<5%)
- [ ] Database connection pool usage
- [ ] Redis connection health

### Alerts to Set Up
- [ ] Webhook response time >500ms
- [ ] Automation failure rate >10%
- [ ] Database connection errors
- [ ] Redis connection errors
- [ ] Groq API rate limit hit

---

## 🚨 Rollback Plan

If issues occur in production:

1. **Check health endpoint:**
   ```bash
   curl https://your-api.com/health
   ```

2. **Check recent logs:**
   - Look for errors in backend logs
   - Check webhook processing errors
   - Verify database/Redis connectivity

3. **Disable automations if needed:**
   ```bash
   # Via API
   curl -X PATCH https://your-api.com/api/cortex/units/:id/status \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"status":"disabled"}'
   ```

4. **Rollback deployment:**
   - Revert to previous backend version
   - Keep database (no schema changes)
   - Automations will resume on redeploy

---

## 📋 Post-Deployment Verification

### Day 1 Checks
- [ ] Health endpoint responding
- [ ] Webhook endpoint receiving requests
- [ ] Automations executing successfully
- [ ] No errors in logs
- [ ] Performance metrics within targets

### Week 1 Checks
- [ ] Monitor webhook response times
- [ ] Monitor automation success rate
- [ ] Check database performance
- [ ] Review error logs for patterns
- [ ] Gather user feedback

---

## 🎯 Success Criteria

- ✅ Webhook responds in <200ms (user perceives instant feedback)
- ✅ Automations execute within 2-5s (async, user doesn't wait)
- ✅ No webhook timeouts or failures
- ✅ 95%+ automation success rate
- ✅ Users can create/pause/resume/delete automations
- ✅ Real-time status updates working (polling shows completion)

---

## 📞 Support

**Issues?**
1. Check backend logs
2. Verify environment variables
3. Test database/Redis connections
4. Review [PRODUCTION_INTEGRATION.md](PRODUCTION_INTEGRATION.md)
5. Run test suite: `npm run test:cortex`

**Backend Status:** ✅ Production-ready (69/69 tests passing)

---

**Ready to deploy?** Follow this checklist top to bottom! 🚀
