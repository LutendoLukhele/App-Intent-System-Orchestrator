# Cortex Integration: Master Plan

**Overview**: Complete integration roadmap for Cortex event automation system  
**Current Status**: ✅ Phase 1 (Audit) Complete → Ready for Phase 2-5  
**Total Effort**: 3-5 days of focused development

---

## Documents Created

1. **CORTEX_INTENT_FIRST_ARCHITECTURE.md**
   - What is Cortex and how it works
   - Intent-first automation model
   - Architecture, types, examples

2. **CORTEX_INTEGRATION_CHECKLIST.md**
   - Comprehensive 7-phase integration checklist
   - Clear deliverables and dependencies
   - Sign-off criteria

3. **PHASE_1_AUDIT_REPORT.md**
   - System audit findings
   - Current state of each component
   - Gaps identified and prioritized

4. **PHASE_2_IMPLEMENTATION_GUIDE.md** (THIS FILE)
   - Step-by-step code examples
   - Implementation priorities
   - Testing strategy
   - Timeline estimate

---

## Quick Status

### What's Already Done ✅

| Component | Status | Notes |
|-----------|--------|-------|
| NangoService | ✅ Complete | Fully implemented, production-ready |
| ToolOrchestrator | ✅ Complete | Works with existing tools |
| Database Schema | ✅ Complete | Cortex tables already created |
| Redis + Postgres | ✅ Complete | Initialized in index.ts |
| Types (cortex/types.ts) | ✅ Complete | All types defined |
| Compiler (cortex/compiler.ts) | ✅ Complete | Ready to compile prompts |
| Store (cortex/store.ts) | ⚠️ Partial | Events done, database methods missing |
| Poller (cortex/poller.ts) | ⚠️ Scaffolded | Structure exists, polling logic missing |
| Runtime (cortex/runtime.ts) | ⚠️ Scaffolded | Structure exists, execution logic missing |
| Routes (cortex/routes.ts) | ⚠️ Scaffolded | Structure exists, handlers missing |
| ToolMapperService | 🔴 Missing | Needs creation |

### What's Needed 🔴

1. **HybridStore methods** (8 database methods)
2. **ToolMapperService** (new file)
3. **Poller loop** (polling logic)
4. **Runtime executor** (action execution)
5. **Route handlers** (API endpoints)
6. **Database alignment** (table name fix)

---

## Phase Breakdown

### Phase 1: System Audit ✅ COMPLETE

**Deliverables**:
- ✅ PHASE_1_AUDIT_REPORT.md — Complete findings
- ✅ System interfaces documented
- ✅ Integration points identified
- ✅ Gaps clearly prioritized

### Phase 2: Complete Core Components 🔴 NEXT

**Duration**: ~3 days  
**Deliverables**:
- [ ] HybridStore — All database methods
- [ ] ToolMapperService — Cortex action mapping
- [ ] Poller — Provider polling loops
- [ ] Runtime — Action execution engine
- [ ] Routes — REST API endpoints

**Focus**: Get the 4 main components working end-to-end

### Phase 3: Database & Integration 🔴

**Duration**: ~1 day  
**Deliverables**:
- [ ] Run migrations
- [ ] Fix table name alignment
- [ ] Wire Cortex in index.ts (mostly done)
- [ ] Verify all connections resolve correctly

### Phase 4: Testing 🔴

**Duration**: ~1-2 days  
**Deliverables**:
- [ ] Unit tests (store, compiler, mapper)
- [ ] Integration tests (full flow)
- [ ] Manual testing (real accounts)

### Phase 5: Documentation & Deployment 🔴

**Duration**: ~1 day  
**Deliverables**:
- [ ] API documentation
- [ ] User guide
- [ ] Troubleshooting guide
- [ ] Deployment checklist

---

## How to Start

### 1. Pick a Starting Point

**Option A** (Recommended): **Start with HybridStore**
- Most straightforward
- All code examples provided
- Unblocks testing of other components

**Option B**: **Start with ToolMapperService**
- Good for understanding tool mapping
- Useful for runtime implementation
- Code examples provided

**Option C**: **Start with Poller**
- Most complex
- Depends on HybridStore
- Start after HybridStore is done

### 2. Daily Work Rhythm

**Day 1**: HybridStore methods
- Read PHASE_2_IMPLEMENTATION_GUIDE.md section "Priority 1"
- Implement all 8 methods
- Test with sample data

**Day 2**: ToolMapperService + fix Poller foundation
- Create ToolMapperService (copy from guide)
- Implement Poller polling loop
- Wire together in index.ts

**Day 3**: Runtime + Routes
- Implement Runtime action execution
- Implement REST route handlers
- Fix database table alignment

**Day 4**: Testing
- Unit tests for each component
- Integration test end-to-end
- Manual testing

**Day 5**: Final polish
- Update docs
- Fix any issues
- Deploy

### 3. Tools & Resources

**Code Examples**: `PHASE_2_IMPLEMENTATION_GUIDE.md`
- Every method has full code
- Copy-paste ready (adjust as needed)
- Includes edge cases

**Architecture Reference**: `CORTEX_INTENT_FIRST_ARCHITECTURE.md`
- How each component fits together
- Data flow diagrams
- Examples of compiled units

**Checklist**: `CORTEX_INTEGRATION_CHECKLIST.md`
- Track progress
- Know dependencies
- Verify completeness

---

## Key Files to Edit

### Immediate (Priority 1)
```
src/cortex/store.ts          ← Add 8 database methods
src/services/cortex/         ← Create ToolMapperService.ts
src/cortex/poller.ts         ← Add polling loop
src/cortex/runtime.ts        ← Add action execution
src/cortex/routes.ts         ← Add route handlers
```

### Important (Priority 2)
```
migrations/001_cortex.sql    ← No changes needed (schema is good)
src/services/tool/ToolOrchestrator.ts  ← Fix table name (1 line)
src/index.ts                 ← May need adjustments for wiring
```

### Testing
```
tests/cortex/store.test.ts   ← Unit tests
tests/cortex/compiler.test.ts ← Unit tests
tests/cortex/runtime.test.ts ← Unit tests
tests/cortex/integration.test.ts ← E2E test
```

---

## Key Concepts

### Event Flow

```
Provider (Gmail, Calendar, Salesforce)
        ↓
  Poller polls via NangoService
        ↓
  Rich Event emitted (with payload)
        ↓
  Event stored in Redis (for deduplication)
        ↓
  Matcher finds matching Units
        ↓
  For each Unit, create Run
        ↓
  Runtime executes action chain
        ↓
  Each action calls ToolOrchestrator
        ↓
  ToolOrchestrator calls NangoService
        ↓
  Result stored in database
```

### Unit Structure

```
Unit {
  trigger: {
    type: 'event',
    source: 'gmail',
    event: 'email_received',
    filter?: 'payload.from.email === "boss@company.com"'
  },
  conditions: [
    { type: 'semantic', check: 'urgency', expect: 'urgent' }
  ],
  actions: [
    { type: 'llm', do: 'summarize', input: '{{payload.body}}', as: 'summary' },
    { type: 'notify', message: 'Important email: {{summary}}' }
  ]
}
```

### Action Execution

```
For each action in unit.actions:
  1. Interpolate template variables
  2. If LLM action: call Groq
  3. If Tool action: map → ToolOrchestrator
  4. Store result in context
  5. Log step completion
  6. On error: stop and log
```

---

## Common Pitfalls to Avoid

1. **Variable Interpolation**: Use `{{varName}}` syntax consistently
2. **User Context**: Always pass `userId` to tools
3. **Connection Resolution**: Make sure `user_id` and `provider` match in connections table
4. **JSON Parsing**: Be careful with `JSON.stringify` / `JSON.parse` in database queries
5. **Async/Await**: Don't forget `await` in loops and promises
6. **Error Handling**: Each action should be in try-catch block
7. **Deduplication**: Use `event.meta.dedupe_key` for Gmail messages (use message ID)

---

## Quick Reference

### Adding a Tool

1. Add Cortex action type to `CORTEX_TOOL_MAP` in ToolMapperService
2. Add argument transformation in `transformArgs()`
3. Tool is automatically available to users in prompts

### Adding a Provider

1. Add event types to `src/cortex/types.ts`
2. Create polling method in `Poller`
3. Create route handler in compiler system prompt
4. Done! (ToolOrchestrator already supports it via NangoService)

### Debugging a Run

1. Check `cortex_runs` table: `SELECT * FROM runs WHERE id = ?`
2. Check steps: `SELECT * FROM run_steps WHERE run_id = ?`
3. Check logs: grep for `run_id` in application logs
4. Check event: `redis-cli GET event:{eventId}`

---

## API Contracts

### Create Automation

```bash
POST /api/cortex/units
Headers: x-user-id: user_123
Body: {
  "prompt": "Notify me when I get an urgent email"
}

Response 200:
{
  "unit": {
    "id": "unit_abc",
    "name": "Urgent email alerts",
    "status": "active",
    "trigger": {...},
    "conditions": [...],
    "actions": [...]
  }
}
```

### List Automations

```bash
GET /api/cortex/units
Headers: x-user-id: user_123

Response 200:
{
  "units": [
    { "id": "unit_abc", "name": "...", ... },
    { "id": "unit_def", "name": "...", ... }
  ]
}
```

### Execution History

```bash
GET /api/cortex/runs?limit=50
Headers: x-user-id: user_123

Response 200:
{
  "runs": [
    {
      "id": "run_123",
      "unit_id": "unit_abc",
      "status": "success",
      "started_at": "2025-12-08T...",
      "completed_at": "2025-12-08T...",
      "context": {...}
    }
  ]
}
```

---

## Success Criteria

✅ You'll know it's working when:

1. **Compilation Works**
   - User sends: "Notify me on new email"
   - System returns: Compiled Unit with trigger/actions

2. **Poller Works**
   - New email arrives
   - Poller detects and creates event
   - Event stored in Redis

3. **Matching Works**
   - Event matches Unit
   - Matcher creates Run

4. **Execution Works**
   - Runtime executes actions
   - Notification sent to user
   - Run logged as success

5. **API Works**
   - Can create units via REST API
   - Can list user's units
   - Can see execution history

---

## Resources

| Document | Purpose |
|----------|---------|
| CORTEX_INTENT_FIRST_ARCHITECTURE.md | Architecture & concepts |
| CORTEX_INTEGRATION_CHECKLIST.md | All tasks & dependencies |
| PHASE_1_AUDIT_REPORT.md | System audit results |
| PHASE_2_IMPLEMENTATION_GUIDE.md | Code examples & steps |
| This file | Master plan & overview |

---

## Support & Next Steps

**Ready to Start?**

1. Open `PHASE_2_IMPLEMENTATION_GUIDE.md`
2. Start with "Priority 1: Complete HybridStore"
3. Follow code examples provided
4. Test as you go

**Stuck?**

1. Check the relevant section in PHASE_2_IMPLEMENTATION_GUIDE.md
2. Review similar code in existing files
3. Check database schema in migrations/001_cortex.sql
4. Refer to examples in CORTEX_INTENT_FIRST_ARCHITECTURE.md

**Questions?**

- Architecture: See CORTEX_INTENT_FIRST_ARCHITECTURE.md
- Implementation: See PHASE_2_IMPLEMENTATION_GUIDE.md
- Status: See PHASE_1_AUDIT_REPORT.md
- Checklist: See CORTEX_INTEGRATION_CHECKLIST.md

---

## Timeline

**Today**: ✅ Phase 1 complete, planning done  
**Tomorrow**: Start Phase 2 (HybridStore + ToolMapperService)  
**Day 3**: Poller + Runtime implementation  
**Day 4**: Routes + Testing  
**Day 5**: Final polish & deploy  

**Target**: Cortex production-ready by **end of week**

---

Good luck! You've got this. The groundwork is solid, it's just connecting the pieces now. 🚀
