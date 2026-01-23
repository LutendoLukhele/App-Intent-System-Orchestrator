# Cortex Integration: Quick Reference Card

**Cortex Status**: Phase 1 Complete ✅ → Ready for Phase 2 Implementation  
**System Status**: 70% Ready (NangoService + ToolOrchestrator + DB complete)  
**Target Deployment**: December 13-14, 2025

---

## The 5-Minute Overview

### What is Cortex?

Cortex is an **event-driven automation system** that lets users create rules in plain English:

> "Notify me when a deal closes over $5k"

Cortex compiles this into an executable automation that:
1. **Listens** for events (via polling)
2. **Matches** events against rules
3. **Executes** action chains
4. **Logs** results

### How it Works

```
"Notify me when I get an email from my boss"
          ↓
    [Compiler - uses Groq]
          ↓
    { trigger: email_received,
      conditions: [from = "boss@..."],
      actions: [notify user] }
          ↓
    [Poller - detects email event]
          ↓
    [Matcher - finds matching unit]
          ↓
    [Runtime - executes actions]
          ↓
    User gets notification
```

### What's Already Done

| Component | Status | Details |
|-----------|--------|---------|
| **NangoService** | ✅ 100% | API calls, provider support |
| **ToolOrchestrator** | ✅ 100% | Tool execution & routing |
| **Database** | ✅ 100% | Schema with cortex tables |
| **Types** | ✅ 100% | All Cortex types defined |
| **Compiler** | ✅ 100% | Prompt → Unit |
| **Store Events** | ✅ 100% | Redis dedup + publish |
| **Store Units** | ⚠️ 30% | Need 8 database methods |
| **Poller** | ⚠️ 10% | Scaffolded, need loop |
| **Runtime** | ⚠️ 10% | Scaffolded, need execution |
| **Routes** | ⚠️ 10% | Scaffolded, need handlers |
| **ToolMapper** | ❌ 0% | Need new file |

---

## What Needs to Be Done (5 Things)

### 1. HybridStore Methods (8 CRUD operations)

**File**: `src/cortex/store.ts`  
**Effort**: 4 hours  
**Code**: See PHASE_2_IMPLEMENTATION_GUIDE.md

Methods needed:
- `saveUnit(unit)` ← Save automation
- `getUnit(id)` ← Load automation
- `listUnits(userId)` ← List user's automations
- `saveRun(run)` ← Save execution record
- `getRun(id)` ← Load execution
- `listRuns(userId)` ← List execution history
- `getRunStep(runId, stepIndex)` ← Load action step
- `saveRunStep(runId, step)` ← Save action result

### 2. ToolMapperService (new file)

**File**: `src/services/cortex/ToolMapperService.ts`  
**Effort**: 3 hours  
**Code**: See PHASE_2_IMPLEMENTATION_GUIDE.md

Maps Cortex action format → existing tools

Example:
```
Cortex: { type: 'slack', channel: '#alerts', message: '...' }
  ↓
Tool: { name: 'send_message', provider: 'slack', args: {...} }
```

### 3. Poller (polling loop)

**File**: `src/cortex/poller.ts`  
**Effort**: 4 hours  
**Code**: See PHASE_2_IMPLEMENTATION_GUIDE.md

Continuously polls providers for events:
- Get connections from database
- Call NangoService to fetch new data
- Emit events to matcher
- Update last_poll_at

### 4. Runtime (action execution)

**File**: `src/cortex/runtime.ts`  
**Effort**: 4 hours  
**Code**: See PHASE_2_IMPLEMENTATION_GUIDE.md

Executes action chains:
- Interpolate variables
- Execute actions in sequence
- Call ToolOrchestrator for tools
- Log results

### 5. Routes (REST API)

**File**: `src/cortex/routes.ts`  
**Effort**: 2 hours  
**Code**: See PHASE_2_IMPLEMENTATION_GUIDE.md

API endpoints:
- `POST /units` — Create automation
- `GET /units` — List automations
- `PATCH /units/:id/status` — Toggle status
- `DELETE /units/:id` — Remove automation
- `GET /runs` — Execution history
- `GET /runs/:id` — Execution details

---

## Implementation Priority

```
Week Start (Now):
├─ HybridStore methods          [4h] ← START HERE
└─ ToolMapperService            [3h] ← Parallel possible

Day 2:
├─ Poller loop                  [4h] ← Parallel with ToolMapper
└─ Runtime execution            [4h]

Day 3:
├─ Route handlers               [2h]
├─ Fix table name              [0.5h]
└─ Quick test                  [1h]

Day 4-5:
├─ Unit tests                   [4h]
├─ Integration test            [2h]
├─ Manual testing              [2h]
└─ Documentation              [1h]

Total: ~33 hours ≈ 5.5 days @6h/day
```

---

## Quick Lookup

### "How do I start?"
→ Read MASTER_PLAN.md (15 min)

### "Show me the code"
→ See PHASE_2_IMPLEMENTATION_GUIDE.md

### "What's the architecture?"
→ See CORTEX_INTENT_FIRST_ARCHITECTURE.md

### "What was audited?"
→ See PHASE_1_AUDIT_REPORT.md

### "Full task checklist?"
→ See CORTEX_INTEGRATION_CHECKLIST.md

### "Visual diagrams?"
→ See CORTEX_INTEGRATION_BRIEF.md

### "Where am I in the plan?"
→ See this file + PHASE_1_COMPLETE.md

---

## Key Files Reference

```
Cortex System:
├── src/cortex/
│   ├── types.ts          ✅ Complete
│   ├── compiler.ts       ✅ Complete
│   ├── store.ts          ⚠️ 30% (need methods)
│   ├── poller.ts         ⚠️ 10% (need loop)
│   ├── matcher.ts        ⚠️ 10% (need logic)
│   ├── runtime.ts        ⚠️ 10% (need execution)
│   ├── routes.ts         ⚠️ 10% (need handlers)
│   └── tools.ts          ✅ Complete

Services:
├── src/services/
│   ├── NangoService.ts              ✅ Complete
│   ├── tool/ToolOrchestrator.ts     ✅ Complete (1 line fix)
│   └── cortex/ToolMapperService.ts  ❌ Missing (create new)

Database:
├── migrations/
│   └── 001_cortex.sql   ✅ Complete
```

---

## Daily Checklist

### Day 1: HybridStore

- [ ] Open `src/cortex/store.ts`
- [ ] Copy 8 methods from PHASE_2_IMPLEMENTATION_GUIDE.md
- [ ] Test each method: `npm run build`
- [ ] Quick unit test: save and retrieve a unit

### Day 2: ToolMapperService + Poller

- [ ] Create `src/services/cortex/ToolMapperService.ts`
- [ ] Copy class from PHASE_2_IMPLEMENTATION_GUIDE.md
- [ ] Complete `src/cortex/poller.ts` polling loop
- [ ] Test poller with mock NangoService

### Day 3: Runtime + Routes + Fix

- [ ] Complete `src/cortex/runtime.ts` execute method
- [ ] Copy route handlers to `src/cortex/routes.ts`
- [ ] Fix table name in ToolOrchestrator (1 line)
- [ ] Build: `npm run build`

### Day 4: Testing

- [ ] Unit test HybridStore methods
- [ ] Unit test ToolMapperService
- [ ] Integration test: compile → poll → match → execute
- [ ] Manual test with real Gmail/Salesforce

### Day 5: Final

- [ ] Fix any errors
- [ ] Update docs
- [ ] Deploy to staging
- [ ] Smoke test production flow

---

## Common Commands

```bash
# Build
npm run build

# Run tests
npm test

# Check for errors
npx tsc --noEmit

# Run migration
DATABASE_URL="..." node scripts/run-migration.js

# Check database
psql $DATABASE_URL -c "SELECT * FROM units LIMIT 5"

# Check Redis
redis-cli GET "event:*"

# View logs
tail -f logs/cortex.log
```

---

## Success Criteria

✅ **Unit**: Can create, read, list, update, delete  
✅ **Run**: Can save, retrieve, list  
✅ **Event**: Can detect and store  
✅ **Compile**: Prompt → Unit works  
✅ **Poll**: Detects new emails/events  
✅ **Match**: Event finds matching units  
✅ **Execute**: Actions run successfully  
✅ **Routes**: API endpoints respond  

One "no" = not ready. Keep going until all "yes".

---

## Key Concepts

| Concept | Meaning |
|---------|---------|
| **Unit** | One automation (what user creates) |
| **Event** | Something that happened (email, calendar, etc) |
| **Run** | One execution of a unit (started by event) |
| **Action** | One step in a unit (notify, send email, etc) |
| **Trigger** | What starts a unit (email_received, etc) |
| **Condition** | Must be true to execute (urgency, sender, etc) |
| **Compiler** | Converts prompt → Unit (uses Groq) |
| **Poller** | Watches for events (polls providers) |
| **Matcher** | Finds units that match event |
| **Runtime** | Executes unit against event |

---

## Database Schema Snapshot

```sql
units           -- User's automations
├── id          -- Unit ID
├── owner_id    -- User who created
├── name        -- Automation name
├── raw_when    -- Original prompt
├── compiled_when  -- Compiled trigger
├── compiled_if    -- Compiled conditions
├── compiled_then  -- Compiled actions
└── status      -- active/paused/disabled

runs            -- Execution history
├── id          -- Run ID
├── unit_id     -- Which unit ran
├── event_id    -- What triggered it
├── user_id     -- User who owns it
├── status      -- pending/in_progress/success/failed
└── context     -- Variables during execution

run_steps       -- Details of each step
├── run_id      -- Which run
├── step_index  -- Which action
├── status      -- success/failed
└── result      -- What action returned
```

---

## Error Handling Patterns

```typescript
// In Poller
try {
  const events = await nangoService.fetchEmails(...);
  for (const event of events) {
    await this.eventCallback(event);
  }
} catch (err) {
  logger.error('Poll failed', { provider, error: err.message });
  // Update error_count in database
}

// In Runtime
try {
  const result = await this.executeAction(action, context);
  // Save step success
} catch (err) {
  // Save step error
  throw err; // Stop execution
}
```

---

## Debugging Checklist

**"Unit was created but not running"**
- [ ] Check `units` table: unit exists?
- [ ] Check `connections` table: provider connection exists?
- [ ] Check logs: Poller running?
- [ ] Check logs: Event detected?

**"Event detected but unit not running"**
- [ ] Check logs: Matcher found unit?
- [ ] Check trigger: Does event match?
- [ ] Check conditions: All true?

**"Unit running but action failed"**
- [ ] Check `run_steps` table: which step failed?
- [ ] Check error message: what went wrong?
- [ ] Check ToolOrchestrator logs: tool call succeeded?
- [ ] Check NangoService logs: API call worked?

**"Build fails with errors"**
- [ ] Check TypeScript: `npx tsc --noEmit`
- [ ] Check imports: All files exist?
- [ ] Check syntax: Missing semicolons?

---

## Next Steps (Right Now)

1. **Read** MASTER_PLAN.md (15 min)
2. **Read** PHASE_2_IMPLEMENTATION_GUIDE.md (30 min)
3. **Open** `src/cortex/store.ts`
4. **Start** implementing HybridStore methods
5. **Build** to check for errors: `npm run build`
6. **Test** with sample data

---

## You've Got This! 🚀

- ✅ Phase 1 (Audit) is done
- ✅ Architecture is clear
- ✅ Code examples are provided
- ✅ Timeline is realistic
- ✅ Risk is low (building on solid foundation)

**Estimated time to production**: 5-6 days  
**Complexity**: Medium (mainly CRUD + orchestration)  
**Success probability**: High (all pieces exist, just connecting)

---

**Questions?** Refer to the 6 guides created.  
**Ready to code?** Start with HybridStore (copy from PHASE_2_IMPLEMENTATION_GUIDE.md).  
**Need support?** Check appropriate document above.

**Good luck!** 🎉
