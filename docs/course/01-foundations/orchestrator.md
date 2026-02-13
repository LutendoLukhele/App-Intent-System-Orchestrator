# 1.5 The Orchestrator

> From plan to execution — the bridge between intent and action.

---

## What is the Orchestrator?

The **ToolOrchestrator** is the execution engine. It takes an ActionPlan and:

1. **Resolves placeholders** — Fills in `{{stepId.result.field}}` references
2. **Routes to providers** — Determines which Nango integration handles each tool
3. **Handles cache vs action** — Reads from cache or triggers mutations
4. **Manages execution flow** — Sequential or parallel, with error handling

```
ActionPlan                    ToolOrchestrator                   External APIs
[step1, step2, step3]  ──▶   Route → Resolve → Execute   ──▶   Gmail, Salesforce...
                                       │
                                       ▼
                              [Results for each step]
```

---

## The ToolOrchestrator Class

```typescript
// src/services/ToolOrchestrator.ts
export class ToolOrchestrator {
  constructor(
    private nango: NangoService,
    private toolConfig: ToolConfigManager,
    private db: Database
  ) {}
  
  async executePlan(
    plan: ActionStep[],
    userId: string,
    sessionId: string
  ): Promise<PlanExecutionResult> {
    const results: StepResult[] = [];
    
    for (const step of plan) {
      try {
        // Emit progress
        this.emit('step_started', { sessionId, step });
        
        // Resolve any placeholders from previous results
        const resolvedArgs = this.resolvePlaceholders(step.arguments, results);
        
        // Execute the tool
        const result = await this.executeTool(
          step.tool,
          resolvedArgs,
          userId
        );
        
        // Store result for subsequent steps
        results.push({
          stepId: step.id,
          status: 'completed',
          result
        });
        
        this.emit('step_completed', { sessionId, step, result });
        
      } catch (error: any) {
        results.push({
          stepId: step.id,
          status: 'failed',
          error: error.message
        });
        
        this.emit('step_failed', { sessionId, step, error });
        break; // Stop on failure
      }
    }
    
    return { steps: results, success: results.every(r => r.status === 'completed') };
  }
}
```

---

## Tool Execution

The core method that routes tools to the right handler:

```typescript
async executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string
): Promise<any> {
  // Get tool config
  const tool = this.toolConfig.getToolByName(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  
  // Get user's connection for this provider
  const connectionId = await this.getConnectionId(userId, tool.providerConfigKey);
  if (!connectionId) {
    throw new Error(`No connection for provider: ${tool.providerConfigKey}`);
  }
  
  // Route based on source type
  if (tool.source === 'cache') {
    return await this.executeFromCache(tool, connectionId, args);
  } else {
    return await this.executeAction(tool, connectionId, args);
  }
}
```

---

## Cache Operations

For read-only tools that query synced data:

```typescript
private async executeFromCache(
  tool: ToolConfig,
  connectionId: string,
  args: Record<string, any>
): Promise<any> {
  const { input } = args;
  
  // Build filter from input
  const filter = this.buildCacheFilter(tool, input);
  
  // Query Nango cache
  const records = await this.nango.listRecords({
    providerConfigKey: tool.providerConfigKey!,
    connectionId,
    model: tool.cache_model!,
    filter: filter ? JSON.stringify(filter) : undefined,
    limit: input.limit || 20
  });
  
  return {
    data: records.records,
    count: records.records.length,
    hasMore: !!records.next_cursor
  };
}

private buildCacheFilter(tool: ToolConfig, input: any): Record<string, any> | null {
  // Tool-specific filter building
  switch (tool.name) {
    case 'fetch_emails':
      return this.buildEmailFilter(input.filters);
    case 'fetch_entity':
      return this.buildEntityFilter(input);
    default:
      return input.filters || null;
  }
}

private buildEmailFilter(filters: any): Record<string, any> | null {
  if (!filters) return null;
  
  const nqlFilter: any = {};
  
  if (filters.sender) {
    nqlFilter['from.email'] = { $regex: filters.sender, $options: 'i' };
  }
  if (filters.subject?.contains) {
    nqlFilter.subject = { $regex: filters.subject.contains, $options: 'i' };
  }
  if (filters.dateRange) {
    nqlFilter.date = {};
    if (filters.dateRange.after) {
      nqlFilter.date.$gte = filters.dateRange.after;
    }
    if (filters.dateRange.before) {
      nqlFilter.date.$lte = filters.dateRange.before;
    }
  }
  
  return Object.keys(nqlFilter).length > 0 ? nqlFilter : null;
}
```

---

## Action Operations

For mutations that call external APIs in real-time:

```typescript
private async executeAction(
  tool: ToolConfig,
  connectionId: string,
  args: Record<string, any>
): Promise<any> {
  const { input } = args;
  
  // Map tool name to Nango action name
  const actionName = this.getActionName(tool.name);
  
  // Execute via Nango
  const result = await this.nango.triggerAction(
    tool.providerConfigKey!,
    connectionId,
    actionName,
    input
  );
  
  return result;
}

private getActionName(toolName: string): string {
  // Tool name to Nango action mapping
  const mapping: Record<string, string> = {
    'send_email': 'send-email',
    'reply_email': 'reply-email',
    'create_calendar_event': 'create-event',
    'update_calendar_event': 'update-event',
    'create_entity': 'create-record',
    'update_entity': 'update-record'
  };
  
  return mapping[toolName] || toolName;
}
```

---

## Placeholder Resolution

Steps can reference results from previous steps:

```typescript
private resolvePlaceholders(
  args: any,
  previousResults: StepResult[]
): any {
  const json = JSON.stringify(args);
  
  // Find all {{stepId.result.path}} patterns
  const resolved = json.replace(
    /\{\{(\w+)\.result\.([^}]+)\}\}/g,
    (match, stepId, path) => {
      // Find the step's result
      const stepResult = previousResults.find(r => r.stepId === stepId);
      if (!stepResult || stepResult.status !== 'completed') {
        throw new Error(`Cannot resolve ${match}: step not completed`);
      }
      
      // Navigate the path
      const value = this.getValueAtPath(stepResult.result, path);
      if (value === undefined) {
        throw new Error(`Cannot resolve ${match}: path not found`);
      }
      
      // Return as string for JSON
      return typeof value === 'string' ? value : JSON.stringify(value);
    }
  );
  
  return JSON.parse(resolved);
}

private getValueAtPath(obj: any, path: string): any {
  const parts = path.split('.');
  let value = obj;
  
  for (const part of parts) {
    // Handle array notation: data[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      value = value[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
    } else {
      value = value?.[part];
    }
  }
  
  return value;
}
```

Example resolution:

```typescript
// Previous step result
{
  stepId: 'find_john',
  result: {
    data: [{ email: 'john@example.com', name: 'John' }]
  }
}

// Current step arguments
{
  to: '{{find_john.result.data[0].email}}',
  subject: 'Hello {{find_john.result.data[0].name}}'
}

// After resolution
{
  to: 'john@example.com',
  subject: 'Hello John'
}
```

---

## Connection Management

Getting the user's connection for a provider:

```typescript
private async getConnectionId(
  userId: string,
  providerConfigKey: string | undefined
): Promise<string | null> {
  if (!providerConfigKey) {
    return null;
  }
  
  // Handle provider aliases
  const normalizedProvider = this.normalizeProvider(providerConfigKey);
  
  const connection = await this.db.query(`
    SELECT connection_id 
    FROM connections 
    WHERE user_id = $1 
    AND (
      provider = $2 
      OR provider = ANY($3::text[])
    )
  `, [
    userId, 
    providerConfigKey,
    PROVIDER_ALIASES[normalizedProvider] || []
  ]);
  
  return connection[0]?.connection_id || null;
}
```

---

## Special Tools

Some tools have special handling:

### Meta Tool: Request Missing Parameters

```typescript
if (toolName === 'request_missing_parameters') {
  // Don't actually execute - just signal to UI
  return {
    type: 'parameter_request',
    parameters: args.input.parameters,
    context: args.input.context
  };
}
```

### Entity Tools (Generic CRM)

```typescript
if (toolName === 'fetch_entity') {
  const { entityType } = args.input;
  const model = `Salesforce${entityType}`;  // 'SalesforceLead'
  
  return await this.nango.listRecords({
    providerConfigKey: 'salesforce-ybzg',
    connectionId,
    model
  });
}

if (toolName === 'create_entity') {
  const { entityType, data } = args.input;
  
  return await this.nango.triggerAction(
    'salesforce-ybzg',
    connectionId,
    `create-${entityType.toLowerCase()}`,
    data
  );
}
```

---

## Error Handling

```typescript
async executeTool(...): Promise<any> {
  try {
    // ... execution logic
  } catch (error: any) {
    // Categorize error
    if (error.message.includes('connection')) {
      throw new ToolExecutionError(
        'PROVIDER_NOT_CONNECTED',
        `Please connect ${tool.providerConfigKey}`,
        { provider: tool.providerConfigKey }
      );
    }
    
    if (error.response?.status === 401) {
      throw new ToolExecutionError(
        'AUTH_EXPIRED',
        'Please reconnect your account',
        { provider: tool.providerConfigKey }
      );
    }
    
    if (error.response?.status === 429) {
      throw new ToolExecutionError(
        'RATE_LIMITED',
        'Too many requests, please try again',
        { retryAfter: error.response.headers['retry-after'] }
      );
    }
    
    throw new ToolExecutionError(
      'EXECUTION_FAILED',
      error.message,
      { originalError: error }
    );
  }
}
```

---

## Event Emission

The orchestrator emits events for real-time UI updates:

```typescript
class ToolOrchestrator extends EventEmitter {
  // Events emitted:
  // - 'step_started': { sessionId, step }
  // - 'step_completed': { sessionId, step, result }
  // - 'step_failed': { sessionId, step, error }
  // - 'plan_completed': { sessionId, results }
}

// Usage in WebSocket handler
orchestrator.on('step_completed', ({ sessionId, step, result }) => {
  websocket.emit(sessionId, {
    type: 'step_completed',
    stepId: step.id,
    result
  });
});
```

---

## The Complete Flow

```
User: "Send email to John about the meeting"
                    │
                    ▼
            ┌───────────────┐
            │ PlannerService│
            └───────┬───────┘
                    │
    ActionPlan: [
      { id: 'find', tool: 'fetch_contacts', args: { query: 'John' } },
      { id: 'send', tool: 'send_email', args: { 
          to: '{{find.result.data[0].email}}', 
          subject: 'Meeting', 
          body: '...' 
      }}
    ]
                    │
                    ▼
            ┌────────────────┐
            │ ToolOrchestrator│
            └───────┬────────┘
                    │
    Step 1: fetch_contacts
      → getConnectionId(userId, 'salesforce')
      → tool.source = 'cache'
      → nango.listRecords('SalesforceContact', { filter: 'John' })
      → result: { data: [{ email: 'john@example.com' }] }
                    │
    Step 2: send_email
      → resolvePlaceholders → to: 'john@example.com'
      → getConnectionId(userId, 'google-mail')
      → tool.source = 'action'
      → nango.triggerAction('send-email', { to, subject, body })
      → result: { success: true, id: 'msg_123' }
                    │
                    ▼
            ┌────────────────┐
            │    Response    │
            │ Email sent to  │
            │ john@example   │
            └────────────────┘
```

---

## Exercise

1. Look at `src/services/ToolOrchestrator.ts`
2. Trace a `fetch_emails` execution:
   - How does it get the tool config?
   - How does it build the cache filter?
   - What does the result look like?

3. Trace a `send_email` execution:
   - How does it map to a Nango action?
   - What happens if the connection is missing?

4. Think: What would you add for tool-level retries?

---

*Next: [Part 2 - The Planning Engine](../02-planning/README.md)*
