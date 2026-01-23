# Cortex Integration - Quick Reference Card

**Backend:** `https://your-api.com`
**Auth:** Firebase Bearer token

---

## 🔥 Critical: 202 Accepted Pattern

21SYNC in background (2-5s)

const response = await fetch('/api/webhooks/nango', { method: 'POST', ... });
// response.status === 202

// Don't wait for automation to complete
// Poll for results instead
const run = await pollForRun(unitId);
```

---

## 📡 API Endpoints

### Automations
```javascript
// List
GET /api/cortex/units
→ { units: [...] }

// Create
POST /api/cortex/units
{ "name": "...", "prompt": "when: ... then: ..." }
→ 201: { unit: {...} }
→ 400: { error: "Invalid compilation..." }

// Pause/Resume
PATCH /api/cortex/units/:id/status
{ "status": "paused" | "active" | "disabled" }
→ 200: { unit: {...} }

// Delete
DELETE /api/cortex/units/:id
→ 200: { success: true }
```

### Execution History
```javascript
// List runs
GET /api/cortex/runs?limit=50
→ { runs: [{id, unit_id, status, started_at, ...}] }

// Run details
GET /api/cortex/runs/:id/steps
→ { steps: [{tool_name, input, output, ...}] }
```

### Connections
```javascript
// List
GET /api/cortex/connections
→ { connections: [{provider, connection_id, enabled}] }

// Register
POST /api/cortex/connections
{ "provider": "google-mail", "connection_id": "..." }
→ 201: { connection: {...} }

// Disconnect
DELETE /api/cortex/connections/:provider
→ 200: { success: true }
```

### Webhooks
```javascript
// Nango webhook
POST /api/webhooks/nango
→ 202: { status: "accepted", message: "..." }
```

---

## 🎨 Example Prompts

```javascript
// Rule-based (fast, no LLM)
"when: email from manager@company.com then: archive email"

// Semantic (uses Groq LLM)
"when: email is urgent then: send to slack #alerts"

// Multi-step
"when: calendar event contains 'interview' then: fetch candidate info and email summary"

// Testing
"when: email from test@test.com then: do nothing"
```

---

## ⏱️ Performance Targets

| Operation | Time | Notes |
|-----------|------|-------|
| Webhook response | <200ms | 202 Accepted |
| Create automation | 1-3s | Groq compilation |
| List automations | <500ms | Database query |
| Pause/Resume | <200ms | Status update |
| Automation execution | 2-5s | Async background |

---

## 🔄 Polling Pattern

```javascript
const pollForRun = async (unitId, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const { runs } = await fetch('/api/cortex/runs?limit=10').then(r => r.json());
    const run = runs.find(r => r.unit_id === unitId);

    if (run && run.status !== 'running') {
      return run; // Completed or failed
    }

    await new Promise(r => setTimeout(r, 3000)); // Wait 3s
  }
  return null; // Timeout
};

// Usage
const run = await pollForRun(unitId);
if (run?.status === 'completed') {
  console.log('Success!');
}
```

---

## 🛡️ Error Handling

```javascript
try {
  const unit = await createAutomation(name, prompt);
} catch (error) {
  // Backend errors include descriptive messages
  if (error.message.includes('Invalid compilation')) {
    showError('Invalid automation prompt');
  } else if (error.message.includes('No connection')) {
    showError('Please connect Gmail first');
  } else {
    showError(error.message);
  }
}
```

**Common Errors:**
- `401 Unauthorized` → Refresh Firebase token
- `Invalid compilation: missing trigger` → Fix prompt format
- `No connection found for provider` → Connect service via Nango

---

## 🔐 Authentication

```javascript
const firebaseToken = await firebase.auth().currentUser.getIdToken();

const response = await fetch('/api/cortex/units', {
  headers: {
    'Authorization': `Bearer ${firebaseToken}`,
    'Content-Type': 'application/json'
  }
});
```

---

## 🎯 Nango OAuth Flow

```javascript
import Nango from '@nangohq/frontend';

const nango = new Nango({ publicKey: process.env.NANGO_PUBLIC_KEY });

// 1. OAuth flow
const result = await nango.auth('google-mail', userId);

// 2. Register with Cortex
await fetch('/api/cortex/connections', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    provider: 'google-mail',
    connection_id: result.connectionId
  })
});
```

**Provider Keys:**
- Gmail: `google-mail-ynxw`
- Calendar: `google-calendar`
- Salesforce: `salesforce-2`

---

## 🚦 Status Values

**Automation Status:**
- `active` - Running
- `paused` - Paused (won't execute)
- `disabled` - Disabled (soft delete)

**Run Status:**
- `running` - In progress
- `completed` - Success
- `failed` - Error occurred

---

## 🧪 Test Locally

```bash
# Start backend
npm run dev

# Test health
curl http://localhost:8080/health

# Test webhook (no auth required for webhook endpoint)
curl -X POST http://localhost:8080/api/webhooks/nango \
  -H "Content-Type: application/json" \
  -d '{"type":"sync","connectionId":"test"}'

# Expected: {"status":"accepted",...} in <200ms
```

---

## 📊 Response Formats

**Success (200/201):**
```json
{
  "unit": {...},
  "units": [...],
  "runs": [...],
  "steps": [...]
}
```

**Accepted (202):**
```json
{
  "status": "accepted",
  "message": "Webhook received and queued for processing"
}
```

**Error (400/401/500):**
```json
{
  "error": "Descriptive error message here"
}
```

---

## 🔧 Environment Variables

**Backend:**
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
FIREBASE_PROJECT_ID=assistant-b00f5
NANGO_SECRET_KEY=***
GROQ_API_KEY=***
```

**Frontend:**
```env
CORTEX_API_URL=https://your-api.com
NANGO_PUBLIC_KEY=***
```

---

## 📝 Full Documentation

- **Production Guide:** [PRODUCTION_INTEGRATION.md](PRODUCTION_INTEGRATION.md)
- **Full API Contract:** [UI_INTEGRATION_CONTRACT.md](UI_INTEGRATION_CONTRACT.md)
- **Deployment Checklist:** [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- **Performance Details:** [ENHANCEMENTS_IMPLEMENTED.md](ENHANCEMENTS_IMPLEMENTED.md)

---

**Backend Status:** ✅ Production-ready (69/69 tests passing)
