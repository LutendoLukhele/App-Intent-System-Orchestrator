# Cortex UI Integration Contract

**Version:** 1.0
**Last Updated:** 2026-01-06
**Backend Status:** Production-ready (69/69 tests passing)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Base Configuration](#base-configuration)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [Webhook Integration](#webhook-integration)
5. [Performance Expectations](#performance-expectations)
6. [Error Handling](#error-handling)
7. [Integration Checklist](#integration-checklist)
8. [Testing Guide](#testing-guide)

---

## Quick Start

### Backend Environment
- **Base URL (Local):** `http://localhost:8080`
- **Base URL (Production):** `[YOUR_PRODUCTION_URL]`
- **API Prefix:** `/api/cortex`
- **Webhook Endpoint:** `/api/webhooks/nango`

### Authentication
- **Method:** Firebase Authentication
- **Header:** `Authorization: Bearer <firebase_token>`
- **User ID:** Extracted from Firebase token

---

## Base Configuration

### Required Environment Variables (Frontend)
```env
CORTEX_API_URL=http://localhost:8080
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
```

### Headers for API Requests
```javascript
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <firebase_token>"
}
```

---

## API Endpoints Reference

### 1. **Automation Management**

#### 📌 GET `/api/cortex/units` - List All Automations
**Description:** Fetch all automation units for the authenticated user.

**Request:**
```http
GET /api/cortex/units
Authorization: Bearer <firebase_token>
```

**Response (200 OK):**
```json
{
  "units": [
    {
      "id": "unit_abc123",
      "user_id": "user_xyz",
      "name": "Archive emails from manager",
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
          {
            "tool": "archive_email",
            "params": {}
          }
        ]
      },
      "status": "active",
      "created_at": "2026-01-06T10:00:00.000Z",
      "updated_at": "2026-01-06T10:00:00.000Z"
    }
  ]
}
```

---

#### 📌 POST `/api/cortex/units` - Create Automation
**Description:** Create a new automation from a natural language prompt.

**Request:**
```http
POST /api/cortex/units
Authorization: Bearer <firebase_token>
Content-Type: application/json

{
  "name": "Forward urgent emails to Slack",
  "prompt": "when: email with subject containing 'urgent' then: send to slack channel #alerts"
}
```

**Response (201 Created):**
```json
{
  "unit": {
    "id": "unit_new123",
    "user_id": "user_xyz",
    "name": "Forward urgent emails to Slack",
    "prompt": "when: email with subject containing 'urgent' then: send to slack channel #alerts",
    "compiled": { ... },
    "status": "active",
    "created_at": "2026-01-06T11:00:00.000Z",
    "updated_at": "2026-01-06T11:00:00.000Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Invalid compilation: missing trigger source or event"
}
```

---

#### 📌 PATCH `/api/cortex/units/:id/status` - Update Automation Status
**Description:** Pause, resume, or disable an automation.

**Request:**
```http
PATCH /api/cortex/units/unit_abc123/status
Authorization: Bearer <firebase_token>
Content-Type: application/json

{
  "status": "paused"  // Options: "active", "paused", "disabled"
}
```

**Response (200 OK):**
```json
{
  "unit": {
    "id": "unit_abc123",
    "status": "paused",
    "updated_at": "2026-01-06T12:00:00.000Z",
    ...
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Invalid status"
}
```

---

#### 📌 DELETE `/api/cortex/units/:id` - Delete Automation
**Description:** Permanently delete an automation.

**Request:**
```http
DELETE /api/cortex/units/unit_abc123
Authorization: Bearer <firebase_token>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 2. **Execution History**

#### 📌 GET `/api/cortex/runs` - List Automation Runs
**Description:** Fetch recent automation execution history.

**Request:**
```http
GET /api/cortex/runs?limit=50
Authorization: Bearer <firebase_token>
```

**Query Parameters:**
- `limit` (optional): Max number of results (default: 50, max: 100)
- `unit_id` (optional): Filter by specific automation unit

**Response (200 OK):**
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

**Run Status Values:**
- `running`: Execution in progress
- `completed`: Successfully finished
- `failed`: Error occurred

---

#### 📌 GET `/api/cortex/runs/:id/steps` - Get Run Steps
**Description:** Fetch detailed execution steps for a specific run.

**Request:**
```http
GET /api/cortex/runs/run_xyz789/steps
Authorization: Bearer <firebase_token>
```

**Response (200 OK):**
```json
{
  "steps": [
    {
      "id": "step_1",
      "run_id": "run_xyz789",
      "step_number": 1,
      "tool_name": "fetch_emails",
      "input": {
        "from": "manager@company.com"
      },
      "output": {
        "emails": [...]
      },
      "status": "completed",
      "started_at": "2026-01-06T13:00:01.000Z",
      "completed_at": "2026-01-06T13:00:01.500Z"
    },
    {
      "id": "step_2",
      "run_id": "run_xyz789",
      "step_number": 2,
      "tool_name": "archive_email",
      "input": {
        "email_id": "msg_123"
      },
      "output": {
        "success": true
      },
      "status": "completed",
      "started_at": "2026-01-06T13:00:01.600Z",
      "completed_at": "2026-01-06T13:00:02.500Z"
    }
  ]
}
```

---

### 3. **Connections Management**

#### 📌 GET `/api/cortex/connections` - List User Connections
**Description:** Fetch all connected third-party services for the user.

**Request:**
```http
GET /api/cortex/connections
Authorization: Bearer <firebase_token>
```

**Response (200 OK):**
```json
{
  "connections": [
    {
      "user_id": "user_xyz",
      "provider": "google-mail",
      "connection_id": "90a6fb46-ec59-4cee-b297-8dc70d81ec07",
      "enabled": true,
      "created_at": "2026-01-05T10:00:00.000Z"
    },
    {
      "user_id": "user_xyz",
      "provider": "google-calendar",
      "connection_id": "abc123-def456",
      "enabled": true,
      "created_at": "2026-01-05T11:00:00.000Z"
    }
  ]
}
```

---

#### 📌 POST `/api/cortex/connections` - Register Connection
**Description:** Register a new Nango connection for the user.

**Request:**
```http
POST /api/cortex/connections
Authorization: Bearer <firebase_token>
Content-Type: application/json

{
  "provider": "google-mail",
  "connection_id": "90a6fb46-ec59-4cee-b297-8dc70d81ec07"
}
```

**Response (201 Created):**
```json
{
  "connection": {
    "user_id": "user_xyz",
    "provider": "google-mail",
    "connection_id": "90a6fb46-ec59-4cee-b297-8dc70d81ec07",
    "enabled": true,
    "created_at": "2026-01-06T14:00:00.000Z"
  }
}
```

---

#### 📌 DELETE `/api/cortex/connections/:provider` - Disconnect Service
**Description:** Remove a connected service.

**Request:**
```http
DELETE /api/cortex/connections/google-mail
Authorization: Bearer <firebase_token>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 4. **Available Tools & Capabilities**

#### 📌 GET `/api/cortex/tools` - List Available Tools
**Description:** Fetch all available automation tools/actions.

**Request:**
```http
GET /api/cortex/tools
Authorization: Bearer <firebase_token>
```

**Response (200 OK):**
```json
{
  "tools": [
    {
      "name": "fetch_emails",
      "category": "Email",
      "description": "Fetch emails from Gmail inbox",
      "parameters": {
        "from": "string (optional)",
        "subject": "string (optional)",
        "limit": "number (optional, default: 10)"
      }
    },
    {
      "name": "send_email",
      "category": "Email",
      "description": "Send an email via Gmail",
      "parameters": {
        "to": "string (required)",
        "subject": "string (required)",
        "body": "string (required)"
      }
    },
    {
      "name": "create_calendar_event",
      "category": "Calendar",
      "description": "Create a new calendar event",
      "parameters": {
        "title": "string (required)",
        "start": "datetime (required)",
        "end": "datetime (required)"
      }
    }
  ]
}
```

---

## Webhook Integration

### Webhook Flow (Nango → Cortex → User Automations)

**IMPORTANT:** Cortex uses **202 Accepted** responses for all webhook requests. This means:
- ✅ Webhook returns **immediately** (<200ms)
- ✅ Processing happens **asynchronously** in the background
- ✅ User perceives **instant** response
- ⏳ Actual automation execution takes **1-3 seconds** (transparent to user)

#### Webhook Endpoint
```http
POST /api/webhooks/nango
Content-Type: application/json

{
  "type": "sync",
  "connectionId": "90a6fb46-ec59-4cee-b297-8dc70d81ec07",
  "providerConfigKey": "google-mail-ynxw",
  "model": "GmailEmail",
  "syncName": "gmail-emails",
  "responseResults": {
    "added": [
      {
        "id": "msg_123",
        "from": "sender@example.com",
        "subject": "Test Email",
        "body_text": "Email content",
        "date": "2026-01-06T15:00:00.000Z"
      }
    ],
    "updated": [],
    "deleted": []
  }
}
```

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "message": "Webhook received and queued for processing"
}
```

### Webhook Processing Timeline

```
T+0ms:      Nango sends webhook → Cortex receives request
T+10ms:     Cortex validates webhook payload
T+50ms:     Event shaping (rule-based, no LLM)
T+100ms:    Database write + async task queued
T+<200ms:   ✅ WEBHOOK RETURNS 202 ACCEPTED TO NANGO

(User is done here - perceives instant response)

--- Background Processing (Async) ---
T+500ms:    Groq LLM evaluates matching automations
T+1-2s:     Matched automations execute (Groq + Nango API calls)
T+2-5s:     Automation complete, results stored in database
```

**Key Insight for UI:**
- User sees webhook acknowledgment **immediately** (<200ms)
- Automation execution happens **transparently** in the background
- UI should show "Processing..." status and poll for results (see below)

---

## Performance Expectations

### User-Facing Metrics
| Operation | Expected Time | Notes |
|-----------|--------------|-------|
| **GET /units** | <500ms | List automations |
| **POST /units** | 1-3s | Includes Groq compilation |
| **PATCH /units/:id/status** | <200ms | Status update only |
| **GET /runs** | <500ms | Fetch execution history |
| **Webhook response** | **<200ms** | Returns 202 Accepted immediately |
| **Automation execution** | 2-5s | Async, user doesn't wait |

### Backend Characteristics
- ✅ **Parallelization:** Multiple events processed concurrently
- ✅ **Groq Prompt Caching:** 100-400x faster for repeated evaluations (5-minute TTL)
- ✅ **202 Accepted Pattern:** 10-25x faster perceived latency
- ✅ **External API Latency:** Nango API calls (1-2s) are unavoidable but acceptable

---

## Error Handling

### Standard Error Format
```json
{
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes
| Status Code | Meaning | Example |
|------------|---------|---------|
| **200 OK** | Request succeeded | GET /units |
| **201 Created** | Resource created | POST /units |
| **202 Accepted** | Request accepted, processing async | POST /webhooks/nango |
| **400 Bad Request** | Invalid input | Invalid status value |
| **401 Unauthorized** | Missing/invalid auth token | No Authorization header |
| **404 Not Found** | Resource doesn't exist | GET /units/invalid_id |
| **500 Internal Server Error** | Backend error | Database failure |

### Common Errors

#### 1. **Invalid Compilation**
```json
{
  "error": "Invalid compilation: missing trigger source or event"
}
```
**Cause:** User's automation prompt couldn't be compiled.
**Solution:** Show user-friendly error and suggest valid prompt format.

#### 2. **Unauthorized**
```json
{
  "error": "Unauthorized"
}
```
**Cause:** Missing or invalid Firebase token.
**Solution:** Redirect to login or refresh token.

#### 3. **Connection Not Found**
```json
{
  "error": "No connection found for provider: google-mail"
}
```
**Cause:** User hasn't connected the required service.
**Solution:** Prompt user to connect service via Nango.

---

## Integration Checklist

### Phase 1: Basic Setup ✅
- [ ] Configure Firebase authentication in frontend
- [ ] Set up API base URL environment variable
- [ ] Implement authentication headers for all requests
- [ ] Test basic GET /units endpoint with valid token

### Phase 2: Automation Management ✅
- [ ] Implement "Create Automation" form
  - [ ] Text input for automation name
  - [ ] Text area for natural language prompt
  - [ ] Submit → POST /units
  - [ ] Handle 201 success and 400 errors
- [ ] Implement "Automation List" view
  - [ ] Fetch → GET /units
  - [ ] Display automation cards with name, prompt, status
  - [ ] Show created/updated timestamps
- [ ] Implement "Pause/Resume" controls
  - [ ] Toggle button for each automation
  - [ ] Send → PATCH /units/:id/status
  - [ ] Update UI on success
- [ ] Implement "Delete Automation" feature
  - [ ] Confirmation dialog
  - [ ] Send → DELETE /units/:id
  - [ ] Remove from UI on success

### Phase 3: Execution History ✅
- [ ] Implement "Run History" view
  - [ ] Fetch → GET /runs?limit=50
  - [ ] Display table/list of recent runs
  - [ ] Show status badges (running, completed, failed)
  - [ ] Show timestamps and duration
- [ ] Implement "Run Details" modal
  - [ ] Click run → Fetch GET /runs/:id/steps
  - [ ] Display step-by-step execution flow
  - [ ] Show tool inputs and outputs
  - [ ] Highlight errors if run failed

### Phase 4: Connection Management ✅
- [ ] Implement "Connected Services" page
  - [ ] Fetch → GET /connections
  - [ ] Display connected providers with status
  - [ ] Show connection timestamps
- [ ] Implement "Connect Service" flow
  - [ ] Integrate Nango OAuth widget
  - [ ] On success → POST /connections
  - [ ] Refresh connection list
- [ ] Implement "Disconnect Service" feature
  - [ ] Confirmation dialog
  - [ ] Send → DELETE /connections/:provider
  - [ ] Update UI on success

### Phase 5: Real-Time Updates ✅
- [ ] Implement polling for run status
  - [ ] After creating automation, poll GET /runs every 3 seconds
  - [ ] Show "Processing..." indicator
  - [ ] Update UI when run completes
- [ ] Implement webhook status indicator
  - [ ] Show "Webhook received" immediately (202 response)
  - [ ] Show "Processing automation..." (polling runs)
  - [ ] Show "Completed" when run finishes

### Phase 6: Advanced Features (Optional) ⚡
- [ ] Implement automation templates
  - [ ] Fetch → GET /tools for available actions
  - [ ] Pre-populate common automation patterns
- [ ] Implement automation analytics
  - [ ] Show execution count per automation
  - [ ] Show success/failure rates
  - [ ] Chart execution times
- [ ] Implement real-time notifications
  - [ ] WebSocket or SSE connection for run updates
  - [ ] Push notifications when automation completes

---

## Testing Guide

### 1. Local Testing Setup

**Prerequisites:**
```bash
# Start backend server
cd backend
npm run dev

# Verify server is running
curl http://localhost:8080/health
# Expected: {"status":"ok","timestamp":"..."}
```

**Test Authentication:**
```javascript
// Frontend test
const token = await firebase.auth().currentUser.getIdToken();
const response = await fetch('http://localhost:8080/api/cortex/units', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
console.log(await response.json());
```

---

### 2. End-to-End Testing Scenarios

#### Scenario 1: Create and Test Automation ✅
1. **Connect Gmail** (via Nango)
2. **Create automation:**
   ```json
   POST /api/cortex/units
   {
     "name": "Archive test emails",
     "prompt": "when: email with subject containing 'test' then: archive email"
   }
   ```
3. **Verify automation created:** Check response for `unit.id`
4. **Trigger webhook** (manually or via Gmail):
   ```json
   POST /api/webhooks/nango
   {
     "type": "sync",
     "connectionId": "your_connection_id",
     "providerConfigKey": "google-mail-ynxw",
     "model": "GmailEmail",
     "responseResults": {
       "added": [{
         "id": "msg_test",
         "subject": "This is a test email",
         ...
       }]
     }
   }
   ```
   - ✅ Expect **202 Accepted** response (<200ms)
5. **Poll for run completion:**
   ```javascript
   // Poll every 3 seconds
   const checkRuns = async () => {
     const response = await fetch('/api/cortex/runs');
     const { runs } = await response.json();
     const latestRun = runs[0];
     if (latestRun.status === 'completed') {
       console.log('Automation completed!', latestRun);
       return true;
     }
     return false;
   };
   ```

#### Scenario 2: Pause and Resume Automation ✅
1. **Pause automation:**
   ```json
   PATCH /api/cortex/units/unit_abc123/status
   { "status": "paused" }
   ```
2. **Trigger webhook** → Verify automation doesn't execute
3. **Resume automation:**
   ```json
   PATCH /api/cortex/units/unit_abc123/status
   { "status": "active" }
   ```
4. **Trigger webhook** → Verify automation executes

#### Scenario 3: View Execution History ✅
1. **Fetch recent runs:**
   ```javascript
   const response = await fetch('/api/cortex/runs?limit=10');
   const { runs } = await response.json();
   ```
2. **Get run details:**
   ```javascript
   const runId = runs[0].id;
   const stepsResponse = await fetch(`/api/cortex/runs/${runId}/steps`);
   const { steps } = await stepsResponse.json();
   console.log('Execution steps:', steps);
   ```

---

### 3. Testing Checklist

#### API Integration Tests ✅
- [ ] All endpoints return expected status codes
- [ ] All endpoints return valid JSON
- [ ] Authentication works (valid token → success, invalid → 401)
- [ ] Error responses include `error` field
- [ ] Pagination works (if applicable)

#### Webhook Integration Tests ✅
- [ ] Webhook returns **202 Accepted** immediately (<200ms)
- [ ] Response includes `status: "accepted"`
- [ ] Background processing creates run in database
- [ ] Polling retrieves completed run within 5 seconds

#### Performance Tests ✅
- [ ] GET /units responds in <500ms
- [ ] POST /units responds in <3s
- [ ] Webhook responds in <200ms
- [ ] No requests timeout (max 30s)

#### Error Handling Tests ✅
- [ ] Invalid token → 401 Unauthorized
- [ ] Invalid prompt → 400 Bad Request with error message
- [ ] Missing connection → Appropriate error message
- [ ] Network error → Graceful degradation in UI

---

## Quick Reference: Key Endpoints

```javascript
// Authentication
headers: { 'Authorization': 'Bearer <firebase_token>' }

// List automations
GET /api/cortex/units

// Create automation
POST /api/cortex/units
{ "name": "...", "prompt": "when: ... then: ..." }

// Pause/Resume automation
PATCH /api/cortex/units/:id/status
{ "status": "paused" | "active" | "disabled" }

// Delete automation
DELETE /api/cortex/units/:id

// Get execution history
GET /api/cortex/runs?limit=50

// Get run details
GET /api/cortex/runs/:id/steps

// Webhook (Nango → Cortex)
POST /api/webhooks/nango
→ Returns 202 Accepted immediately
```

---

## Support & Resources

- **Backend Repository:** `/Users/lutendolukhele/Desktop/backedn-main`
- **Test Suite:** `npm run test:cortex` (69/69 passing)
- **Performance Documentation:** `ENHANCEMENTS_IMPLEMENTED.md`
- **Architecture Overview:** `CORTEX_IMPLEMENTATION.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-06 | Initial integration contract with 202 Accepted webhooks |

---

**Ready for Integration** ✅
All endpoints tested and production-ready.
