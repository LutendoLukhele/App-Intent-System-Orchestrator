# UI Integration Checklist - Cortex Backend

**Backend Status:** ✅ Production-Ready (69/69 tests passing)
**Contract:** See [UI_INTEGRATION_CONTRACT.md](UI_INTEGRATION_CONTRACT.md) for full details

---

## 🚀 Quick Start (5 minutes)

- [ ] Clone backend repo and run locally: `npm run dev`
- [ ] Verify health endpoint: `curl http://localhost:8080/health`
- [ ] Get Firebase token from your auth flow
- [ ] Test basic API call:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    http://localhost:8080/api/cortex/units
  ```
- [ ] Read [UI_INTEGRATION_CONTRACT.md](UI_INTEGRATION_CONTRACT.md)

---

## 📋 Integration Phases

### Phase 1: Authentication & Basic Setup (Day 1)
**Goal:** Connect frontend to backend with working authentication

- [ ] Set up environment variables:
  ```env
  CORTEX_API_URL=http://localhost:8080
  FIREBASE_PROJECT_ID=assistant-b00f5
  ```
- [ ] Create API client utility:
  ```javascript
  const cortexAPI = {
    baseURL: process.env.CORTEX_API_URL,
    async request(endpoint, options = {}) {
      const token = await firebase.auth().currentUser.getIdToken();
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API request failed');
      }
      return response.json();
    }
  };
  ```
- [ ] Test authenticated request to `GET /api/cortex/units`
- [ ] Handle 401 errors → redirect to login

**Deliverable:** Working API client with authentication ✅

---

### Phase 2: Automation Management (Day 2-3)
**Goal:** Users can create, view, pause, and delete automations

#### 2.1 Create Automation
- [ ] Build form UI:
  - [ ] Input: Automation name
  - [ ] Textarea: Natural language prompt
  - [ ] Submit button
- [ ] Implement `POST /api/cortex/units`:
  ```javascript
  const createAutomation = async (name, prompt) => {
    return cortexAPI.request('/api/cortex/units', {
      method: 'POST',
      body: JSON.stringify({ name, prompt })
    });
  };
  ```
- [ ] Handle success (201):
  - [ ] Show success message
  - [ ] Add new automation to list
  - [ ] Clear form
- [ ] Handle errors (400):
  - [ ] Show error message to user
  - [ ] Suggest valid prompt format

#### 2.2 List Automations
- [ ] Implement `GET /api/cortex/units`:
  ```javascript
  const fetchAutomations = async () => {
    return cortexAPI.request('/api/cortex/units');
  };
  ```
- [ ] Display automation cards:
  - [ ] Automation name (bold)
  - [ ] Prompt (gray text)
  - [ ] Status badge (active/paused/disabled)
  - [ ] Created date
  - [ ] Action buttons (pause/delete)

#### 2.3 Pause/Resume Automation
- [ ] Add toggle button to each automation card
- [ ] Implement `PATCH /api/cortex/units/:id/status`:
  ```javascript
  const updateStatus = async (unitId, status) => {
    return cortexAPI.request(`/api/cortex/units/${unitId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  };
  ```
- [ ] Update UI immediately on success
- [ ] Show loading state during API call

#### 2.4 Delete Automation
- [ ] Add delete button to each automation card
- [ ] Show confirmation dialog before deletion
- [ ] Implement `DELETE /api/cortex/units/:id`:
  ```javascript
  const deleteAutomation = async (unitId) => {
    return cortexAPI.request(`/api/cortex/units/${unitId}`, {
      method: 'DELETE'
    });
  };
  ```
- [ ] Remove from UI on success

**Deliverable:** Full automation CRUD interface ✅

---

### Phase 3: Execution History (Day 4)
**Goal:** Users can view automation execution logs

#### 3.1 Run History List
- [ ] Create "History" tab/page
- [ ] Implement `GET /api/cortex/runs`:
  ```javascript
  const fetchRuns = async (limit = 50) => {
    return cortexAPI.request(`/api/cortex/runs?limit=${limit}`);
  };
  ```
- [ ] Display run table:
  - [ ] Columns: Status, Automation Name, Triggered At, Duration
  - [ ] Status badges:
    - 🟢 Completed (green)
    - 🔴 Failed (red)
    - 🟡 Running (yellow)
  - [ ] Click row → show details

#### 3.2 Run Details Modal
- [ ] Create modal/drawer component
- [ ] Implement `GET /api/cortex/runs/:id/steps`:
  ```javascript
  const fetchRunSteps = async (runId) => {
    return cortexAPI.request(`/api/cortex/runs/${runId}/steps`);
  };
  ```
- [ ] Display execution timeline:
  - [ ] Step number
  - [ ] Tool name
  - [ ] Input parameters (expandable JSON)
  - [ ] Output data (expandable JSON)
  - [ ] Duration per step
  - [ ] Highlight errors in red

**Deliverable:** Execution history viewer ✅

---

### Phase 4: Connection Management (Day 5)
**Goal:** Users can connect/disconnect third-party services

#### 4.1 Connections List
- [ ] Create "Connections" page
- [ ] Implement `GET /api/cortex/connections`:
  ```javascript
  const fetchConnections = async () => {
    return cortexAPI.request('/api/cortex/connections');
  };
  ```
- [ ] Display connected services:
  - [ ] Provider icon + name
  - [ ] Status (Connected/Disconnected)
  - [ ] Connected date
  - [ ] Disconnect button

#### 4.2 Connect Service (Nango Integration)
- [ ] Install Nango SDK: `npm install @nangohq/frontend`
- [ ] Integrate Nango OAuth flow:
  ```javascript
  import Nango from '@nangohq/frontend';

  const nango = new Nango({ publicKey: 'YOUR_NANGO_PUBLIC_KEY' });

  const connectService = async (provider) => {
    const result = await nango.auth(provider, '<user_id>');

    // Register connection with Cortex
    await cortexAPI.request('/api/cortex/connections', {
      method: 'POST',
      body: JSON.stringify({
        provider,
        connection_id: result.connectionId
      })
    });
  };
  ```
- [ ] Add "Connect Gmail" button
- [ ] Add "Connect Google Calendar" button
- [ ] Add "Connect Salesforce" button
- [ ] Refresh connection list after successful connection

#### 4.3 Disconnect Service
- [ ] Add disconnect button to each connected service
- [ ] Show confirmation dialog
- [ ] Implement `DELETE /api/cortex/connections/:provider`:
  ```javascript
  const disconnectService = async (provider) => {
    return cortexAPI.request(`/api/cortex/connections/${provider}`, {
      method: 'DELETE'
    });
  };
  ```
- [ ] Update UI on success

**Deliverable:** Connection management interface ✅

---

### Phase 5: Real-Time Updates (Day 6)
**Goal:** Show live automation execution status

#### 5.1 Webhook Status Indicator
- [ ] After creating automation, show status:
  - ⏳ "Waiting for trigger..."
  - ✅ "Webhook received" (after 202 response)
  - ⚙️ "Processing automation..." (polling for run)
  - ✅ "Completed!" (run finished)

#### 5.2 Polling for Run Updates
- [ ] Implement polling utility:
  ```javascript
  const pollForRun = async (unitId, maxAttempts = 10) => {
    for (let i = 0; i < maxAttempts; i++) {
      const { runs } = await fetchRuns(10);
      const latestRun = runs.find(r => r.unit_id === unitId);

      if (latestRun && latestRun.status !== 'running') {
        return latestRun; // Completed or failed
      }

      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s
    }
    return null; // Timeout
  };
  ```
- [ ] Show "Processing..." indicator
- [ ] Update UI when run completes
- [ ] Show error if run fails

#### 5.3 Auto-Refresh History
- [ ] Add auto-refresh toggle to history page
- [ ] Poll `GET /api/cortex/runs` every 5 seconds when enabled
- [ ] Show new runs at top of list
- [ ] Highlight new runs with animation

**Deliverable:** Live status updates ✅

---

## 🧪 Testing Checklist

### Manual Testing
- [ ] **Create automation:** Enter prompt → verify created in list
- [ ] **Pause automation:** Click pause → verify status badge updates
- [ ] **Resume automation:** Click resume → verify status badge updates
- [ ] **Delete automation:** Click delete → confirm → verify removed from list
- [ ] **View history:** Click history tab → verify runs displayed
- [ ] **View run details:** Click run → verify steps displayed
- [ ] **Connect service:** Click connect → complete OAuth → verify in connections list
- [ ] **Disconnect service:** Click disconnect → confirm → verify removed

### Error Handling Tests
- [ ] **Invalid token:** Log out → try API call → verify 401 handling
- [ ] **Invalid prompt:** Create automation with bad prompt → verify error message shown
- [ ] **Network error:** Disconnect internet → try action → verify graceful error
- [ ] **Missing connection:** Create automation without connecting service → verify error

### Performance Tests
- [ ] **API response times:** Verify all endpoints respond in <2s
- [ ] **Webhook indicator:** Verify "Webhook received" shows in <500ms
- [ ] **Polling:** Verify run status updates within 5s of completion
- [ ] **UI responsiveness:** Verify no blocking operations during API calls

---

## 🎯 Key Integration Points

### Critical: 202 Accepted Webhook Pattern
**Backend returns 202 immediately, processes asynchronously**

**Bad Implementation (blocking UI):**
```javascript
// ❌ Don't do this - user waits for full processing
const response = await createAutomation(name, prompt);
alert('Automation executed!'); // This will take 2-5 seconds
```

**Good Implementation (non-blocking):**
```javascript
// ✅ Do this - show immediate feedback, poll for results
const response = await createAutomation(name, prompt);
setStatus('Automation created! Waiting for first trigger...');

// Poll for first execution (optional)
const run = await pollForRun(response.unit.id);
if (run) {
  setStatus(run.status === 'completed' ? 'Success!' : 'Failed');
}
```

### Status Badges
```javascript
const StatusBadge = ({ status }) => {
  const colors = {
    active: 'green',
    paused: 'yellow',
    disabled: 'gray',
    completed: 'green',
    failed: 'red',
    running: 'blue'
  };

  return <Badge color={colors[status]}>{status}</Badge>;
};
```

### Error Message Display
```javascript
const handleAPIError = (error) => {
  // error.message contains backend error text
  toast.error(error.message || 'Something went wrong');
};
```

---

## 📊 Performance Expectations

| Operation | Expected Time | User Experience |
|-----------|--------------|-----------------|
| Create automation | 1-3s | Show loading spinner |
| List automations | <500ms | Instant load |
| Pause/Resume | <200ms | Instant update |
| View history | <500ms | Instant load |
| Webhook trigger | <200ms | "Received" indicator |
| Automation execution | 2-5s | Poll for completion |

---

## 🆘 Common Issues & Solutions

### Issue: 401 Unauthorized
**Solution:** Check Firebase token is valid and included in headers
```javascript
const token = await firebase.auth().currentUser.getIdToken(true); // Force refresh
```

### Issue: "No connection found for provider"
**Solution:** User needs to connect service via Nango first
```javascript
if (error.message.includes('No connection found')) {
  navigate('/connections'); // Redirect to connections page
}
```

### Issue: Automation doesn't execute
**Checklist:**
1. Is automation status "active"? (not paused/disabled)
2. Is the service connected? (check `/connections`)
3. Did webhook trigger? (check webhook logs in backend)
4. Did automation match? (check run history)

### Issue: Slow API responses
**Solution:** Backend caching is working, but Nango API (external) adds latency
- This is expected and acceptable (<2s for most operations)
- Show loading indicators during API calls
- Use optimistic UI updates where possible

---

## ✅ Definition of Done

### Phase 1 ✓
- [ ] User can log in with Firebase
- [ ] API client works with authentication
- [ ] 401 errors handled gracefully

### Phase 2 ✓
- [ ] User can create automation from natural language prompt
- [ ] User can view list of all automations
- [ ] User can pause/resume/delete automations
- [ ] Error messages shown for invalid prompts

### Phase 3 ✓
- [ ] User can view automation execution history
- [ ] User can see detailed steps for each run
- [ ] Status badges shown correctly (running/completed/failed)

### Phase 4 ✓
- [ ] User can see connected services
- [ ] User can connect new services via Nango OAuth
- [ ] User can disconnect services

### Phase 5 ✓
- [ ] User sees "Webhook received" immediately after trigger
- [ ] User sees "Processing..." while automation executes
- [ ] User sees "Completed!" when automation finishes
- [ ] History auto-refreshes to show new runs

---

## 📞 Support

**Questions?** Check:
1. [UI_INTEGRATION_CONTRACT.md](UI_INTEGRATION_CONTRACT.md) - Full API documentation
2. [ENHANCEMENTS_IMPLEMENTED.md](ENHANCEMENTS_IMPLEMENTED.md) - Performance details
3. Backend logs: `npm run dev` (see console output)
4. Test suite: `npm run test:cortex` (69/69 passing)

**Ready to start?** Begin with Phase 1! 🚀
