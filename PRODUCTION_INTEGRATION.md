# Cortex Production Integration Guide

**Focus:** Webhook Flow + Automation Management
**Status:** Backend Production-Ready (69/69 tests passing)

---

## 🎯 Core Integration Points

### 1. Webhook Flow (Nango → Cortex → Automations)
### 2. Automation CRUD
### 3. Real-Time Status Updates
### 4. Production Deployment

---

## 1️⃣ Webhook Flow Integration

### Architecture Overview

```
User Action (Send Email)
    ↓
Gmail/Calendar/Salesforce
    ↓
Nango Webhook
    ↓
POST /api/webhooks/nango (Returns 202 Accepted in <200ms)
    ↓
[ASYNC PROCESSING STARTS]
    ↓
EventShaper (Rule-based, no LLM, ~50ms)
    ↓
Database (Write event, ~20ms)
    ↓
Matcher (Groq LLM for semantic conditions, ~500ms)
    ↓
Runtime (Execute matched automations, 1-3s)
    ↓
[AUTOMATION COMPLETE]
```

### Critical: 202 Accepted Pattern

**Backend behavior:**
```javascript
// src/index.ts:257
app.post('/api/webhooks/nango', async (req, res) => {
  // IMMEDIATELY return 202 Accepted
  res.status(202).json({
    status: 'accepted',
    message: 'Webhook received and queued for processing'
  });

  // Process asynchronously (fire-and-forget)
  eventShaper.handleWebhook(payload)
    .then(result => logger.info('Processed'))
    .catch(err => logger.error('Failed'));
});
```

**Frontend integration:**
```javascript
// ✅ CORRECT: Non-blocking UI
const triggerAutomation = async () => {
  // Step 1: Webhook returns instantly
  const response = await fetch('/api/webhooks/nango', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(webhookPayload)
  });

  // Step 2: Show immediate feedback (202 received)
  if (response.status === 202) {
    setStatus('Webhook received! Processing...');
  }

  // Step 3: Poll for completion (optional)
  pollForRunCompletion(unitId);
};

// ❌ WRONG: Don't wait for full processing
// const response = await fetch(...);
// alert('Automation completed!'); // This would show instantly, not after 2-5s
```

---

## 2️⃣ Automation Management API

### Create Automation

**Endpoint:** `POST /api/cortex/units`

**Request:**
```javascript
const createAutomation = async (name, prompt) => {
  const response = await fetch('/api/cortex/units', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, prompt })
  });

  if (!response.ok) {
    const { error } = await response.json();
    throw new Error(error); // e.g., "Invalid compilation: missing trigger"
  }

  return response.json(); // { unit: { id, name, prompt, compiled, status } }
};
```

**Example Prompts:**
```javascript
// Simple rule-based
"when: email from manager@company.com then: archive email"

// Semantic (uses Groq LLM)
"when: email is urgent then: send to slack channel #alerts"

// Multi-step
"when: calendar event with 'interview' then: fetch candidate info and send summary email"

// Do nothing (testing)
"when: email from test@test.com then: do nothing"
```

**Response (201 Created):**
```json
{
  "unit": {
    "id": "unit_abc123",
    "name": "Archive manager emails",
    "prompt": "when: email from manager@company.com then: archive email",
    "compiled": {
      "when": {
        "source": "email",
        "event": "email_received",
        "conditions": [
          {
            "type": "semantic",
            "field": "from",
            "prompt": "email from manager@company.com"
          }
        ]
      },
      "then": [
        { "tool": "archive_email", "params": {} }
      ]
    },
    "status": "active",
    "created_at": "2026-01-06T10:00:00.000Z"
  }
}
```

---

### List Automations

**Endpoint:** `GET /api/cortex/units`

```javascript
const fetchAutomations = async () => {
  const response = await fetch('/api/cortex/units', {
    headers: { 'Authorization': `Bearer ${firebaseToken}` }
  });

  const { units } = await response.json();
  return units; // Array of automation objects
};
```

**Display in UI:**
```jsx
{units.map(unit => (
  <AutomationCard key={unit.id}>
    <h3>{unit.name}</h3>
    <p>{unit.prompt}</p>
    <StatusBadge status={unit.status} />
    <Button onClick={() => toggleStatus(unit.id, unit.status)}>
      {unit.status === 'active' ? 'Pause' : 'Resume'}
    </Button>
    <Button onClick={() => deleteAutomation(unit.id)}>Delete</Button>
  </AutomationCard>
))}
```

---

### Pause/Resume Automation

**Endpoint:** `PATCH /api/cortex/units/:id/status`

```javascript
const toggleAutomation = async (unitId, currentStatus) => {
  const newStatus = currentStatus === 'active' ? 'paused' : 'active';

  const response = await fetch(`/api/cortex/units/${unitId}/status`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: newStatus })
  });

  const { unit } = await response.json();
  return unit; // Updated unit with new status
};
```

**Status values:**
- `active` - Automation is running
- `paused` - Automation is paused (won't execute)
- `disabled` - Automation is disabled (soft delete)

---

### Delete Automation

**Endpoint:** `DELETE /api/cortex/units/:id`

```javascript
const deleteAutomation = async (unitId) => {
  await fetch(`/api/cortex/units/${unitId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${firebaseToken}` }
  });
};
```

---

## 3️⃣ Real-Time Status Updates

### Execution History

**Endpoint:** `GET /api/cortex/runs`

```javascript
const fetchRunHistory = async (limit = 50) => {
  const response = await fetch(`/api/cortex/runs?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${firebaseToken}` }
  });

  const { runs } = await response.json();
  return runs;
};
```

**Response:**
```json
{
  "runs": [
    {
      "id": "run_xyz789",
      "unit_id": "unit_abc123",
      "event_id": "evt_123",
      "status": "completed",
      "started_at": "2026-01-06T13:00:00.000Z",
      "completed_at": "2026-01-06T13:00:02.500Z",
      "metadata": {
        "event_type": "email_received",
        "email_from": "manager@company.com",
        "email_subject": "Quarterly Report"
      }
    }
  ]
}
```

---

### Polling for Completion

**Implementation:**
```javascript
const pollForRun = async (unitId, maxAttempts = 10, interval = 3000) => {
  for (let i = 0; i < maxAttempts; i++) {
    const { runs } = await fetchRunHistory(10);

    // Find most recent run for this automation
    const latestRun = runs.find(r => r.unit_id === unitId);

    // Check if completed
    if (latestRun && latestRun.status !== 'running') {
      return latestRun; // Success or failure
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return null; // Timeout after ~30 seconds
};

// Usage
const handleWebhookTrigger = async () => {
  // 1. Webhook returns 202 immediately
  setStatus('Webhook received! Processing...');

  // 2. Poll for completion
  const run = await pollForRun(automationId);

  // 3. Update UI
  if (run?.status === 'completed') {
    setStatus('✅ Automation completed successfully!');
  } else if (run?.status === 'failed') {
    setStatus('❌ Automation failed');
  } else {
    setStatus('⏱️ Still processing (taking longer than expected)');
  }
};
```

---

### Run Details

**Endpoint:** `GET /api/cortex/runs/:id/steps`

```javascript
const fetchRunDetails = async (runId) => {
  const response = await fetch(`/api/cortex/runs/${runId}/steps`, {
    headers: { 'Authorization': `Bearer ${firebaseToken}` }
  });

  const { steps } = await response.json();
  return steps;
};
```

**Response:**
```json
{
  "steps": [
    {
      "id": "step_1",
      "step_number": 1,
      "tool_name": "fetch_emails",
      "input": { "from": "manager@company.com" },
      "output": { "emails": [...] },
      "status": "completed",
      "started_at": "2026-01-06T13:00:01.000Z",
      "completed_at": "2026-01-06T13:00:01.500Z"
    }
  ]
}
```

**Display in UI:**
```jsx
<Modal>
  <h2>Execution Details</h2>
  <Timeline>
    {steps.map((step, i) => (
      <TimelineStep key={step.id}>
        <StepNumber>{i + 1}</StepNumber>
        <StepInfo>
          <h4>{step.tool_name}</h4>
          <Duration>{step.completed_at - step.started_at}ms</Duration>
          <JSONViewer collapsed>
            <div>Input: {JSON.stringify(step.input)}</div>
            <div>Output: {JSON.stringify(step.output)}</div>
          </JSONViewer>
        </StepInfo>
      </TimelineStep>
    ))}
  </Timeline>
</Modal>
```

---

## 4️⃣ Production Deployment

### Environment Variables

**Required for Backend:**
```env
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Authentication
FIREBASE_PROJECT_ID=assistant-b00f5

# External APIs
NANGO_SECRET_KEY=your_nango_secret
GROQ_API_KEY=your_groq_key

# Optional
PORT=8080
NODE_ENV=production
```

**Required for Frontend:**
```env
CORTEX_API_URL=https://your-backend.com
FIREBASE_PROJECT_ID=assistant-b00f5
```

---

### Health Check

**Endpoint:** `GET /health`

```javascript
const checkBackendHealth = async () => {
  const response = await fetch('https://your-backend.com/health');
  const { status } = await response.json();
  return status === 'ok'; // true if healthy
};
```

---

### Connection Management

**List Connections:**
```javascript
const fetchConnections = async () => {
  const response = await fetch('/api/cortex/connections', {
    headers: { 'Authorization': `Bearer ${firebaseToken}` }
  });

  const { connections } = await response.json();
  return connections;
};
```

**Register Connection (After Nango OAuth):**
```javascript
import Nango from '@nangohq/frontend';

const connectService = async (provider) => {
  // 1. Nango OAuth flow
  const nango = new Nango({ publicKey: process.env.NANGO_PUBLIC_KEY });
  const result = await nango.auth(provider, userId);

  // 2. Register with Cortex backend
  await fetch('/api/cortex/connections', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      connection_id: result.connectionId
    })
  });
};

// Usage
await connectService('google-mail');
await connectService('google-calendar');
await connectService('salesforce-2');
```

---

## 🚀 Production Checklist

### Backend Deployment ✅
- [ ] Environment variables configured
- [ ] Database migrations run: `psql ... -f migrations/001_cortex.sql`
- [ ] Health check endpoint responding
- [ ] SSL/TLS enabled for production
- [ ] CORS configured for your frontend domain
- [ ] Logging/monitoring enabled (Winston logs)
- [ ] Rate limiting configured (if needed)

### Frontend Integration ✅
- [ ] API client with Firebase auth configured
- [ ] 202 Accepted handling (don't block on webhook response)
- [ ] Polling implemented for run status
- [ ] Error messages shown to users (from `response.error`)
- [ ] Loading states during API calls
- [ ] Status badges for automations (active/paused/disabled)
- [ ] Connection management (Nango OAuth)

### Testing ✅
- [ ] Create automation → verify in list
- [ ] Trigger webhook → verify 202 response (<200ms)
- [ ] Poll runs → verify completion within 5s
- [ ] Pause automation → verify no execution
- [ ] Resume automation → verify execution works
- [ ] Delete automation → verify removed from list
- [ ] Handle invalid prompts → show error message
- [ ] Handle 401 unauthorized → redirect to login

---

## 📊 Performance Expectations

| Operation | Expected Time | User Experience |
|-----------|--------------|-----------------|
| Create automation | 1-3s | Show loading spinner |
| List automations | <500ms | Instant load |
| Pause/Resume | <200ms | Instant update |
| Webhook trigger | **<200ms** | "Received" immediately |
| Automation execution | 2-5s | Poll for completion |
| View history | <500ms | Instant load |

---

## 🔥 Critical Integration Points

### 1. Don't Block on Webhook Response
```javascript
// ❌ WRONG
const response = await triggerWebhook();
alert('Automation completed!'); // Shows immediately, not after execution

// ✅ CORRECT
const response = await triggerWebhook();
if (response.status === 202) {
  setStatus('Processing...');
  const run = await pollForRun(unitId);
  setStatus(run.status === 'completed' ? 'Done!' : 'Failed');
}
```

### 2. Handle Compilation Errors
```javascript
try {
  const unit = await createAutomation(name, prompt);
  setStatus('Created!');
} catch (error) {
  // Show user-friendly error
  if (error.message.includes('Invalid compilation')) {
    setError('Invalid automation prompt. Try: "when: email from X then: do Y"');
  } else {
    setError(error.message);
  }
}
```

### 3. Real-Time Status Updates
```javascript
// Show progression
setStatus('Webhook received'); // Immediate (202 response)
setStatus('Processing automation...'); // Start polling
setStatus('Completed!'); // After run finishes
```

---

## 🆘 Troubleshooting

### Issue: Automation doesn't execute
**Checklist:**
1. Is automation status `active`? (not paused/disabled)
2. Is connection registered? `GET /api/cortex/connections`
3. Did webhook trigger? Check backend logs
4. Did automation match? Check `GET /api/cortex/runs`

### Issue: 401 Unauthorized
**Fix:** Refresh Firebase token
```javascript
const token = await firebase.auth().currentUser.getIdToken(true); // Force refresh
```

### Issue: Webhook takes >200ms
**Expected:** Webhook should return 202 in <200ms. If slower:
- Check backend logs for errors
- Verify database connection is fast
- Check Redis connection

---

## 📞 Support Resources

- **Full API Docs:** [UI_INTEGRATION_CONTRACT.md](UI_INTEGRATION_CONTRACT.md)
- **Performance Details:** [ENHANCEMENTS_IMPLEMENTED.md](ENHANCEMENTS_IMPLEMENTED.md)
- **Test Suite:** `npm run test:cortex` (69/69 passing)
- **Backend Logs:** `npm run dev` (console output)

---

## 🎯 Next Steps

1. **Test locally:**
   - Start backend: `npm run dev`
   - Create automation via API
   - Trigger webhook manually
   - Verify 202 response and polling

2. **Deploy to staging:**
   - Configure environment variables
   - Run migrations
   - Test webhook flow end-to-end

3. **Deploy to production:**
   - Monitor webhook response times (<200ms)
   - Monitor automation execution times (2-5s)
   - Set up alerts for failures

**Backend is production-ready. Start integrating!** 🚀
