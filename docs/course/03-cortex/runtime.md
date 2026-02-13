# 3.4 Runtime Execution

> Execute matched rules, step by step.

---

## The Runtime's Job

Take a Run and execute its Unit's actions:

```
Run (pending)
      │
      ▼
┌───────────┐
│  Runtime  │
│           │
│  Load:    │    → Get Unit from store
│  Execute: │    → Run each action in then[]
│  Store:   │    → Save results to context
│  Handle:  │    → Wait actions, errors
└───────────┘
      │
      ▼
Run (success | failed | waiting)
```

---

## The Runtime Class

```typescript
// packages/cortex/src/Runtime.ts

export class Runtime {
  constructor(
    private store: HybridStore,
    private groqApiKey: string,
    private tools: ToolExecutor,
    private logger: Logger
  ) {}
  
  async execute(run: Run): Promise<void> {
    // 1. Load the Unit
    const unit = await this.store.getUnit(run.unit_id);
    if (!unit) {
      await this.failRun(run, 'Unit not found');
      return;
    }
    
    // 2. Get event payload for context
    const event = await this.store.getEvent(run.event_id);
    const context: Record<string, any> = {
      ...run.context,
      payload: event?.payload || {}
    };
    
    // 3. Mark as running
    run.status = 'running';
    await this.store.saveRun(run);
    
    // 4. Execute actions from current step
    try {
      for (let i = run.step; i < unit.then.length; i++) {
        const action = unit.then[i];
        run.step = i;
        
        this.logger.info(`Executing step ${i}`, { runId: run.id, action: action.type });
        
        const result = await this.executeAction(action, context, run.user_id);
        
        // Handle wait action
        if (action.type === 'wait') {
          run.status = 'waiting';
          run.resume_at = this.calculateResumeTime(action.duration);
          await this.store.saveRun(run);
          return;  // Exit, will resume later
        }
        
        // Store result if requested
        if (action.store_as && result !== undefined) {
          context[action.store_as] = result;
          run.context = context;
        }
        
        // Log step
        await this.store.logRunStep(run.id, i, action, 'success', result);
      }
      
      // 5. All actions completed
      run.status = 'success';
      run.completed_at = new Date().toISOString();
      
    } catch (error: any) {
      await this.failRun(run, error.message);
      await this.store.logRunStep(run.id, run.step, unit.then[run.step], 'failed', null, error.message);
    }
    
    await this.store.saveRun(run);
  }
}
```

---

## Executing Actions

Route to the appropriate handler:

```typescript
private async executeAction(
  action: Action,
  context: Record<string, any>,
  userId: string
): Promise<any> {
  switch (action.type) {
    case 'tool':
      return await this.executeToolAction(action, context, userId);
    
    case 'llm':
      return await this.executeLLMAction(action, context);
    
    case 'wait':
      return null;  // Handled specially in execute()
    
    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}
```

---

## Tool Actions

Execute a tool via the ToolExecutor:

```typescript
private async executeToolAction(
  action: ToolAction,
  context: Record<string, any>,
  userId: string
): Promise<any> {
  // 1. Resolve templates in args
  const resolvedArgs = this.resolveTemplates(action.args, context);
  
  // 2. Map Cortex tool name to ASO tool
  const asoTool = this.mapToolName(action.tool);
  
  // 3. Execute via ToolExecutor
  const result = await this.tools.execute(asoTool, resolvedArgs, userId);
  
  return result;
}

private mapToolName(cortexTool: string): string {
  // Cortex uses 'slack.send', ASO uses 'send_slack_message'
  const mapping: Record<string, string> = {
    'slack.send': 'send_slack_message',
    'gmail.send': 'send_email',
    'gmail.reply': 'reply_email',
    'calendar.create': 'create_calendar_event',
    'salesforce.create': 'create_entity'
  };
  
  return mapping[cortexTool] || cortexTool;
}
```

---

## LLM Actions

Invoke the LLM for text generation:

```typescript
private async executeLLMAction(
  action: LLMAction,
  context: Record<string, any>
): Promise<string> {
  // 1. Resolve templates in input
  const resolvedInput = this.resolveTemplates(action.input, context);
  
  // 2. Build prompt based on type
  const prompt = this.buildLLMPrompt(action.prompt, resolvedInput);
  
  // 3. Call LLM
  const llm = new Groq({ apiKey: this.groqApiKey });
  const response = await llm.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    max_tokens: 500,
    temperature: 0.7  // More creative for generation
  });
  
  return response.choices[0].message.content || '';
}

private buildLLMPrompt(promptType: string, input: any): { system: string; user: string } {
  switch (promptType) {
    case 'summarize':
      return {
        system: 'Summarize the following text concisely. Focus on key points and action items.',
        user: input.text
      };
    
    case 'draft_reply':
      return {
        system: 'Draft a professional reply to this email. Be helpful and concise.',
        user: `Original email:\n${input.text}\n\nContext: ${input.context || ''}`
      };
    
    case 'extract_action_items':
      return {
        system: 'Extract action items from this text. List each as a bullet point.',
        user: input.text
      };
    
    default:
      // Custom prompt
      return {
        system: promptType,
        user: JSON.stringify(input)
      };
  }
}
```

---

## Template Resolution

Replace `{{variable}}` with context values:

```typescript
private resolveTemplates(obj: any, context: Record<string, any>): any {
  const json = JSON.stringify(obj);
  
  const resolved = json.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    // Handle payload.field
    if (path.startsWith('payload.')) {
      const fieldPath = path.substring(8);
      const value = this.getValueAtPath(context.payload, fieldPath);
      return value !== undefined ? this.stringify(value) : match;
    }
    
    // Handle context.field or direct field reference
    const cleanPath = path.startsWith('context.') ? path.substring(8) : path;
    const value = this.getValueAtPath(context, cleanPath);
    return value !== undefined ? this.stringify(value) : match;
  });
  
  return JSON.parse(resolved);
}

private stringify(value: any): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
```

---

## Wait Actions

Pause execution and resume later:

```typescript
// In execute()
if (action.type === 'wait') {
  run.status = 'waiting';
  run.resume_at = this.calculateResumeTime(action.duration);
  run.step = i + 1;  // Resume at NEXT step
  await this.store.saveRun(run);
  return;
}

private calculateResumeTime(duration: string): string {
  const now = Date.now();
  
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  
  const [, amount, unit] = match;
  const ms = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  }[unit];
  
  return new Date(now + parseInt(amount) * ms!).toISOString();
}
```

---

## Resuming Waiting Runs

A scheduler periodically checks for runs to resume:

```typescript
async resumeWaitingRuns(): Promise<void> {
  const now = Date.now();
  const waitingRuns = await this.store.getWaitingRuns(now);
  
  for (const run of waitingRuns) {
    this.logger.info(`Resuming run ${run.id}`);
    await this.execute(run);  // Continue from run.step
  }
}

// Called by a cron job every minute
// cron.schedule('* * * * *', () => runtime.resumeWaitingRuns());
```

---

## Error Handling

```typescript
private async failRun(run: Run, error: string): Promise<void> {
  run.status = 'failed';
  run.error = error;
  run.completed_at = new Date().toISOString();
  
  this.logger.error(`Run failed: ${error}`, { runId: run.id });
  
  // Could notify user, retry, etc.
}
```

---

## Run Step Logging

Every action is logged for debugging and audit:

```typescript
// In HybridStore
async logRunStep(
  runId: string,
  stepIndex: number,
  action: Action,
  status: 'success' | 'failed',
  result?: any,
  error?: string
): Promise<void> {
  await this.sql`
    INSERT INTO cortex_run_steps (run_id, step_index, action_type, action_config, status, result, error, executed_at)
    VALUES (
      ${runId},
      ${stepIndex},
      ${action.type},
      ${JSON.stringify(action)},
      ${status},
      ${result ? JSON.stringify(result) : null},
      ${error || null},
      NOW()
    )
  `;
}
```

---

## Full Execution Example

**Unit**:
```json
{
  "then": [
    { "type": "llm", "prompt": "summarize", "input": { "text": "{{payload.body_text}}" }, "store_as": "summary" },
    { "type": "wait", "duration": "1h" },
    { "type": "tool", "tool": "slack.send", "args": { "message": "Summary: {{summary}}" } }
  ]
}
```

**Execution flow**:

```
Step 0: LLM summarize
  - Input: payload.body_text = "Long email content..."
  - Result: "Client needs project update by Friday"
  - Stored as: context.summary

Step 1: Wait 1h
  - Run marked as 'waiting'
  - resume_at = now + 1 hour
  - Execution pauses

... 1 hour later, scheduler picks up run ...

Step 2: Tool slack.send
  - Resolve: {{summary}} → "Client needs project update by Friday"
  - Execute: Send Slack message
  - Result: { success: true }

Run completed: status = 'success'
```

---

## Exercise

1. Trace the execution of this Unit:
```json
{
  "then": [
    { "type": "llm", "prompt": "extract_action_items", "input": { "text": "{{payload.body}}" }, "store_as": "actions" },
    { "type": "tool", "tool": "gmail.send", "args": { 
        "to": "{{payload.from.email}}", 
        "subject": "Re: {{payload.subject}}", 
        "body": "Thanks! Action items noted:\n{{actions}}" 
      } 
    }
  ]
}
```

2. What happens if the email send fails?

3. What would you add for retry logic?

---

*Next: [3.5 Webhook Integration](./webhooks.md)*
