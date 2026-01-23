# Cortex Integration Checklist

**Status**: Ready for IDE Agent Implementation  
**Last Updated**: December 8, 2025  
**Target**: Full Cortex integration with existing backend system

---

## Phase 1: System Audit & Discovery

### 1.1 NangoService Audit
- [ ] Review `src/services/NangoService.ts` for:
  - [ ] Primary proxy method name (`proxy()`, `get()`, `request()`?)
  - [ ] Method signature and parameters
  - [ ] Return type and error handling
  - [ ] Authentication mechanism
  - [ ] Rate limiting handling
  - [ ] Example usage patterns

**Deliverable**: `NANGO_INTERFACE.md` documenting the interface

**Questions to Answer**:
```typescript
// What's the actual signature?
interface NangoProxy {
  methodName(opts: {
    endpoint: string;
    params?: Record<string, any>;
    connectionId: string;
    providerConfigKey: string;
  }): Promise<any>;
}
```

---

### 1.2 ToolOrchestrator Audit
- [ ] Review `src/services/tool/ToolOrchestrator.ts` for:
  - [ ] Primary execution method name
  - [ ] How tools are identified (by name, provider, ID?)
  - [ ] How arguments are passed
  - [ ] How user context is provided (userId, session, token?)
  - [ ] Return type (result, error handling)
  - [ ] Available hooks/filters
  - [ ] Example usage patterns

**Deliverable**: `TOOL_ORCHESTRATOR_INTERFACE.md`

**Questions to Answer**:
```typescript
// What's the actual signature?
interface ToolExecutor {
  execute(
    toolIdentifier: string | { name: string; provider: string },
    args: Record<string, any>,
    context: { userId: string; ... }
  ): Promise<any>;
}
```

---

### 1.3 Tool Configuration Audit
- [ ] Parse `config/tool-config.json` and extract:
  - [ ] All available tools
  - [ ] Tool names and aliases
  - [ ] Required/optional parameters per tool
  - [ ] Provider associations
  - [ ] Icon/category metadata

**Deliverable**: `TOOL_MAPPING.ts` with complete Cortex → existing tool mapping

**Output Format**:
```typescript
export const CORTEX_TOOL_MAP: Record<string, ToolMapping> = {
  'slack.send': {
    name: '???',
    provider: 'slack',
    requiredArgs: ['message', 'channel'],
    optionalArgs: ['thread_ts', 'blocks'],
    transform: (cortexArgs) => ({ ... })
  },
  'gmail.send': { ... },
  'gmail.reply': { ... },
  'salesforce.update_lead': { ... },
  'salesforce.create_task': { ... },
  'notion.create_page': { ... },
  'calendar.create': { ... },
  // ... complete list
};
```

---

### 1.4 User & Connection Storage Audit
- [ ] Review database schema for:
  - [ ] `users` table structure
  - [ ] `connections` table (does it exist?)
  - [ ] How provider connections are stored
  - [ ] How connectionId is generated/tracked
  - [ ] How to query user's connections by provider

- [ ] Review Firebase auth integration (if used):
  - [ ] How user ID is resolved
  - [ ] How auth context flows to services
  - [ ] How to validate user sessions in Cortex

**Deliverable**: `CONNECTION_STORAGE.md` + SQL schema doc

**Key Questions**:
```sql
-- Do these tables exist?
SELECT * FROM connections WHERE user_id = ? AND provider = ?;
SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ?;

-- Or is connection storage elsewhere?
-- How is connectionId linked to user?
```

---

### 1.5 Auth Context Flow Audit
- [ ] How is user ID passed through requests?
  - [ ] `x-user-id` header?
  - [ ] Session cookie?
  - [ ] Firebase token?
  - [ ] Custom auth middleware?

- [ ] How do services access user context?
  - [ ] Middleware pattern?
  - [ ] DI container?
  - [ ] Request scoping?

**Deliverable**: `AUTH_CONTEXT_FLOW.md`

---

### 1.6 Existing Redis & Postgres Setup Audit
- [ ] Redis:
  - [ ] Connection established in `index.ts`?
  - [ ] Existing namespacing pattern?
  - [ ] TTL policy?
  - [ ] Example usage in codebase?

- [ ] Postgres:
  - [ ] Migration system (Drizzle, TypeORM, raw migrations)?
  - [ ] Current schema
  - [ ] Connection pool settings
  - [ ] Example queries

**Deliverable**: `STORAGE_SETUP.md`

---

## Phase 2: Database Setup

### 2.1 Create Cortex Database Tables
- [ ] Create migration file `migrations/002_cortex_tables.sql` with:
  - [ ] `cortex_units` table (user automations)
  - [ ] `cortex_runs` table (execution history)
  - [ ] `cortex_run_steps` table (detailed logs)
  - [ ] `cortex_connections` table (provider auth per user)
  - [ ] Indexes on user_id, status, created_at
  - [ ] Foreign key constraints

**Deliverable**: `migrations/002_cortex_tables.sql`

**Schema Outline**:
```sql
CREATE TABLE cortex_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  raw_prompt TEXT NOT NULL,  -- Store original user input
  
  -- Compiled structure
  trigger JSONB NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE cortex_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  
  trigger_source TEXT,  -- 'email', 'calendar', etc
  trigger_payload JSONB,  -- Full event data
  
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'success', 'failed', 'paused')),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error TEXT,
  
  FOREIGN KEY (unit_id) REFERENCES cortex_units(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE cortex_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  step_index INTEGER,
  
  action_type TEXT,  -- 'llm', 'slack', 'email', etc
  action_input JSONB,
  action_output JSONB,
  
  status TEXT,  -- 'pending', 'in_progress', 'success', 'failed'
  error TEXT,
  duration_ms INTEGER,
  
  FOREIGN KEY (run_id) REFERENCES cortex_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_cortex_units_user ON cortex_units(user_id);
CREATE INDEX idx_cortex_units_status ON cortex_units(status);
CREATE INDEX idx_cortex_runs_unit ON cortex_runs(unit_id);
CREATE INDEX idx_cortex_runs_user ON cortex_runs(user_id);
```

---

### 2.2 Create Cortex Connections Table (Optional)
- [ ] If connections not already centralized, create:
  ```sql
  CREATE TABLE cortex_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,  -- 'gmail', 'salesforce', etc
    connection_id TEXT NOT NULL,  -- From Nango
    scopes TEXT[],
    status TEXT DEFAULT 'active',
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  ```

---

## Phase 3: Core Cortex Implementation

### 3.1 Implement Tool Mapper Service
- [ ] Create `src/services/cortex/ToolMapperService.ts`
- [ ] Methods:
  - [ ] `mapCortexAction(action: Action): MappedTool`
  - [ ] `validateActionAvailable(action: Action): boolean`
  - [ ] `getActionSchema(action: Action): JSONSchema`
  - [ ] `mapArguments(cortexArgs: any, toolDef: ToolDefinition): any`

**Deliverable**: `src/services/cortex/ToolMapperService.ts`

---

### 3.2 Implement HybridStore
- [ ] Review existing `src/cortex/store.ts`
- [ ] Complete implementation:
  - [ ] Redis for fast lookups (events, deduplication, state)
  - [ ] Postgres for persistence (units, runs, steps)
  - [ ] Consistent API: `get()`, `set()`, `list()`, `delete()`
  - [ ] Methods for Cortex operations:
    - [ ] `saveUnit(unit: Unit): Promise<Unit>`
    - [ ] `getUnit(unitId: string): Promise<Unit>`
    - [ ] `listUnits(userId: string): Promise<Unit[]>`
    - [ ] `saveRun(run: Run): Promise<Run>`
    - [ ] `writeEvent(event: Event): Promise<void>`
    - [ ] `getLastSyncTime(source: string): Promise<Date>`

**Deliverable**: Complete, tested `src/cortex/store.ts`

---

### 3.3 Update Poller Implementation
- [ ] Review existing `src/cortex/poller.ts`
- [ ] Wire to NangoService:
  - [ ] Use actual `NangoService` methods (from audit 1.2)
  - [ ] Call correct proxy method with correct parameters
  - [ ] Handle auth/connectionId correctly

- [ ] Event emission:
  - [ ] Rich payloads with full data
  - [ ] Semantic metadata (source, timestamp, type)
  - [ ] Deduplication using `HybridStore.getLastSyncTime()`

**Deliverable**: Working poller that emits events to `processEvent` callback

---

### 3.4 Update Compiler Implementation
- [ ] Review existing `src/cortex/compiler.ts`
- [ ] Verify:
  - [ ] Uses correct Groq API key from config
  - [ ] System prompt includes available tools (from TOOL_MAPPING)
  - [ ] System prompt includes available events
  - [ ] Handles clarification questions correctly
  - [ ] Temperature set to 0.2 for consistency

**Deliverable**: Tested compiler that produces valid Units

---

### 3.5 Update Matcher Implementation
- [ ] Review existing `src/cortex/matcher.ts`
- [ ] Verify:
  - [ ] `match(event: Event): Promise<Run[]>` returns matching units
  - [ ] Evaluates triggers correctly
  - [ ] Evaluates conditions (eval + semantic)
  - [ ] Creates Run objects with proper state

**Deliverable**: Tested matcher

---

### 3.6 Update Runtime Implementation
- [ ] Review existing `src/cortex/runtime.ts`
- [ ] Wire to actual ToolOrchestrator:
  - [ ] Use ToolMapperService to map actions
  - [ ] Call ToolOrchestrator.execute() with correct args
  - [ ] Handle tool responses
  - [ ] Implement action types:
    - [ ] `llm` actions (summarize, generate, etc)
    - [ ] `tool` actions (slack, email, salesforce, etc)
    - [ ] `wait` actions
    - [ ] `check` actions
    - [ ] `notify` actions

- [ ] Error handling and logging
- [ ] Store step results in HybridStore

**Deliverable**: Working runtime that executes action chains

---

## Phase 4: Integration

### 4.1 Initialize Cortex Components in index.ts
- [ ] Import all Cortex modules
- [ ] Create instances:
  ```typescript
  const cortexStore = new HybridStore(redis, sql);
  const cortexCompiler = new Compiler(CONFIG.GROQ_API_KEY);
  const cortexMatcher = new Matcher(cortexStore, CONFIG.GROQ_API_KEY);
  const cortexRuntime = new Runtime(cortexStore, CONFIG.GROQ_API_KEY, toolExecutor, logger);
  const poller = new Poller(redis, sql, nangoService, processEvent, logger);
  ```

- [ ] Implement `processEvent` callback:
  ```typescript
  async function processEvent(event) {
    await cortexStore.writeEvent(event);
    const runs = await cortexMatcher.match(event);
    for (const run of runs) {
      cortexRuntime.execute(run).catch(err => logger.error('Run failed', err));
    }
  }
  ```

- [ ] Start poller
- [ ] Mount Cortex routes

**Deliverable**: Updated `src/index.ts` with all Cortex wiring

---

### 4.2 Mount Cortex Routes
- [ ] Review existing `src/cortex/routes.ts`
- [ ] Verify endpoints:
  - [ ] `POST /api/cortex/units` — Create from prompt
  - [ ] `GET /api/cortex/units` — List user's units
  - [ ] `PATCH /api/cortex/units/:id/status` — Toggle status
  - [ ] `DELETE /api/cortex/units/:id` — Remove unit
  - [ ] `GET /api/cortex/runs` — Execution history
  - [ ] `POST /api/cortex/runs/:id/rerun` — Re-run automation

- [ ] Verify auth middleware:
  - [ ] Extract user ID correctly
  - [ ] Pass to all handlers
  - [ ] Scope queries to user

**Deliverable**: Tested REST API

---

### 4.3 Create Tool Executor Bridge
- [ ] Create wrapper around ToolOrchestrator:
  ```typescript
  const toolExecutor = {
    execute: async (tool: string, args: Record<string, any>, userId: string) => {
      const mapped = toolMapper.mapCortexAction({ type: tool, ...args });
      return toolOrchestrator.execute(mapped.name, mapped.provider, 
        { input: mapped.args }, userId);
    }
  };
  ```

**Deliverable**: `src/services/cortex/ToolExecutorBridge.ts`

---

## Phase 5: System Prompt & Configuration

### 5.1 Generate Compiler System Prompt
- [ ] Create `src/cortex/prompts/compilerSystemPrompt.ts`
- [ ] Include:
  - [ ] Available events (from poller)
  - [ ] Available actions (from TOOL_MAPPING)
  - [ ] LLM capabilities (summarize, generate, etc)
  - [ ] Example units
  - [ ] Guidance on triggers, conditions, actions
  - [ ] Handling ambiguity and clarification

**Deliverable**: `src/cortex/prompts/compilerSystemPrompt.ts`

---

### 5.2 Configure Poller Event Sources
- [ ] Define what each provider polls:
  - [ ] Gmail: new emails, label changes
  - [ ] Salesforce: opportunity updates, stage changes
  - [ ] Google Calendar: event creation, changes
  - [ ] Custom webhooks: user-defined events

**Deliverable**: Event taxonomy documentation + poller configuration

---

## Phase 6: Testing & Validation

### 6.1 Unit Tests
- [ ] Test each component:
  - [ ] HybridStore read/write
  - [ ] Compiler (raw prompt → Unit)
  - [ ] Matcher (event → matching Units)
  - [ ] Runtime (Unit + event → action execution)
  - [ ] Poller (API calls → events)

**Deliverable**: Test files with >80% coverage

---

### 6.2 Integration Tests
- [ ] End-to-end flow:
  - [ ] User creates automation via API
  - [ ] Poller detects event
  - [ ] Matcher identifies matching Unit
  - [ ] Runtime executes actions
  - [ ] Run is logged in database

**Deliverable**: Integration test suite

**Test Scenario**:
```typescript
// User creates: "Notify me when I get an email from boss"
const unit = await compiler.compile(
  'Notify me when I get an email from boss',
  userId
);

// Poller detects email event
const event = {
  source: 'gmail',
  type: 'email_received',
  payload: { from: { email: 'boss@company.com' }, ... }
};

// Matcher finds unit
const runs = await matcher.match(event);
expect(runs).toHaveLength(1);
expect(runs[0].unit.id).toBe(unit.id);

// Runtime executes
const result = await runtime.execute(runs[0]);
expect(result.status).toBe('success');
```

---

### 6.3 Manual Testing Checklist
- [ ] Create automation via UI/API
- [ ] Verify saved to database
- [ ] Trigger event manually (or mock)
- [ ] Verify automation runs
- [ ] Verify action executes (check Slack, email, CRM)
- [ ] Verify run logged in database
- [ ] Test pause/resume
- [ ] Test delete
- [ ] Test error handling

**Deliverable**: Test report documenting all scenarios

---

## Phase 7: Documentation

### 7.1 API Documentation
- [ ] Document all endpoints:
  - [ ] Request/response schemas
  - [ ] Error codes
  - [ ] Example requests

**Deliverable**: `docs/CORTEX_API.md`

---

### 7.2 Integration Documentation
- [ ] How Cortex integrates with existing system
- [ ] Architecture diagram
- [ ] Data flow diagrams
- [ ] Configuration guide

**Deliverable**: `docs/CORTEX_INTEGRATION.md`

---

### 7.3 User Documentation
- [ ] Cortex concepts (Unit, trigger, action, etc)
- [ ] How to write natural language prompts
- [ ] Examples of common automations
- [ ] Troubleshooting

**Deliverable**: `docs/CORTEX_USER_GUIDE.md`

---

## Dependency & Sequence

```
Phase 1: Audit
  ├─ 1.1 NangoService
  ├─ 1.2 ToolOrchestrator
  ├─ 1.3 Tool Config
  ├─ 1.4 User & Connections
  ├─ 1.5 Auth Context
  └─ 1.6 Storage Setup
      ↓
Phase 2: Database
  ├─ 2.1 Create tables
  └─ 2.2 Create connections table (optional)
      ↓
Phase 3: Implementation
  ├─ 3.1 Tool Mapper
  ├─ 3.2 HybridStore
  ├─ 3.3 Poller
  ├─ 3.4 Compiler
  ├─ 3.5 Matcher
  └─ 3.6 Runtime
      ↓
Phase 4: Integration
  ├─ 4.1 Wire in index.ts
  ├─ 4.2 Mount routes
  └─ 4.3 Tool executor bridge
      ↓
Phase 5: Configuration
  ├─ 5.1 System prompt
  └─ 5.2 Event sources
      ↓
Phase 6: Testing
  ├─ 6.1 Unit tests
  ├─ 6.2 Integration tests
  └─ 6.3 Manual testing
      ↓
Phase 7: Documentation
  ├─ 7.1 API docs
  ├─ 7.2 Integration docs
  └─ 7.3 User guide
```

---

## Sign-Off Criteria

- [ ] All Phase 1 audits complete
- [ ] All Phase 2 migrations run successfully
- [ ] All Phase 3 implementations tested and working
- [ ] Phase 4 integration complete and no errors on startup
- [ ] Phase 5 configuration complete
- [ ] Phase 6 test suite passes (>80% coverage)
- [ ] Phase 7 documentation complete
- [ ] No TypeScript errors in build
- [ ] Integration test passes end-to-end
- [ ] Manual testing checklist passed

---

## Notes

- Run migrations: `DATABASE_URL=... node scripts/run-migration.js`
- Build: `npm run build`
- Test: `npm test` or `npm run test:integration`
- Start: `npm start` or `npm run dev`

---

**Next Step**: Begin Phase 1 audit. Focus on `src/services/NangoService.ts` first.
