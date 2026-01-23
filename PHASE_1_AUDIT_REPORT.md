# Phase 1: System Audit Report

**Status**: ✅ Complete  
**Date**: December 8, 2025  
**Findings**: System is ~70% ready for Cortex integration

---

## Executive Summary

Your backend has **excellent foundation** for Cortex integration:

✅ **Nango API layer** is fully implemented with comprehensive provider support  
✅ **Database schema** already has Cortex tables (`units`, `runs`, `run_steps`, `connections`)  
✅ **Tool orchestration** exists but needs Cortex-specific mapping layer  
✅ **Storage layer** (Redis + Postgres) is wired up  
✅ **Core Cortex components** (types, compiler, store) are scaffolded  

⚠️ **Gaps to fill**:
- Store.ts has incomplete method implementations
- Poller.ts needs completion
- Runtime.ts needs completion
- Tool mapping for Cortex actions not yet defined
- Routes not fully implemented

---

## 1. NangoService Interface ✅

**File**: `src/services/NangoService.ts` (658 lines)  
**Status**: Excellent

### Interface Summary

```typescript
class NangoService {
  // Core API method
  async get(opts: {
    endpoint: string;
    connectionId: string;
    providerConfigKey: string;
  }): Promise<any>

  // Provider-specific actions
  async fetchEmails(providerConfigKey, connectionId, input): Promise<any>
  async fetchCalendarEvents(providerConfigKey, connectionId, args): Promise<any>
  async createCalendarEvent(providerConfigKey, connectionId, args): Promise<any>
  async updateCalendarEvent(providerConfigKey, connectionId, args): Promise<any>
  
  async triggerSalesforceAction(providerConfigKey, connectionId, actionPayload): Promise<any>
  async triggerOutlookAction(providerConfigKey, connectionId, actionPayload): Promise<any>
  
  async sendEmail(providerConfigKey, connectionId, payload): Promise<any>
  
  // Connection warming
  async warmConnection(providerConfigKey, connectionId, force?): Promise<boolean>
  public getWarmupManager(): SessionAwareWarmupManager
}
```

### Key Capabilities

| Provider | Methods | Status |
|----------|---------|--------|
| Gmail | fetchEmails, sendEmail | ✅ Full |
| Google Calendar | fetchCalendarEvents, createCalendarEvent, updateCalendarEvent | ✅ Full |
| Salesforce | triggerSalesforceAction (fetch/create/update) | ✅ Full |
| Outlook | triggerOutlookAction, fetchOutlookEventBody | ✅ Full |
| Notion | triggerGenericNangoAction | ✅ Generic |
| Slack | triggerGenericNangoAction | ✅ Generic |
| Zoom | triggerGenericNangoAction | ✅ Generic |

### How Cortex Uses NangoService

**Poller** calls:
```typescript
// Fetch new emails
const emails = await nangoService.fetchEmails('google-mail', connectionId, {
  filters: { after: lastSyncTime }
});

// Fetch calendar events
const events = await nangoService.fetchCalendarEvents('google-calendar', connectionId, {
  timeMin: lastSyncTime
});

// Fetch Salesforce opportunities
const opps = await nangoService.triggerSalesforceAction('salesforce-2', connectionId, {
  operation: 'fetch',
  entityType: 'Opportunity'
});
```

**Runtime** calls via ToolOrchestrator:
```typescript
// Send email
await toolOrchestrator.executeTool({
  name: 'send_email',
  arguments: { to, subject, body }
});
// Routes to: nangoService.sendEmail(...)

// Create Salesforce opportunity
await toolOrchestrator.executeTool({
  name: 'create_entity',
  arguments: { entityType: 'Opportunity', fields: {...} }
});
// Routes to: nangoService.triggerSalesforceAction(...)
```

### Integration Status: ✅ Ready

The NangoService is **production-ready** for Cortex. Poller and Runtime can call it directly.

---

## 2. ToolOrchestrator Interface ✅

**File**: `src/services/tool/ToolOrchestrator.ts` (377 lines)  
**Status**: Good, but needs Cortex-specific wrappers

### Interface Summary

```typescript
class ToolOrchestrator extends BaseService {
  async executeTool(
    toolCall: ToolCall,
    planId: string,
    stepId: string
  ): Promise<ToolResult>
}

interface ToolCall {
  id?: string;
  name: string;  // Tool name (e.g., 'fetch_emails', 'create_entity')
  arguments: { input?: Record<string, any> } | Record<string, any>;
  userId: string;
}

interface ToolResult {
  status: 'success' | 'failed';
  toolName: string;
  data: any;
  error?: string;
}
```

### Tool Dispatcher Logic

ToolOrchestrator has a **massive switch statement** that routes tools:

```typescript
switch (toolName) {
  case 'send_email':
    return nangoService.sendEmail(providerConfigKey, connectionId, args);
  case 'fetch_emails':
    return nangoService.fetchEmails(providerConfigKey, connectionId, args);
  case 'create_entity':
  case 'update_entity':
  case 'fetch_entity':
    return nangoService.triggerSalesforceAction(providerConfigKey, connectionId, args);
  case 'fetch_calendar_events':
    return nangoService.fetchCalendarEvents(providerConfigKey, connectionId, args);
  case 'create_calendar_event':
    return nangoService.createCalendarEvent(providerConfigKey, connectionId, args);
  // ... more tools
}
```

### How Cortex Uses ToolOrchestrator

**Runtime** wraps tool calls:

```typescript
// Cortex action: { type: 'slack', channel: '#alerts', message: '...' }
// Becomes tool call:
const result = await toolOrchestrator.executeTool({
  name: 'send_slack_message',
  arguments: { channel: '#alerts', text: '...' },
  userId: cortexContext.userId
}, planId, stepId);
```

### Integration Status: ✅ Ready

ToolOrchestrator is **ready to execute Cortex tools**. Just needs a **mapping layer** (ToolMapperService) to convert Cortex action syntax → ToolCall.

---

## 3. Tool Configuration ✅

**File**: `config/tool-config.json` (1345 lines)  
**Status**: Comprehensive, need to extract for Cortex

### Tool Categories in tool-config.json

| Category | Count | Examples |
|----------|-------|----------|
| Email (Gmail) | 5+ | fetch_emails, send_email, ... |
| Calendar (Google) | 5+ | fetch_calendar_events, create_calendar_event, ... |
| Salesforce CRM | 6+ | fetch_entity, create_entity, update_entity, ... |
| Outlook | 4+ | fetch_outlook_entity, create_outlook_entity, ... |
| Notion | 5+ | fetch_notion_page, create_notion_page, ... |
| Meta | 1 | request_missing_parameters |

### For Cortex, Tools Map Like This:

| Cortex Action Type | Tool Name | Provider |
|-------------------|-----------|----------|
| `slack.send` | send_slack_message (custom) | slack |
| `gmail.send` | send_email | google-mail |
| `gmail.reply` | send_email | google-mail |
| `gmail.fetch` | fetch_emails | google-mail |
| `calendar.create` | create_calendar_event | google-calendar |
| `calendar.fetch` | fetch_calendar_events | google-calendar |
| `salesforce.update_lead` | update_entity | salesforce-2 |
| `salesforce.create_task` | create_entity | salesforce-2 |
| `notion.create_page` | create_notion_page | notion |
| `outlook.send_email` | send_email (outlook) | outlook |

### Integration Status: ⚠️ Mapping Needed

Need to create `CORTEX_TOOL_MAP` that bridges Cortex action syntax → tool-config tools.

---

## 4. User & Connection Storage ✅

**File**: `migrations/001_cortex.sql`  
**Status**: Schema exists, implementation gaps

### Database Schema

```sql
-- Connections table (already exists)
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'gmail', 'salesforce-2', etc
  connection_id TEXT NOT NULL,  -- From Nango
  enabled BOOLEAN DEFAULT true,
  last_poll_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Units table (automations)
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  raw_when TEXT NOT NULL,     -- User's original "when" text
  raw_if TEXT,                -- User's original "if" text
  raw_then TEXT NOT NULL,     -- User's original "then" text
  compiled_when JSONB NOT NULL,
  compiled_if JSONB DEFAULT '[]',
  compiled_then JSONB NOT NULL,
  status TEXT DEFAULT 'active',
  trigger_source TEXT,        -- 'gmail', 'salesforce', etc
  trigger_event TEXT,         -- 'email_received', etc
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
);

-- Runs table (execution history)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  context JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT
);

-- Run steps (detailed logs)
CREATE TABLE IF NOT EXISTS run_steps (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL,
  status TEXT NOT NULL,
  result JSONB,
  error TEXT,
  UNIQUE(run_id, step_index)
);
```

### How Connections Work

**ToolOrchestrator** resolves connections:

```typescript
private async resolveConnectionId(userId: string, providerConfigKey: string): Promise<string | null> {
  const rows = await sql`
    SELECT connection_id FROM user_connections 
    WHERE user_id = ${userId} AND provider = ${providerConfigKey}
  `;
  return rows[0]?.connection_id || null;
}
```

⚠️ **Gap**: Query uses `user_connections` but schema has `connections`. Need to align table names.

### Integration Status: ⚠️ Schema OK, Query Alignment Needed

---

## 5. Auth Context Flow ✅

**File**: `src/index.ts`  
**Status**: Good

### How User ID Flows Through System

```typescript
// 1. Express request (Firebase auth)
app.use(authMiddleware);  // Extracts user from Firebase token
// req.user = { uid: 'user_123', ... }

// 2. ToolCall includes userId
const toolCall: ToolCall = {
  name: 'fetch_emails',
  arguments: { ... },
  userId: req.user.uid  // ✅ User context preserved
};

// 3. ToolOrchestrator uses it
async executeTool(toolCall: ToolCall, ...) {
  const connectionId = await this.resolveConnectionId(
    toolCall.userId,  // ✅ User-scoped lookup
    providerConfigKey
  );
}
```

### For Cortex

Routes need to extract user from headers/session:

```typescript
// Cortex route
app.post('/api/cortex/units', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.user?.uid;  // Extract user
  const prompt = req.body.prompt;
  
  const unit = await cortexCompiler.compile(prompt, userId);
  await cortexStore.saveUnit(unit);
  
  res.json({ unit });
});
```

### Integration Status: ✅ Ready

Auth context is clear. Cortex routes just need to follow the same pattern.

---

## 6. Redis & Postgres Setup ✅

**File**: `src/index.ts`  
**Status**: Fully configured

### Storage Initialization

```typescript
import Redis from 'ioredis';
import { neon } from '@neondatabase/serverless';

const redis = new Redis(CONFIG.REDIS_URL);
const sql = neon(process.env.DATABASE_URL);
```

### Usage Patterns

**Redis** (fast, temporary):
```typescript
// Deduplication
await redis.set(`dedupe:${key}`, '1', 'EX', 86400 * 7);

// Event publishing
await redis.publish(`events:${userId}`, JSON.stringify(event));

// Cache
await redis.setex(`cache:${key}`, 3600, JSON.stringify(data));
```

**Postgres** (persistent):
```typescript
// Queries
const units = await sql`
  SELECT * FROM units WHERE owner_id = ${userId}
`;

// Insert
await sql`
  INSERT INTO units (id, owner_id, name, ...)
  VALUES (${id}, ${userId}, ${name}, ...)
`;
```

### Integration Status: ✅ Ready

Both Redis and Postgres are **production-ready** for Cortex.

---

## 7. Cortex Components Status

### 7.1 Types ✅

**File**: `src/cortex/types.ts` (183 lines)  
**Status**: Good

Defines:
- `Event<T>` — Rich event from poller
- `Unit` — Automation definition
- `Trigger` — When automation fires
- `Condition` — Must be true
- `Action` — What to execute
- `Run` — Execution record

✅ **Ready for use**

### 7.2 Compiler ✅

**File**: `src/cortex/compiler.ts` (233 lines)  
**Status**: Good foundation

```typescript
class Compiler {
  constructor(groqApiKey: string) { ... }
  
  async compile(
    input: string | { when, if, then },
    userId: string
  ): Promise<CompileResult>
}

type CompileResult = 
  | { type: 'unit'; unit: Unit }
  | { type: 'clarification'; question: string };
```

✅ **Ready to use**. System prompt is comprehensive.

### 7.3 Store ⚠️

**File**: `src/cortex/store.ts` (196 lines)  
**Status**: Incomplete

```typescript
class HybridStore {
  // ✅ Events (Redis)
  async writeEvent(event: Event): Promise<boolean> { ... }
  async getEvent(eventId: string): Promise<Event | null> { ... }

  // ⚠️ Units (Postgres) — INCOMPLETE
  async saveUnit(unit: Unit): Promise<void> { /* STUB */ }
  async getUnit(unitId: string): Promise<Unit | null> { /* NOT IMPL */ }
  async listUnits(userId: string): Promise<Unit[]> { /* NOT IMPL */ }
  
  // ⚠️ Runs (Postgres) — INCOMPLETE
  async saveRun(run: Run): Promise<void> { /* STUB */ }
  async getRun(runId: string): Promise<Run | null> { /* NOT IMPL */ }
}
```

**Gap**: `saveUnit` has incomplete INSERT logic, many methods missing.

### 7.4 Poller ⚠️

**File**: `src/cortex/poller.ts`  
**Status**: Scaffolded but incomplete

**Has**: Constructor, start/stop methods, event emission  
**Missing**: Actual polling logic, event enrichment, deduplication

### 7.5 Matcher ⚠️

**File**: `src/cortex/matcher.ts`  
**Status**: Scaffolded

**Has**: Class structure  
**Missing**: Event → Unit matching, condition evaluation

### 7.6 Runtime ⚠️

**File**: `src/cortex/runtime.ts`  
**Status**: Scaffolded

**Has**: Class structure  
**Missing**: Action execution, step logging, error handling

### 7.7 Routes ⚠️

**File**: `src/cortex/routes.ts`  
**Status**: Scaffolded

**Has**: Route definitions  
**Missing**: Handler implementations

---

## 8. Integration in index.ts ✅

**Lines 150-180**: Cortex is already initialized!

```typescript
// ✅ Cortex components created
const cortexStore = new HybridStore(redis, sql);
const cortexCompiler = new Compiler(CONFIG.GROQ_API_KEY);
const cortexMatcher = new Matcher(cortexStore, CONFIG.GROQ_API_KEY);
const cortexRuntime = new Runtime(cortexStore, CONFIG.GROQ_API_KEY, toolExecutor, logger);

// ✅ Event processor defined
async function processCortexEvent(event: CortexEvent): Promise<void> {
  const written = await cortexStore.writeEvent(event);
  if (!written) return;  // Deduplicated
  
  const runs = await cortexMatcher.match(event);
  for (const run of runs) {
    cortexRuntime.execute(run).catch(err => logger.error('Run failed', err));
  }
}
```

✅ **Wiring already exists**. Just needs completion of store/poller/runtime implementations.

---

## Summary of Gaps

### Critical (Block Deployment)
- [ ] Complete `HybridStore` methods (saveUnit, getUnit, listUnits, saveRun, getRun, getRunStep)
- [ ] Complete `Poller` polling loop and event enrichment
- [ ] Complete `Runtime` action execution
- [ ] Implement `ToolMapperService` for Cortex → existing tools
- [ ] Complete `routes.ts` handlers

### Important (Before Production)
- [ ] Fix table name mismatch: `user_connections` → `connections`
- [ ] Validate all provider mappings (Gmail, Salesforce, Outlook, Calendar, Notion)
- [ ] Add error handling in poller
- [ ] Add logging to runtime
- [ ] Test end-to-end flow

### Nice-to-Have
- [ ] Create dashboard for unit management
- [ ] Add analytics for automation usage
- [ ] Create Slack integration for notifications

---

## Recommended Next Steps

### Immediate (Phase 2-3)

1. **Complete HybridStore** (`src/cortex/store.ts`)
   - Implement all database methods
   - Add proper error handling
   - Test with real database

2. **Create ToolMapperService** (`src/services/cortex/ToolMapperService.ts`)
   - Map Cortex actions → tool-config tools
   - Validate action availability
   - Transform arguments

3. **Complete Poller** (`src/cortex/poller.ts`)
   - Wire to NangoService
   - Poll each provider per connection
   - Emit rich events

4. **Complete Runtime** (`src/cortex/runtime.ts`)
   - Execute action chains
   - Handle step state
   - Call ToolOrchestrator

5. **Implement Routes** (`src/cortex/routes.ts`)
   - POST /api/cortex/units (create)
   - GET /api/cortex/units (list)
   - PATCH /api/cortex/units/:id/status (toggle)
   - GET /api/cortex/runs (history)

### Testing
- Unit tests for each component
- Integration tests for full flow
- Manual testing with real accounts

---

## Files Needing Work

```
Priority 1 (Blocking):
├── src/cortex/store.ts          (⚠️ Incomplete methods)
├── src/cortex/poller.ts         (⚠️ No polling logic)
├── src/cortex/runtime.ts        (⚠️ No action execution)
├── src/cortex/routes.ts         (⚠️ No handlers)
└── src/services/cortex/ToolMapperService.ts (📋 Create new)

Priority 2 (Important):
├── migrations/001_cortex.sql    (⚠️ Table name alignment)
└── src/index.ts                 (✅ Mostly done, just complete wiring)

Priority 3 (Nice):
├── docs/CORTEX_API.md           (📋 Create)
├── docs/CORTEX_USER_GUIDE.md    (📋 Create)
└── tests/cortex/*.test.ts       (📋 Create test suite)
```

---

## Conclusion

Your system is **~70% ready** for Cortex. The heavy lifting (NangoService, ToolOrchestrator, storage) is done. Now it's just connecting the pieces:

1. **Store** — Complete database methods
2. **ToolMapper** — Create action mapping layer
3. **Poller** — Implement polling loop
4. **Runtime** — Implement action execution
5. **Routes** — Implement API endpoints

All components have clear interfaces and dependencies. Should be **~3-5 days** of focused work to make Cortex production-ready.
