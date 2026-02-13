# 3.3 Event Matching

> Which rules fire for this event?

---

## The Matcher's Job

When an Event arrives:
1. Find all Units with matching triggers
2. Evaluate any conditions
3. Create Runs for matching Units

```
Event (email_received)
         │
         ▼
   ┌───────────┐
   │  Matcher  │
   │           │
   │  Find:    │    → Units with trigger: {source: 'gmail', event: 'email_received'}
   │  Filter:  │    → Evaluate trigger filters
   │  Evaluate:│    → Check conditions (eval + semantic)
   │  Create:  │    → Create Runs for passing Units
   └───────────┘
         │
         ▼
   [Run, Run, ...]
```

---

## The Matcher Class

```typescript
// packages/cortex/src/Matcher.ts

export class Matcher {
  constructor(
    private store: HybridStore,
    private groqApiKey: string
  ) {}
  
  async match(event: Event): Promise<Run[]> {
    const runs: Run[] = [];
    
    // 1. Find Units with matching trigger
    const candidates = await this.store.getUnitsByTrigger(
      event.source,
      event.event
    );
    
    // 2. Filter to active units owned by this user
    const activeUnits = candidates.filter(
      u => u.status === 'active' && u.owner === event.user_id
    );
    
    // 3. Evaluate each unit
    for (const unit of activeUnits) {
      const matches = await this.evaluateUnit(unit, event);
      
      if (matches) {
        // Create a Run
        const run: Run = {
          id: `run_${generateId()}`,
          unit_id: unit.id,
          event_id: event.id,
          user_id: event.user_id,
          status: 'pending',
          step: 0,
          context: {},
          started_at: new Date().toISOString()
        };
        
        runs.push(run);
        await this.store.saveRun(run, event.payload);
      }
    }
    
    return runs;
  }
}
```

---

## Evaluating a Unit

```typescript
private async evaluateUnit(unit: Unit, event: Event): Promise<boolean> {
  // 1. Check trigger filter (if any)
  if (unit.when.type === 'event' && unit.when.filter) {
    const filterPasses = this.evalFilter(unit.when.filter, event);
    if (!filterPasses) {
      return false;
    }
  }
  
  // 2. Check all conditions
  for (const condition of unit.if) {
    const passes = await this.evalCondition(condition, event);
    if (!passes) {
      return false;  // All conditions must pass
    }
  }
  
  return true;
}
```

---

## Filter Evaluation

Trigger filters are JavaScript expressions:

```typescript
private evalFilter(filter: string, event: Event): boolean {
  try {
    // Create a safe evaluation context
    const context = {
      payload: event.payload,
      event: event.event,
      source: event.source
    };
    
    // Use Function constructor for sandboxed eval
    const fn = new Function('payload', 'event', 'source', `return ${filter}`);
    return fn(context.payload, context.event, context.source);
  } catch (error) {
    console.error('Filter evaluation error:', error);
    return false;  // Fail closed
  }
}
```

**Examples**:
```typescript
// Filter: "payload.amount >= 50000"
evalFilter("payload.amount >= 50000", { payload: { amount: 75000 } })
// → true

// Filter: "payload.labels.includes('IMPORTANT')"
evalFilter("payload.labels.includes('IMPORTANT')", { payload: { labels: ['INBOX', 'IMPORTANT'] } })
// → true
```

---

## Condition Evaluation

### Eval Conditions

```typescript
private async evalCondition(condition: Condition, event: Event): Promise<boolean> {
  if (condition.type === 'eval') {
    return this.evalLogicalCondition(condition, event);
  } else if (condition.type === 'semantic') {
    return await this.evalSemanticCondition(condition, event);
  }
  
  return false;
}

private evalLogicalCondition(condition: EvalCondition, event: Event): boolean {
  try {
    const fn = new Function('payload', `return ${condition.expr}`);
    return fn(event.payload);
  } catch (error) {
    console.error('Condition evaluation error:', error);
    return false;
  }
}
```

### Semantic Conditions

This is where Cortex gets powerful — using LLM for classification:

```typescript
private async evalSemanticCondition(
  condition: SemanticCondition,
  event: Event
): Promise<boolean> {
  // 1. Resolve the input template
  const input = this.resolveTemplate(condition.input || '', event.payload);
  
  // 2. Build classification prompt
  const prompt = this.buildClassificationPrompt(condition.check, input, condition.prompt);
  
  // 3. Call LLM
  const llm = new Groq({ apiKey: this.groqApiKey });
  const response = await llm.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    max_tokens: 20,
    temperature: 0.1
  });
  
  const result = response.choices[0].message.content?.trim().toLowerCase() || '';
  
  // 4. Check against expected value
  return result === condition.expect.toLowerCase();
}
```

---

## Classification Prompts

Built-in checks have predefined prompts:

```typescript
private buildClassificationPrompt(
  check: string,
  input: string,
  customPrompt?: string
): string {
  switch (check) {
    case 'urgency':
      return `Classify the urgency of this message.
Reply with exactly one word: low, medium, or high.

Guidelines:
- high: Time-sensitive, uses urgent language, requires immediate action
- medium: Important but not time-critical
- low: Informational, no action required`;
    
    case 'sentiment':
      return `Classify the sentiment of this message.
Reply with exactly one word: positive, neutral, or negative.`;
    
    case 'intent':
      return `Classify the intent of this message.
Reply with exactly one word: question, request, complaint, info, or action_required.`;
    
    case 'custom':
      return customPrompt || 'Classify this message. Reply with one word.';
    
    default:
      throw new Error(`Unknown check type: ${check}`);
  }
}
```

---

## Template Resolution

Replace `{{payload.field}}` with actual values:

```typescript
private resolveTemplate(template: string, payload: any): string {
  return template.replace(/\{\{payload\.([^}]+)\}\}/g, (match, path) => {
    const value = this.getValueAtPath(payload, path);
    return value !== undefined ? String(value) : match;
  });
}

private getValueAtPath(obj: any, path: string): any {
  const parts = path.split('.');
  let value = obj;
  
  for (const part of parts) {
    value = value?.[part];
  }
  
  return value;
}
```

**Example**:
```typescript
resolveTemplate(
  '{{payload.subject}} {{payload.body_text}}',
  { subject: 'Urgent: Help needed', body_text: 'Please respond ASAP' }
)
// → 'Urgent: Help needed Please respond ASAP'
```

---

## Performance Considerations

Semantic conditions require LLM calls, which are slow and costly. Optimize by:

### 1. Filter First
Evaluate trigger filters and eval conditions before semantic:

```typescript
private async evaluateUnit(unit: Unit, event: Event): Promise<boolean> {
  // Fast: trigger filter
  if (unit.when.filter && !this.evalFilter(unit.when.filter, event)) {
    return false;
  }
  
  // Fast: eval conditions
  const evalConditions = unit.if.filter(c => c.type === 'eval');
  for (const cond of evalConditions) {
    if (!this.evalLogicalCondition(cond, event)) {
      return false;
    }
  }
  
  // Slow: semantic conditions (only if fast checks pass)
  const semanticConditions = unit.if.filter(c => c.type === 'semantic');
  for (const cond of semanticConditions) {
    if (!await this.evalSemanticCondition(cond, event)) {
      return false;
    }
  }
  
  return true;
}
```

### 2. Cache Classifications
For repeated similar content:

```typescript
private classificationCache = new Map<string, string>();

private async evalSemanticCondition(condition: SemanticCondition, event: Event): Promise<boolean> {
  const input = this.resolveTemplate(condition.input || '', event.payload);
  const cacheKey = `${condition.check}:${hashString(input)}`;
  
  let result = this.classificationCache.get(cacheKey);
  
  if (!result) {
    result = await this.callLLMForClassification(condition, input);
    this.classificationCache.set(cacheKey, result);
  }
  
  return result === condition.expect.toLowerCase();
}
```

### 3. Batch Processing
If multiple units need the same classification:

```typescript
// Group units by their semantic condition inputs
// Make one LLM call, apply result to all
```

---

## The Match Flow

```
Event arrives: email_received from sarah@client.com
                    │
                    ▼
            ┌───────────────┐
            │ Find Units    │
            │ source=gmail  │
            │ event=email   │
            └───────┬───────┘
                    │
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
       Unit A    Unit B    Unit C
    (all emails) (urgent) (from VIP)
          │         │         │
          ▼         ▼         ▼
    No filter   Semantic   Eval filter
    ✓ Pass      check      "VIP list"
          │         │         │
          │         ▼         ▼
          │    LLM: "high"  Match list
          │    ✓ Pass      ✗ Fail
          │         │
          ▼         ▼
       Run A     Run B
       created   created
```

---

## Exercise

1. Given this Event:
```json
{
  "source": "salesforce",
  "event": "opportunity_closed_won",
  "payload": {
    "name": "Acme Deal",
    "amount": 75000,
    "owner": "john@company.com"
  }
}
```

2. And these Units:
   - Unit A: trigger = opportunity_closed_won, no conditions
   - Unit B: trigger = opportunity_closed_won, filter = "payload.amount > 50000"
   - Unit C: trigger = opportunity_closed_won, filter = "payload.amount > 100000"

3. Which Units match? Which Runs get created?

---

*Next: [3.4 Runtime Execution](./runtime.md)*
