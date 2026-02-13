# 3.2 Natural Language Compilation

> "When I get an urgent email, summarize it" → executable automation.

---

## The Compiler's Job

Transform natural language rules into structured Units:

```
Input:  "When I receive an email from a VIP client, if it seems urgent,
         summarize it and send me a Slack notification"

Output: Unit {
          when: { type: 'event', source: 'gmail', event: 'email_received' },
          if: [{ type: 'semantic', check: 'urgency', expect: 'high' }],
          then: [
            { type: 'llm', prompt: 'summarize', ... },
            { type: 'tool', tool: 'slack.send', ... }
          ]
        }
```

---

## The Compiler Class

```typescript
// packages/cortex/src/Compiler.ts

export class Compiler {
  private llm: Groq;
  
  constructor(apiKey: string, private model = 'llama-3.3-70b-versatile') {
    this.llm = new Groq({ apiKey });
  }
  
  async compile(
    input: { when: string; if?: string; then: string },
    userId: string
  ): Promise<Unit> {
    const prompt = this.buildCompilationPrompt(input);
    
    const response = await this.llm.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(input) }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    const compiled = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      id: `unit_${Date.now()}`,
      owner: userId,
      name: this.generateName(input),
      raw: input,
      when: compiled.when,
      if: compiled.if || [],
      then: compiled.then,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
}
```

---

## The Compilation Prompt

This is the critical system prompt that teaches the LLM how to compile:

```typescript
const COMPILER_SYSTEM_PROMPT = `You are a compiler for ASO Cortex automation rules.
Convert natural language rules into structured JSON.

## INPUT FORMAT
{
  "when": "natural language trigger description",
  "if": "optional condition",
  "then": "what to do"
}

## OUTPUT FORMAT
{
  "when": <Trigger>,
  "if": [<Condition>, ...],
  "then": [<Action>, ...]
}

## AVAILABLE EVENTS

### Gmail (source: "gmail")
- email_received: New email arrived
  Payload: { id, from: { email, name }, subject, body_text, body_html, labels, hasAttachment }
- email_sent: User sent an email
- email_reply_received: Reply to user's email

### Google Calendar (source: "google-calendar")  
- event_created: New calendar event
  Payload: { id, title, start, end, attendees, location }
- event_updated: Event was modified
- event_starting: Event about to start (15 min before)

### Salesforce (source: "salesforce")
- lead_created: New lead
  Payload: { id, name, email, company, status, source }
- lead_stage_changed: Lead status changed
  Payload: { id, name, old_stage, new_stage }
- opportunity_created: New opportunity
  Payload: { id, name, amount, stage, close_date }
- opportunity_updated: Opportunity modified
- opportunity_closed_won: Deal won
  Payload: { id, name, amount }
- opportunity_closed_lost: Deal lost

## TRIGGER TYPES

### EventTrigger
{
  "type": "event",
  "source": "gmail" | "google-calendar" | "salesforce",
  "event": "<event_name>",
  "filter": "<optional JS expression>"
}

### ScheduleTrigger
{
  "type": "schedule",
  "cron": "<cron expression>",
  "timezone": "<optional timezone>"
}

## CONDITION TYPES

### EvalCondition (logical/numeric checks)
{
  "type": "eval",
  "expr": "<JS expression using payload.*>"
}

### SemanticCondition (LLM classification)
{
  "type": "semantic",
  "check": "urgency" | "sentiment" | "intent" | "custom",
  "input": "{{payload.field}}",  // What to classify
  "expect": "<expected result>"
}

Urgency levels: low, medium, high
Sentiment: positive, neutral, negative
Intent: question, request, complaint, info, action_required

## ACTION TYPES

### ToolAction
{
  "type": "tool",
  "tool": "slack.send" | "gmail.send" | "gmail.reply" | "salesforce.create" | "calendar.create",
  "args": { ... },
  "store_as": "<optional variable name>"
}

### LLMAction
{
  "type": "llm",
  "prompt": "summarize" | "draft_reply" | "extract_action_items" | "<custom prompt>",
  "input": { "text": "{{payload.body_text}}" },
  "store_as": "<variable name>"
}

### WaitAction
{
  "type": "wait",
  "duration": "30m" | "1h" | "24h" | "7d"
}

## TEMPLATE SYNTAX
- {{payload.field}} - Access event payload
- {{context.var}} or {{var}} - Access stored variables

## EXAMPLES

Input: { "when": "I receive an email", "then": "summarize it" }
Output:
{
  "when": { "type": "event", "source": "gmail", "event": "email_received" },
  "if": [],
  "then": [
    { "type": "llm", "prompt": "summarize", "input": { "text": "{{payload.body_text}}" }, "store_as": "summary" }
  ]
}

Input: { "when": "a deal over $50k closes", "then": "send celebration to #wins" }
Output:
{
  "when": { 
    "type": "event", 
    "source": "salesforce", 
    "event": "opportunity_closed_won",
    "filter": "payload.amount >= 50000"
  },
  "if": [],
  "then": [
    { 
      "type": "tool", 
      "tool": "slack.send", 
      "args": { 
        "channel": "#wins", 
        "message": "🎉 {{payload.name}} closed for ${{payload.amount}}!" 
      } 
    }
  ]
}

Input: { "when": "I get an email", "if": "it seems urgent", "then": "send me a Slack DM with the summary" }
Output:
{
  "when": { "type": "event", "source": "gmail", "event": "email_received" },
  "if": [
    { "type": "semantic", "check": "urgency", "input": "{{payload.subject}} {{payload.body_text}}", "expect": "high" }
  ],
  "then": [
    { "type": "llm", "prompt": "summarize", "input": { "text": "{{payload.body_text}}" }, "store_as": "summary" },
    { "type": "tool", "tool": "slack.send", "args": { "channel": "@me", "message": "🚨 Urgent: {{summary}}" } }
  ]
}
`;
```

---

## Compilation Flow

```typescript
async compile(input: { when: string; if?: string; then: string }, userId: string): Promise<Unit> {
  // 1. Build prompt with schema documentation
  const prompt = this.buildCompilationPrompt(input);
  
  // 2. Call LLM
  const response = await this.llm.chat.completions.create({
    model: this.model,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: JSON.stringify(input) }
    ],
    temperature: 0.1,  // Low for consistent compilation
    response_format: { type: 'json_object' }
  });
  
  // 3. Parse response
  const compiled = JSON.parse(response.choices[0].message.content || '{}');
  
  // 4. Validate structure
  this.validateCompiled(compiled);
  
  // 5. Build Unit
  return {
    id: `unit_${generateId()}`,
    owner: userId,
    name: this.generateName(input),
    raw: input,
    when: compiled.when,
    if: compiled.if || [],
    then: compiled.then,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
```

---

## Validation

Ensure the LLM produced valid structure:

```typescript
private validateCompiled(compiled: any): void {
  // Check trigger
  if (!compiled.when) {
    throw new Error('Missing trigger (when)');
  }
  if (!['event', 'schedule', 'compound'].includes(compiled.when.type)) {
    throw new Error(`Invalid trigger type: ${compiled.when.type}`);
  }
  
  // Check event trigger specifics
  if (compiled.when.type === 'event') {
    const validSources = ['gmail', 'google-calendar', 'salesforce', 'slack'];
    if (!validSources.includes(compiled.when.source)) {
      throw new Error(`Invalid event source: ${compiled.when.source}`);
    }
  }
  
  // Check conditions
  if (compiled.if && !Array.isArray(compiled.if)) {
    throw new Error('Conditions (if) must be an array');
  }
  
  // Check actions
  if (!compiled.then || !Array.isArray(compiled.then) || compiled.then.length === 0) {
    throw new Error('Actions (then) must be a non-empty array');
  }
  
  for (const action of compiled.then) {
    if (!['tool', 'llm', 'wait'].includes(action.type)) {
      throw new Error(`Invalid action type: ${action.type}`);
    }
  }
}
```

---

## Name Generation

Generate a human-friendly name from the rule:

```typescript
private generateName(input: { when: string; if?: string; then: string }): string {
  // Simple heuristic: use first few words of "when" + "then"
  const whenPart = input.when.split(' ').slice(0, 3).join(' ');
  const thenPart = input.then.split(' ').slice(0, 3).join(' ');
  
  return `${whenPart} → ${thenPart}`;
}

// "When I receive an email from a client" → "When I receive → Send me a"
```

Or use LLM to generate a better name:

```typescript
private async generateNameWithLLM(input: { when: string; if?: string; then: string }): Promise<string> {
  const response = await this.llm.chat.completions.create({
    model: this.model,
    messages: [
      { role: 'system', content: 'Generate a short (3-5 word) name for this automation rule. Reply with just the name.' },
      { role: 'user', content: `When: ${input.when}\nIf: ${input.if || 'always'}\nThen: ${input.then}` }
    ],
    max_tokens: 20
  });
  
  return response.choices[0].message.content || 'Unnamed Rule';
}
```

---

## Handling Ambiguity

When the natural language is ambiguous, the compiler makes reasonable defaults:

**Input**: "When I get an email, notify me"

**Ambiguities**:
- "notify me" via what? (Slack? Email? Push?)
- Which email address? All? Specific senders?

**Compiler defaults**:
```json
{
  "when": { "type": "event", "source": "gmail", "event": "email_received" },
  "then": [
    { 
      "type": "tool", 
      "tool": "slack.send",  // Default notification channel
      "args": { 
        "channel": "@me",    // DM to self
        "message": "New email from {{payload.from.name}}: {{payload.subject}}" 
      } 
    }
  ]
}
```

The user can then refine if the defaults aren't right.

---

## Re-compilation

Users can edit the natural language and re-compile:

```typescript
async recompile(unitId: string, newInput: { when: string; if?: string; then: string }): Promise<Unit> {
  const existing = await this.store.getUnit(unitId);
  
  if (!existing) {
    throw new Error('Unit not found');
  }
  
  // Compile with new input
  const recompiled = await this.compile(newInput, existing.owner);
  
  // Preserve metadata
  recompiled.id = existing.id;
  recompiled.run_count = existing.run_count;
  recompiled.created_at = existing.created_at;
  
  await this.store.saveUnit(recompiled);
  
  return recompiled;
}
```

---

## Exercise

1. Write natural language rules for:
   - "When a meeting is about to start, send me the agenda"
   - "When a lead is created from the website, wait 1 hour, then send a follow-up email"

2. Think through what the compiled structure would look like:
   - What's the trigger?
   - Any conditions?
   - What actions?

3. What ambiguities might the compiler need to resolve?

---

*Next: [3.3 Event Matching](./matcher.md)*
