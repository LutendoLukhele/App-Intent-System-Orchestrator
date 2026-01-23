# Cortex Integration - Complete ✅

## Overview

Cortex is now fully integrated into your backend system. It's an AI-driven reactive automation system that allows users to create automations in plain English.

## What Was Implemented

### 1. Database Schema ✅
- **Tables Created:**
  - `connections` - User provider connections (Gmail, Salesforce, etc.)
  - `units` - User-defined automations
  - `runs` - Execution history
  - `run_steps` - Detailed step logs

- **Migration:** `migrations/001_cortex.sql` has been run successfully

### 2. Core Cortex Components ✅

#### Store (`src/cortex/store.ts`)
- Hybrid Redis + Postgres storage
- Event deduplication
- Unit management (CRUD)
- Run state tracking
- Waiting runs index

#### Compiler (`src/cortex/compiler.ts`)
- Natural language → structured Unit compilation
- Uses Groq LLM (llama-3.1-70b-versatile)
- Converts user prompts like:
  - "When I receive an email, summarize it and send to Slack"
  - Into executable automation plans

#### Matcher (`src/cortex/matcher.ts`)
- Event → matching Units → Runs
- Filter evaluation (JavaScript expressions)
- Semantic condition evaluation (LLM-powered)
- Creates runs for matching events

#### Runtime (`src/cortex/runtime.ts`)
- Executes automation runs step-by-step
- Handles LLM actions (summarize, draft_reply, etc.)
- Executes tool actions via ToolOrchestrator
- Supports wait actions with resume capability
- Template variable resolution

#### Poller (`src/cortex/poller.ts`)
- Polls connected providers (Gmail, Calendar, Salesforce)
- Emits rich semantic events
- Configurable polling interval (default: 60 seconds)
- Error handling and connection health tracking

#### Tool Executor (`src/cortex/tools.ts`)
- Bridges Cortex to existing ToolOrchestrator
- **Comprehensive tool mapping for:**
  - Gmail/Email (send, reply, fetch)
  - Google Calendar (create, update, fetch events)
  - Salesforce (create/update/fetch all entity types)
  - Notion (create, update, fetch pages)
  - Outlook (email, events, contacts)
  - Slack (send messages)

#### API Routes (`src/cortex/routes.ts`)
- `POST /api/cortex/units` - Create automation
- `GET /api/cortex/units` - List user's automations
- `GET /api/cortex/units/:id` - Get single automation
- `PATCH /api/cortex/units/:id/status` - Pause/resume/disable
- `DELETE /api/cortex/units/:id` - Delete automation
- `GET /api/cortex/runs` - Get execution history
- `GET /api/cortex/runs/:id` - Get run details
- `POST /api/cortex/runs/:id/rerun` - Re-run automation

### 3. Integration with Existing System ✅

#### In `src/index.ts` (lines 115-175):
```typescript
// Cortex initialization
const cortexStore = new HybridStore(redis, sql);
const cortexCompiler = new Compiler(CONFIG.GROQ_API_KEY);
const cortexMatcher = new Matcher(cortexStore, CONFIG.GROQ_API_KEY);
const toolExecutor = new CortexToolExecutor(toolOrchestrator);
const cortexRuntime = new Runtime(cortexStore, CONFIG.GROQ_API_KEY, toolExecutor, logger);

// Event processor
async function processCortexEvent(event: CortexEvent): Promise<void> {
  const written = await cortexStore.writeEvent(event);
  if (!written) return; // Deduplicated

  const runs = await cortexMatcher.match(event);
  for (const run of runs) {
    cortexRuntime.execute(run).catch(err => {
      logger.error('Run execution failed', { run_id: run.id, error: err.message });
    });
  }
}

// Poller start
const poller = new Poller(redis, sql, nangoPoller, processCortexEvent, logger);
poller.start(60_000); // Poll every 60 seconds

// Waiting runs scheduler
setInterval(() => {
  cortexRuntime.resumeWaitingRuns().catch(err => {
    logger.error('Resume waiting runs failed', { error: err.message });
  });
}, 60_000);

// Mount Cortex routes
app.use('/api/cortex', createCortexRouter(cortexStore, cortexCompiler, cortexRuntime));
```

### 4. Connection Management ✅

New endpoints in `index.ts`:
- `POST /api/connections` - Register provider connection
- `GET /api/connections` - Get user connections

### 5. Testing Infrastructure ✅

#### Migration Script
```bash
npx ts-node scripts/run-migration.ts
```

#### Comprehensive Test Suite
```bash
npx ts-node scripts/test-cortex.ts
```

Tests cover:
- Unit creation (prompt and structured formats)
- Unit listing
- Unit status management (pause/resume)
- Execution history
- Database verification

## How to Use Cortex

### 1. Register a Connection

```bash
curl -X POST http://localhost:8080/api/connections \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google-mail",
    "connectionId": "your-nango-connection-id"
  }'
```

### 2. Create an Automation

**Option A: Natural Language Prompt**
```bash
curl -X POST http://localhost:8080/api/cortex/units \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "When I receive an email from my boss, summarize it and send the summary to Slack #urgent"
  }'
```

**Option B: Structured Format**
```bash
curl -X POST http://localhost:8080/api/cortex/units \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "when": "a Salesforce opportunity closes over $10,000",
    "then": "post a celebration message to Slack #wins channel"
  }'
```

### 3. List Your Automations

```bash
curl -X GET http://localhost:8080/api/cortex/units \
  -H "x-user-id: user123"
```

### 4. Pause/Resume an Automation

```bash
curl -X PATCH http://localhost:8080/api/cortex/units/{unit-id}/status \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'
```

### 5. View Execution History

```bash
curl -X GET http://localhost:8080/api/cortex/runs \
  -H "x-user-id: user123"
```

## Example Automations

### 1. Email Summarization
```json
{
  "when": "I receive an email",
  "then": "summarize it and send the summary to Slack #inbox"
}
```

Compiles to:
- **Trigger:** `gmail.email_received`
- **Actions:**
  1. LLM: summarize email body
  2. Tool: slack.send to #inbox

### 2. Deal Notifications
```json
{
  "when": "a Salesforce opportunity closes",
  "if": "the amount is over $10,000",
  "then": "post to Slack #wins"
}
```

Compiles to:
- **Trigger:** `salesforce.opportunity_closed_won`
- **Condition:** `payload.amount > 10000`
- **Actions:**
  1. Tool: slack.send celebration message

### 3. Lead Follow-up
```json
{
  "when": "a lead stage changes to stalled",
  "then": "wait 48 hours, then create a follow-up task in Salesforce"
}
```

Compiles to:
- **Trigger:** `salesforce.lead_stage_changed` with filter `payload.to === 'stalled'`
- **Actions:**
  1. Wait: 48h
  2. Tool: salesforce.create_task

## Event Types Supported

### Gmail
- `email_received` - New email from someone else
- `email_sent` - User sent an email
- `email_reply_received` - Reply in existing thread

### Google Calendar
- `event_created` - New calendar event
- `event_updated` - Event details changed
- `event_deleted` - Event removed
- `event_starting` - Event starts within 15 min
- `event_rsvp_changed` - Attendee response changed

### Salesforce
- `lead_created` - New lead
- `lead_stage_changed` - Lead status changed
- `lead_converted` - Lead was converted
- `opportunity_created` - New opportunity
- `opportunity_stage_changed` - Opportunity stage changed
- `opportunity_amount_changed` - Deal amount changed
- `opportunity_closed_won` - Deal marked closed won
- `opportunity_closed_lost` - Deal marked closed lost

## Action Types Supported

### LLM Actions
- `summarize` - Condense content
- `draft_reply` - Write email response
- `extract_action_items` - List TODOs from text
- `analyze_sentiment` - Positive/negative/neutral

### Tool Actions
All existing tools are available via Cortex:
- Email: send, reply, fetch
- Calendar: create, update, fetch events
- Salesforce: create, update, fetch all entities
- Notion: create, update, fetch pages
- Outlook: all email/calendar/contact operations
- Slack: send messages

### Wait Actions
- Syntax: `"wait 48h"`, `"wait 7d"`, `"wait 2w"`
- Run pauses and resumes after duration

## Architecture

```
User Input (Natural Language)
         ↓
    Compiler (LLM)
         ↓
    Unit (Structured Automation)
         ↓
    Store (Postgres + Redis)

Poller → Events → Matcher → Runs → Runtime → Tools
                     ↑                   ↓
                   Units              Results
```

## Files Modified/Created

### New Files
- `src/cortex/types.ts` - Type definitions
- `src/cortex/store.ts` - Hybrid storage
- `src/cortex/compiler.ts` - Natural language compiler
- `src/cortex/matcher.ts` - Event matching
- `src/cortex/runtime.ts` - Execution engine
- `src/cortex/poller.ts` - Provider polling
- `src/cortex/tools.ts` - Tool executor bridge
- `src/cortex/routes.ts` - API routes
- `migrations/001_cortex.sql` - Database schema
- `scripts/run-migration.ts` - Migration runner
- `scripts/test-cortex.ts` - Test suite

### Modified Files
- `src/index.ts` - Cortex initialization and integration

## Next Steps

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Run tests:**
   ```bash
   npx ts-node scripts/test-cortex.ts
   ```

3. **Create your first automation:**
   ```bash
   curl -X POST http://localhost:8080/api/cortex/units \
     -H "x-user-id: your-user-id" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Your automation in plain English"}'
   ```

4. **Monitor execution:**
   - Check logs for event processing
   - Query `/api/cortex/runs` for execution history
   - Use `/api/cortex/units` to manage automations

## Testing with Fast Polling ⚡

For **faster testing** (5 second polling instead of 60 seconds):

The `.env` file is already configured with fast polling:
```bash
CORTEX_POLL_INTERVAL_MS=5000  # 5 seconds
```

Just start your server normally:
```bash
npm run dev
```

**For production**, change to:
```bash
CORTEX_POLL_INTERVAL_MS=60000  # 60 seconds
```

Or use the helper script:
```bash
./scripts/dev-cortex-fast.sh  # Starts with 5-second polling
```

## Production Considerations

1. **Polling Frequency:**
   - **Testing:** 5 seconds (`CORTEX_POLL_INTERVAL_MS=5000`)
   - **Production:** 60 seconds (`CORTEX_POLL_INTERVAL_MS=60000`)
   - Configurable via environment variable

2. **LLM Costs:** Compiler and semantic conditions use Groq. Monitor usage.

3. **Error Handling:** All errors are logged. Consider adding error notifications for critical failures.

4. **Scaling:**
   - Redis handles event deduplication and waiting runs
   - Postgres stores persistent data
   - Poller can be scaled horizontally with coordination

5. **Security:**
   - All endpoints require `x-user-id` header
   - Validate user ownership of Units before operations
   - Consider rate limiting on Unit creation

## Support

For issues or questions:
1. Check logs for detailed error messages
2. Verify database tables exist: `SELECT * FROM units LIMIT 1;`
3. Test individual components with test scripts
4. Review this documentation for API usage

---

**Status:** ✅ Fully Operational

**Last Updated:** 2025-12-08

**Version:** 1.0.0
