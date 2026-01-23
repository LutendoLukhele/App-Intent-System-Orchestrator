# Phase 2-5: Implementation Guide

**Status**: Ready to code  
**Estimated Time**: 3-5 days  
**Complexity**: Medium

This guide provides step-by-step instructions to complete Cortex integration.

---

## Priority 1: Complete HybridStore (src/cortex/store.ts)

**Current Status**: ~30% complete  
**What's Done**: Event methods (writeEvent, getEvent)  
**What's Needed**: Unit, Run, and RunStep methods

### Missing Methods

#### 1. saveUnit(unit: Unit): Promise<void>

```typescript
async saveUnit(unit: Unit): Promise<void> {
  const now = new Date().toISOString();
  
  // Handle raw prompt format
  let rawWhen = '';
  let rawIf = '';
  let rawThen = '';
  
  if (typeof unit.raw === 'string') {
    // Simple format: store as-is
    rawWhen = unit.raw;
  } else if (typeof unit.raw === 'object') {
    // Structured format: extract when/if/then
    rawWhen = unit.raw.when || '';
    rawIf = unit.raw.if || '';
    rawThen = unit.raw.then || '';
  }

  await this.sql`
    INSERT INTO units (
      id, owner_id, name, raw_when, raw_if, raw_then,
      compiled_when, compiled_if, compiled_then,
      status, trigger_source, trigger_event, created_at, updated_at
    )
    VALUES (
      ${unit.id},
      ${unit.owner},
      ${unit.name},
      ${rawWhen},
      ${rawIf || null},
      ${rawThen},
      ${JSON.stringify(unit.trigger)},
      ${JSON.stringify(unit.conditions)},
      ${JSON.stringify(unit.actions)},
      ${unit.status},
      ${unit.trigger?.type === 'event' ? unit.trigger.source : null},
      ${unit.trigger?.type === 'event' ? unit.trigger.event : null},
      ${now},
      ${now}
    )
    ON CONFLICT(id) DO UPDATE SET
      name = ${unit.name},
      status = ${unit.status},
      compiled_when = ${JSON.stringify(unit.trigger)},
      compiled_if = ${JSON.stringify(unit.conditions)},
      compiled_then = ${JSON.stringify(unit.actions)},
      updated_at = ${now}
  `;
}
```

#### 2. getUnit(unitId: string): Promise<Unit | null>

```typescript
async getUnit(unitId: string): Promise<Unit | null> {
  const rows = await this.sql`
    SELECT * FROM units WHERE id = ${unitId}
  `;
  
  if (rows.length === 0) return null;
  
  const row = rows[0];
  
  return {
    id: row.id,
    owner: row.owner_id,
    name: row.name,
    description: row.description || '',
    raw: {
      when: row.raw_when,
      if: row.raw_if,
      then: row.raw_then
    },
    trigger: JSON.parse(row.compiled_when),
    conditions: JSON.parse(row.compiled_if || '[]'),
    actions: JSON.parse(row.compiled_then),
    status: row.status as 'active' | 'paused' | 'disabled',
    created_at: row.created_at?.toISOString() || new Date().toISOString(),
    updated_at: row.updated_at?.toISOString() || new Date().toISOString(),
    run_count: row.run_count || 0,
    last_run_at: row.last_run_at?.toISOString() || null
  };
}
```

#### 3. listUnits(userId: string): Promise<Unit[]>

```typescript
async listUnits(userId: string): Promise<Unit[]> {
  const rows = await this.sql`
    SELECT * FROM units 
    WHERE owner_id = ${userId}
    ORDER BY created_at DESC
  `;
  
  return rows.map(row => ({
    id: row.id,
    owner: row.owner_id,
    name: row.name,
    description: row.description || '',
    raw: {
      when: row.raw_when,
      if: row.raw_if,
      then: row.raw_then
    },
    trigger: JSON.parse(row.compiled_when),
    conditions: JSON.parse(row.compiled_if || '[]'),
    actions: JSON.parse(row.compiled_then),
    status: row.status as 'active' | 'paused' | 'disabled',
    created_at: row.created_at?.toISOString() || new Date().toISOString(),
    updated_at: row.updated_at?.toISOString() || new Date().toISOString(),
    run_count: row.run_count || 0,
    last_run_at: row.last_run_at?.toISOString() || null
  }));
}
```

#### 4. saveRun(run: Run): Promise<void>

```typescript
async saveRun(run: Run): Promise<void> {
  const now = new Date().toISOString();
  
  await this.sql`
    INSERT INTO runs (
      id, unit_id, event_id, user_id, status,
      current_step, context, started_at, completed_at, error,
      original_event_payload
    )
    VALUES (
      ${run.id},
      ${run.unit_id},
      ${run.event_id},
      ${run.user_id},
      ${run.status},
      ${run.current_step || 0},
      ${JSON.stringify(run.context || {})},
      ${run.started_at || now},
      ${run.completed_at || null},
      ${run.error || null},
      ${JSON.stringify(run.original_event_payload || {})}
    )
    ON CONFLICT(id) DO UPDATE SET
      status = ${run.status},
      current_step = ${run.current_step || 0},
      context = ${JSON.stringify(run.context || {})},
      completed_at = ${run.completed_at || null},
      error = ${run.error || null}
  `;
}
```

#### 5. getRun(runId: string): Promise<Run | null>

```typescript
async getRun(runId: string): Promise<Run | null> {
  const rows = await this.sql`
    SELECT * FROM runs WHERE id = ${runId}
  `;
  
  if (rows.length === 0) return null;
  
  const row = rows[0];
  
  return {
    id: row.id,
    unit_id: row.unit_id,
    event_id: row.event_id,
    user_id: row.user_id,
    status: row.status as 'pending' | 'in_progress' | 'success' | 'failed' | 'paused',
    current_step: row.current_step,
    context: JSON.parse(row.context || '{}'),
    started_at: row.started_at?.toISOString() || new Date().toISOString(),
    completed_at: row.completed_at?.toISOString() || null,
    error: row.error || null,
    original_event_payload: JSON.parse(row.original_event_payload || '{}')
  };
}
```

#### 6. listRuns(userId: string, limit: number = 50): Promise<Run[]>

```typescript
async listRuns(userId: string, limit: number = 50): Promise<Run[]> {
  const rows = await this.sql`
    SELECT * FROM runs 
    WHERE user_id = ${userId}
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  
  return rows.map(row => ({
    id: row.id,
    unit_id: row.unit_id,
    event_id: row.event_id,
    user_id: row.user_id,
    status: row.status as 'pending' | 'in_progress' | 'success' | 'failed' | 'paused',
    current_step: row.current_step,
    context: JSON.parse(row.context || '{}'),
    started_at: row.started_at?.toISOString() || new Date().toISOString(),
    completed_at: row.completed_at?.toISOString() || null,
    error: row.error || null,
    original_event_payload: JSON.parse(row.original_event_payload || '{}')
  }));
}
```

#### 7. getRunStep(runId: string, stepIndex: number): Promise<RunStep | null>

```typescript
async getRunStep(runId: string, stepIndex: number): Promise<RunStep | null> {
  const rows = await this.sql`
    SELECT * FROM run_steps 
    WHERE run_id = ${runId} AND step_index = ${stepIndex}
  `;
  
  if (rows.length === 0) return null;
  
  const row = rows[0];
  
  return {
    id: row.id.toString(),
    run_id: row.run_id,
    step_index: row.step_index,
    action_type: row.action_type,
    action_config: JSON.parse(row.action_config),
    status: row.status as 'pending' | 'in_progress' | 'success' | 'failed',
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error || null,
    started_at: row.started_at?.toISOString() || null,
    completed_at: row.completed_at?.toISOString() || null
  };
}
```

#### 8. saveRunStep(runId: string, step: RunStep): Promise<void>

```typescript
async saveRunStep(runId: string, step: RunStep): Promise<void> {
  await this.sql`
    INSERT INTO run_steps (
      run_id, step_index, action_type, action_config,
      status, result, error, started_at, completed_at
    )
    VALUES (
      ${runId},
      ${step.step_index},
      ${step.action_type},
      ${JSON.stringify(step.action_config)},
      ${step.status},
      ${step.result ? JSON.stringify(step.result) : null},
      ${step.error || null},
      ${step.started_at || null},
      ${step.completed_at || null}
    )
    ON CONFLICT(run_id, step_index) DO UPDATE SET
      status = ${step.status},
      result = ${step.result ? JSON.stringify(step.result) : null},
      error = ${step.error || null},
      completed_at = ${step.completed_at || null}
  `;
}
```

### Implementation Checklist

- [ ] Add all 8 methods to HybridStore
- [ ] Test each method with sample data
- [ ] Verify JSON serialization/deserialization
- [ ] Test with real database

---

## Priority 2: Create ToolMapperService (NEW)

**File**: `src/services/cortex/ToolMapperService.ts`  
**Status**: Create new  
**Purpose**: Map Cortex actions → existing tools

### Implementation

```typescript
import { Action, LLMAction, ToolAction, NotifyAction } from '../../cortex/types';
import { ToolConfigManager } from './ToolConfigManager';
import winston from 'winston';

export interface MappedTool {
  name: string;
  provider: string;
  args: Record<string, any>;
}

export class ToolMapperService {
  private toolConfigManager: ToolConfigManager;
  private logger: winston.Logger;
  
  // Cortex action type → tool name mapping
  private readonly CORTEX_TOOL_MAP: Record<string, { name: string; provider: string }> = {
    // Email (Gmail)
    'gmail.send': { name: 'send_email', provider: 'google-mail' },
    'gmail.reply': { name: 'send_email', provider: 'google-mail' },
    'gmail.fetch': { name: 'fetch_emails', provider: 'google-mail' },
    
    // Calendar (Google)
    'calendar.create': { name: 'create_calendar_event', provider: 'google-calendar' },
    'calendar.update': { name: 'update_calendar_event', provider: 'google-calendar' },
    'calendar.fetch': { name: 'fetch_calendar_events', provider: 'google-calendar' },
    
    // Salesforce CRM
    'salesforce.fetch_lead': { name: 'fetch_entity', provider: 'salesforce-2' },
    'salesforce.create_lead': { name: 'create_entity', provider: 'salesforce-2' },
    'salesforce.update_lead': { name: 'update_entity', provider: 'salesforce-2' },
    'salesforce.fetch_opportunity': { name: 'fetch_entity', provider: 'salesforce-2' },
    'salesforce.create_opportunity': { name: 'create_entity', provider: 'salesforce-2' },
    'salesforce.update_opportunity': { name: 'update_entity', provider: 'salesforce-2' },
    'salesforce.create_task': { name: 'create_entity', provider: 'salesforce-2' },
    
    // Outlook
    'outlook.send_email': { name: 'send_email', provider: 'outlook' },
    'outlook.create_event': { name: 'create_outlook_entity', provider: 'outlook' },
    'outlook.fetch_contacts': { name: 'fetch_outlook_entity', provider: 'outlook' },
    
    // Notion
    'notion.create_page': { name: 'create_notion_page', provider: 'notion' },
    'notion.update_page': { name: 'update_notion_page', provider: 'notion' },
    'notion.fetch_page': { name: 'fetch_notion_page', provider: 'notion' },
    
    // Slack (future integration)
    'slack.send': { name: 'send_message', provider: 'slack' }
  };

  constructor(toolConfigManager: ToolConfigManager, logger: winston.Logger) {
    this.toolConfigManager = toolConfigManager;
    this.logger = logger;
  }

  /**
   * Map a Cortex action to an executable ToolCall
   */
  mapAction(action: Action): { toolName: string; provider: string; args: Record<string, any> } {
    if (action.type === 'llm') {
      // LLM actions don't go through Nango
      return {
        toolName: `llm_${(action as LLMAction).do}`,
        provider: '__internal__',
        args: {
          do: (action as LLMAction).do,
          input: (action as LLMAction).input,
          as: (action as LLMAction).as
        }
      };
    }

    if (action.type === 'notify') {
      // Notifications don't go through Nango
      return {
        toolName: 'notify',
        provider: '__internal__',
        args: {
          message: (action as NotifyAction).message
        }
      };
    }

    if (action.type === 'wait') {
      // Wait actions don't execute tools
      return {
        toolName: 'wait',
        provider: '__internal__',
        args: {
          for: (action as any).for
        }
      };
    }

    if (action.type === 'tool') {
      const toolAction = action as ToolAction;
      const key = `${toolAction.provider}.${toolAction.tool}`;
      
      const mapping = this.CORTEX_TOOL_MAP[key];
      if (!mapping) {
        throw new Error(`Unknown Cortex tool: ${key}`);
      }

      this.logger.debug('Mapped Cortex action', { key, mapping });

      return {
        toolName: mapping.name,
        provider: mapping.provider,
        args: this.transformArgs(mapping.name, toolAction.args)
      };
    }

    throw new Error(`Unknown action type: ${action.type}`);
  }

  /**
   * Transform Cortex arguments to tool-specific format
   */
  private transformArgs(toolName: string, cortexArgs: Record<string, any>): Record<string, any> {
    // Most tools accept { input: {...} } wrapper
    // Some need flat args
    
    switch (toolName) {
      case 'send_email':
        return {
          input: {
            to: cortexArgs.to,
            subject: cortexArgs.subject,
            body: cortexArgs.body,
            from: cortexArgs.from,
            cc: cortexArgs.cc,
            bcc: cortexArgs.bcc
          }
        };

      case 'fetch_emails':
        return {
          input: {
            operation: 'fetch',
            backfillPeriodMs: cortexArgs.backfillPeriodMs,
            filters: cortexArgs.filters
          }
        };

      case 'create_calendar_event':
      case 'update_calendar_event':
        return {
          input: {
            title: cortexArgs.title,
            description: cortexArgs.description,
            startTime: cortexArgs.startTime,
            endTime: cortexArgs.endTime,
            attendees: cortexArgs.attendees,
            location: cortexArgs.location
          }
        };

      case 'create_entity':
      case 'update_entity':
      case 'fetch_entity':
        return {
          input: {
            operation: toolName === 'create_entity' ? 'create' : toolName === 'update_entity' ? 'update' : 'fetch',
            entityType: cortexArgs.entityType,
            identifier: cortexArgs.identifier,
            fields: cortexArgs.fields,
            filters: cortexArgs.filters
          }
        };

      case 'create_notion_page':
      case 'update_notion_page':
        return {
          input: cortexArgs
        };

      case 'send_message':  // Slack
        return {
          input: {
            channel: cortexArgs.channel,
            text: cortexArgs.message || cortexArgs.text,
            blocks: cortexArgs.blocks
          }
        };

      default:
        // Generic wrapper
        return { input: cortexArgs };
    }
  }

  /**
   * Check if a tool is available
   */
  isToolAvailable(toolName: string): boolean {
    const tool = this.toolConfigManager.getToolByName(toolName);
    return !!tool;
  }
}
```

### Usage in Runtime

```typescript
// In runtime.ts
const mappedTool = toolMapper.mapAction(action);

const toolCall: ToolCall = {
  name: mappedTool.toolName,
  arguments: mappedTool.args,
  userId: context.userId
};

const result = await toolOrchestrator.executeTool(toolCall, runId, stepIndex);
```

---

## Priority 3: Complete Poller (src/cortex/poller.ts)

**Current Status**: Scaffolded  
**What's Needed**: Actual polling logic

### Key Methods to Implement

#### 1. Polling Loop

```typescript
private async pollConnections(): Promise<void> {
  // Get all active connections
  const connections = await this.sql`
    SELECT user_id, provider, connection_id FROM connections
    WHERE enabled = true
    ORDER BY last_poll_at ASC NULLS FIRST
    LIMIT 10
  `;

  for (const conn of connections) {
    try {
      await this.pollProvider(conn.user_id, conn.provider, conn.connection_id);
      
      // Update last_poll_at
      await this.sql`
        UPDATE connections 
        SET last_poll_at = NOW(), error_count = 0, last_error = NULL
        WHERE user_id = ${conn.user_id} AND provider = ${conn.provider}
      `;
    } catch (err: any) {
      this.logger.error('Poll failed', { provider: conn.provider, error: err.message });
      
      await this.sql`
        UPDATE connections 
        SET error_count = error_count + 1, last_error = ${err.message}
        WHERE user_id = ${conn.user_id} AND provider = ${conn.provider}
      `;
    }
  }
}
```

#### 2. Provider-Specific Polling

```typescript
private async pollProvider(userId: string, provider: string, connectionId: string): Promise<void> {
  switch (provider) {
    case 'google-mail':
      await this.pollGmail(userId, connectionId);
      break;
    case 'google-calendar':
      await this.pollCalendar(userId, connectionId);
      break;
    case 'salesforce-2':
      await this.pollSalesforce(userId, connectionId);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

private async pollGmail(userId: string, connectionId: string): Promise<void> {
  const lastSync = await this.getLastSyncTime('gmail', userId);
  
  const emails = await this.nangoService.fetchEmails('google-mail', connectionId, {
    filters: { after: lastSync?.toISOString() },
    operation: 'fetch'
  });

  for (const email of emails) {
    const event: CortexEvent = {
      id: uuidv4(),
      source: 'gmail',
      event: 'email_received',
      timestamp: new Date().toISOString(),
      user_id: userId,
      payload: email,
      meta: {
        dedupe_key: `gmail:${email.id}`
      }
    };

    await this.eventCallback(event);
  }
  
  await this.setSyncTime('gmail', userId, new Date());
}
```

---

## Priority 4: Complete Runtime (src/cortex/runtime.ts)

### Execute Method

```typescript
async execute(run: Run): Promise<void> {
  try {
    // Get the unit
    const unit = await this.store.getUnit(run.unit_id);
    if (!unit) throw new Error(`Unit ${run.unit_id} not found`);

    // Mark as in-progress
    run.status = 'in_progress';
    await this.store.saveRun(run);

    // Execute each action in sequence
    for (let i = 0; i < unit.actions.length; i++) {
      const action = unit.actions[i];
      
      try {
        const result = await this.executeAction(action, run);
        
        // Save step result
        await this.store.saveRunStep(run.id, {
          run_id: run.id,
          step_index: i,
          action_type: action.type,
          action_config: action,
          status: 'success',
          result,
          completed_at: new Date().toISOString()
        });

        // Store result in context for next action
        if (action.type === 'tool' || action.type === 'llm') {
          const as = (action as any).as;
          if (as) {
            run.context[as] = result;
          }
        }
      } catch (err: any) {
        // Save step error
        await this.store.saveRunStep(run.id, {
          run_id: run.id,
          step_index: i,
          action_type: action.type,
          action_config: action,
          status: 'failed',
          error: err.message
        });

        throw err;
      }
    }

    // Mark as success
    run.status = 'success';
    run.completed_at = new Date().toISOString();
    await this.store.saveRun(run);

    this.logger.info('Run completed', { run_id: run.id, unit_id: run.unit_id });
  } catch (err: any) {
    run.status = 'failed';
    run.error = err.message;
    run.completed_at = new Date().toISOString();
    await this.store.saveRun(run);

    this.logger.error('Run failed', { run_id: run.id, error: err.message });
  }
}

private async executeAction(action: Action, run: Run): Promise<any> {
  // Interpolate variables in action
  const interpolated = this.interpolateVars(action, run.context);

  if (action.type === 'llm') {
    return this.executeLLMAction(interpolated as LLMAction);
  }

  if (action.type === 'tool') {
    return this.executeToolAction(interpolated as ToolAction, run);
  }

  if (action.type === 'wait') {
    return this.executeWaitAction(interpolated as any);
  }

  if (action.type === 'notify') {
    return this.executeNotifyAction(interpolated as NotifyAction);
  }

  throw new Error(`Unknown action type: ${action.type}`);
}
```

---

## Priority 5: Implement Routes (src/cortex/routes.ts)

### API Endpoints

```typescript
import express from 'express';
import { HybridStore } from './store';
import { Compiler } from './compiler';
import { Runtime } from './runtime';

export function createCortexRouter(
  store: HybridStore,
  compiler: Compiler,
  runtime: Runtime
): express.Router {
  const router = express.Router();

  // Create automation from prompt
  router.post('/units', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const { prompt } = req.body;

      const result = await compiler.compile(prompt, userId);

      if (result.type === 'clarification') {
        return res.json({ 
          needsClarification: true,
          question: result.question
        });
      }

      await store.saveUnit(result.unit);

      res.json({ 
        unit: result.unit
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // List user's automations
  router.get('/units', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const units = await store.listUnits(userId);
      res.json({ units });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Toggle automation status
  router.patch('/units/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const unit = await store.getUnit(id);
      if (!unit) return res.status(404).json({ error: 'Unit not found' });

      unit.status = status;
      unit.updated_at = new Date().toISOString();
      
      await store.saveUnit(unit);

      res.json({ unit });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete automation
  router.delete('/units/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await store.sql`DELETE FROM units WHERE id = ${id}`;
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // List execution history
  router.get('/runs', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const runs = await store.listRuns(userId, limit);
      res.json({ runs });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get run details
  router.get('/runs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const run = await store.getRun(id);
      
      if (!run) return res.status(404).json({ error: 'Run not found' });
      
      res.json({ run });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
```

---

## Priority 6: Fix Database Alignment

**Current Issue**: ToolOrchestrator queries `user_connections` but schema has `connections`

### Fix

In `src/services/tool/ToolOrchestrator.ts`, line ~280:

**Change from:**
```typescript
const rows = await sql`
  SELECT connection_id FROM user_connections 
  WHERE user_id = ${userId} AND provider = ${providerConfigKey}
`;
```

**Change to:**
```typescript
const rows = await sql`
  SELECT connection_id FROM connections 
  WHERE user_id = ${userId} AND provider = ${providerConfigKey}
`;
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/cortex/store.test.ts
describe('HybridStore', () => {
  it('should save and retrieve units', async () => {
    const unit = { id: 'u1', owner: 'user1', name: 'Test', ... };
    await store.saveUnit(unit);
    const retrieved = await store.getUnit('u1');
    expect(retrieved.id).toBe('u1');
  });
});

// tests/cortex/compiler.test.ts
describe('Compiler', () => {
  it('should compile raw prompt to unit', async () => {
    const result = await compiler.compile(
      'Notify me when I get an email from boss',
      'user1'
    );
    expect(result.type).toBe('unit');
  });
});

// tests/cortex/runtime.test.ts
describe('Runtime', () => {
  it('should execute action chain', async () => {
    // Mock NangoService, ToolOrchestrator
    const run = { ... };
    await runtime.execute(run);
    expect(run.status).toBe('success');
  });
});
```

### Integration Test

```typescript
// tests/cortex/integration.test.ts
describe('Cortex End-to-End', () => {
  it('should create unit and execute on event', async () => {
    // 1. Compile
    const result = await compiler.compile('Alert me on new email', 'user1');
    const unit = result.unit;
    
    // 2. Save
    await store.saveUnit(unit);
    
    // 3. Emit event
    const event = {
      id: 'e1',
      source: 'gmail',
      event: 'email_received',
      user_id: 'user1',
      payload: { from: 'boss@company.com', ... }
    };
    
    // 4. Match
    const runs = await matcher.match(event);
    expect(runs.length).toBe(1);
    
    // 5. Execute
    const run = runs[0];
    await runtime.execute(run);
    expect(run.status).toBe('success');
  });
});
```

---

## Deployment Checklist

- [ ] All methods in HybridStore implemented
- [ ] ToolMapperService created and tested
- [ ] Poller polling loop working
- [ ] Runtime action execution working
- [ ] Routes implemented and tested
- [ ] Database table names consistent
- [ ] No TypeScript errors: `npm run build`
- [ ] Unit tests pass: `npm test`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] Manual testing complete
- [ ] Documentation updated

---

## Timeline Estimate

| Task | Est. Time | Status |
|------|-----------|--------|
| HybridStore methods | 4 hours | 🔴 Not started |
| ToolMapperService | 3 hours | 🔴 Not started |
| Poller implementation | 4 hours | 🔴 Not started |
| Runtime implementation | 4 hours | 🔴 Not started |
| Routes implementation | 2 hours | 🔴 Not started |
| Database fixes | 1 hour | 🔴 Not started |
| Testing | 8 hours | 🔴 Not started |
| **Total** | **26 hours** | 🔴 Not started |

**Working ~6 hours/day** = **~4-5 days** to complete

---

## Next Step

Start with **HybridStore methods**. These are the foundation for everything else.

Let me know when you're ready to begin implementation!
