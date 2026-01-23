# Intent-First Cortex Architecture

## Overview

Cortex is now rebuilt around a core principle: **the LLM figures it out**.

Instead of forcing users to structure their intent into "when/if/then" forms, users describe what they want in natural language. The LLM understands intent and builds the right execution plan.

```
USER SAYS ANYTHING
        ↓
   LLM UNDERSTANDS
        ↓
   SYSTEM REACTS
```

## The Mental Model

- **Input**: Raw human intent in any form
- **Output**: Executable plan

The compiler isn't a parser. It's a **translator of intent into action**.

## What Changed

### Before
- Users had to think in "when X if Y then Z" structure
- Explicit, rigid, limited
- System parsed the structure

### After
- Users describe intent naturally: "Let me know when deals are about to stall"
- System infers: trigger, conditions, actions
- Handles ambiguity and generates clarifying questions when needed

## Key Components

### 1. Types (`types.ts`)

Simplified to focus on what actually executes:

```typescript
interface Unit {
  id: string;
  owner: string;
  name: string;
  description: string;
  
  raw: string;  // Original user input
  
  trigger: Trigger;        // What fires this
  conditions: Condition[];  // Must all be true
  actions: Action[];        // Execute in order
  
  status: 'active' | 'paused' | 'disabled';
}
```

#### Triggers

```typescript
type Trigger = EventTrigger | ScheduleTrigger | CompoundTrigger;

// Single event
{
  type: 'event',
  source: 'salesforce' | 'gmail' | 'google-calendar',
  event: 'opportunity_created' | 'email_received' | ...,
  filter?: 'payload.amount > 5000'  // Optional JS expression
}

// Schedule (cron)
{
  type: 'schedule',
  cron: '0 16 * * 5',  // Friday 4pm
  timezone?: 'user'
}

// Multiple triggers (any or all)
{
  type: 'compound',
  any: [...],  // Fire if ANY of these
  all: [...]   // Fire if ALL of these
}
```

#### Conditions

```typescript
type Condition = EvalCondition | SemanticCondition;

// Data-based
{
  type: 'eval',
  expr: 'payload.amount > 5000'  // JavaScript
}

// AI-detected
{
  type: 'semantic',
  check: 'urgency' | 'sentiment' | 'intent' | 'custom',
  prompt?: 'Does this customer sound unhappy?',  // For custom
  input?: '{{payload.body_text}}',
  expect: 'yes' | 'urgent' | 'negative'
}
```

#### Actions

Actions execute in order. Variables from earlier actions (with `as: "name"`) can be used in later ones.

```typescript
type Action =
  | LLMAction       // Summarize, generate, analyze, extract
  | ToolAction      // Slack, email, Salesforce, Notion, calendar
  | NotifyAction    // Send notification
  | WaitAction      // Pause for time
  | CheckAction     // Check if something happened
  | FetchAction     // Fetch data from a source
  | LookupAction    // Look up data by criteria
  | LogAction       // Log for debugging

// LLM Action
{
  type: 'llm',
  do: 'summarize' | 'generate' | 'analyze' | 'draft_reply' | 'extract',
  input: '{{payload.body_text}}',  // Template string
  as: 'summary'  // Store result here
}

// Tool Action
{
  type: 'slack',
  channel: '#alerts',
  message: '{{summary}}'  // Can reference earlier results
}

// Wait Action
{
  type: 'wait',
  for: '48h' | '3d' | 'until 5pm'
}

// Check Action
{
  type: 'check',
  that: 'no reply in thread {{payload.thread_id}}',
  then: 'continue' | 'stop',
  else: 'continue' | 'stop'
}
```

### 2. Compiler (`compiler.ts`)

The compiler accepts **raw natural language** and returns a compiled `Unit`.

```typescript
// Raw prompt (intent-first)
const result = await compiler.compile(
  'Whenever a deal closes over $5k, summarize and notify me',
  userId
);

// Or structured form (still supported)
const result = await compiler.compile({
  when: '...',
  if: '...',
  then: '...'
}, userId);
```

**Return types:**

```typescript
type CompileResult =
  | { type: 'unit'; unit: Unit }
  | { type: 'clarification'; question: string };
```

When the LLM thinks it needs more info, it asks:

```json
{
  "type": "clarification",
  "question": "I'd love to set this up! Just need clarity: what kinds of notifications would be most helpful?"
}
```

### 3. Routes (`routes.ts`)

Updated to accept raw prompts:

```bash
# Raw prompt (preferred)
POST /api/cortex/units
{
  "prompt": "Notify me when deals go over $5k"
}

# Structured form (backward compatible)
POST /api/cortex/units
{
  "when": "...",
  "if": "...",
  "then": "..."
}
```

Response:

```json
{
  "unit": {
    "id": "unit_...",
    "name": "Big deal alerts",
    "description": "...",
    "trigger": { ... },
    "conditions": [],
    "actions": [ ... ],
    "status": "active"
  }
}
```

Or if clarification needed:

```json
{
  "needsClarification": true,
  "question": "What kinds of deals should I watch for?"
}
```

## Examples

### 1. Simple Event → Action

**Input:**
```
"When I get an email from my boss, summarize it immediately"
```

**Compiled to:**
```json
{
  "name": "Boss email alerts",
  "description": "Get instant summaries of emails from boss",
  "trigger": {
    "type": "event",
    "source": "gmail",
    "event": "email_received",
    "filter": "payload.from.email === 'boss@company.com'"
  },
  "conditions": [],
  "actions": [
    { "type": "llm", "do": "summarize", "input": "{{payload.body_text}}", "as": "summary" },
    { "type": "notify", "message": "📧 From {{payload.from.name}}:\n{{summary}}" }
  ]
}
```

### 2. Semantic Detection

**Input:**
```
"Alert me if a customer email sounds upset"
```

**Compiled to:**
```json
{
  "name": "Upset customer alerts",
  "trigger": {
    "type": "event",
    "source": "gmail",
    "event": "email_received"
  },
  "conditions": [
    { "type": "semantic", "check": "custom", "prompt": "Does this sound upset or angry?", "input": "{{payload.body_text}}", "expect": "yes" }
  ],
  "actions": [
    { "type": "llm", "do": "analyze", "input": "{{payload.body_text}}", "as": "analysis" },
    { "type": "notify", "message": "⚠️ Unhappy customer:\n{{analysis}}" },
    { "type": "slack", "channel": "#customer-issues", "message": "Escalation needed" }
  ]
}
```

### 3. Multi-Step Sequence

**Input:**
```
"Follow up on unsent emails after 2 days, then again after 5 days. If still no reply, mark as unresponsive."
```

**Compiled to:**
```json
{
  "name": "Automatic follow-up sequence",
  "trigger": {
    "type": "event",
    "source": "gmail",
    "event": "email_sent"
  },
  "conditions": [],
  "actions": [
    { "type": "wait", "for": "2d" },
    { "type": "check", "that": "no reply to {{payload.thread_id}}", "then": "continue", "else": "stop" },
    { "type": "llm", "do": "generate", "input": "Gentle follow-up to: {{payload.subject}}", "as": "followup1" },
    { "type": "email", "reply_to": "{{payload.thread_id}}", "body": "{{followup1}}" },
    { "type": "wait", "for": "3d" },
    { "type": "check", "that": "no reply to {{payload.thread_id}}", "then": "continue", "else": "stop" },
    { "type": "salesforce", "do": "update_lead", "id": "lookup:{{payload.to[0].email}}", "fields": { "Status": "Unresponsive" } }
  ]
}
```

### 4. Scheduled Digest

**Input:**
```
"Every Friday at 4pm, send me a digest of the week's top leads"
```

**Compiled to:**
```json
{
  "name": "Weekly lead digest",
  "trigger": {
    "type": "schedule",
    "cron": "0 16 * * 5",
    "timezone": "user"
  },
  "conditions": [],
  "actions": [
    { "type": "fetch", "from": "salesforce", "query": "leads created this week", "as": "leads" },
    { "type": "llm", "do": "analyze", "input": "Rank these leads:\n{{leads}}", "as": "ranking" },
    { "type": "notify", "message": "📊 **Weekly Digest**\n{{ranking}}" }
  ]
}
```

## System Prompt

The compiler uses an instruction-based LLM (Groq's Llama 3.1 70B) with a comprehensive system prompt that:

1. **Teaches the LLM about available events** — All supported sources and event types
2. **Documents actions** — What operations can be performed
3. **Explains payload fields** — What data is available from each source
4. **Provides examples** — 6 diverse examples showing different patterns
5. **Defines conditions** — Data-based and semantic checks
6. **Guides tone** — Infer generously, chain intelligently, handle ambiguity

The prompt is tuned for `temperature: 0.2` (low randomness) to ensure consistent, deterministic compilation.

## Integration Points

### With Services
- **ConversationService**: For context and user history
- **ToolOrchestrator**: For executing actions
- **ToolConfigManager**: For tool capabilities
- **BeatEngine**: For custom processing hooks

### With Existing Code
- **action-launcher.service.ts**: Uses compiled units to launch actions
- **runtime.ts**: Executes compiled units against events
- **poller.ts**: Feeds events into the system
- **store.ts**: Persists units and runs

## Testing

Run the compiler test:

```bash
GROQ_API_KEY="..." npx ts-node src/cortex/test-compiler.ts
```

This tests:
- Raw prompt compilation
- Structured form compilation
- Clarification flow
- Complex sequences
- Semantic detection

## API Usage

### Create automation from raw prompt

```bash
curl -X POST http://localhost:8080/api/cortex/units \
  -H "x-user-id: user_123" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Whenever a new deal lands in Salesforce over $5k, remind me to review it"
  }'
```

### Create automation from structured form (backward compatible)

```bash
curl -X POST http://localhost:8080/api/cortex/units \
  -H "x-user-id: user_123" \
  -H "Content-Type: application/json" \
  -d '{
    "when": "when a new deal lands",
    "if": "amount > 5000",
    "then": "notify me"
  }'
```

### Get user's automations

```bash
curl http://localhost:8080/api/cortex/units \
  -H "x-user-id: user_123"
```

### Toggle automation

```bash
curl -X PATCH http://localhost:8080/api/cortex/units/{id}/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "paused" }'
```

## What Makes This Different

**vs. Zapier:**
- Zapier requires users to pick trigger, action, and configure each
- Cortex: Just say what you want, the AI figures out the structure
- Zapier is **explicit**, Cortex is **intelligent**

**vs. IFTTT:**
- IFTTT: Limited to predefined applets
- Cortex: Unlimited combinations through LLM understanding
- IFTTT is **templated**, Cortex is **generative**

**vs. Custom Code:**
- Code is powerful but requires development
- Cortex is instant, natural language automation
- Code is **manual**, Cortex is **intelligent**

## Next Steps

1. **Extend triggers** — Add Stripe, Notion, Asana, custom webhooks
2. **Extend actions** — Expand available tools
3. **Add feedback loop** — Learn from successful automations
4. **Semantic actions** — More sophisticated AI operations
5. **Human approval** — Optional confirmation before sensitive actions
6. **Analytics** — Track most useful automations
