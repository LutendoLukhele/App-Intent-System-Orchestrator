# 3.1 The Cortex Model

> Units, Runs, Events — the data model for reactive automation.

---

## Core Entities

### Event

An incoming trigger from an external service:

```typescript
interface Event<T = any> {
  id: string;                    // Unique event ID
  source: EventSource;           // 'gmail' | 'salesforce' | 'google-calendar'
  event: string;                 // 'email_received', 'lead_created'
  timestamp: string;             // ISO timestamp
  user_id: string;               // Which user owns this event
  payload: T;                    // Event-specific data
  meta?: {
    dedupe_key?: string;         // For idempotency
    connection_id?: string;      // Nango connection
  };
}

type EventSource = 'gmail' | 'google-calendar' | 'salesforce' | 'slack';
```

**Example**: New email received
```json
{
  "id": "evt_abc123",
  "source": "gmail",
  "event": "email_received",
  "timestamp": "2024-01-15T10:30:00Z",
  "user_id": "user_456",
  "payload": {
    "id": "thread_789",
    "from": {
      "email": "sarah@client.com",
      "name": "Sarah"
    },
    "subject": "Urgent: Project Update Needed",
    "body_text": "Hi, can you send me the latest status?",
    "labels": ["INBOX", "IMPORTANT"],
    "hasAttachment": false
  }
}
```

---

### Unit

A compiled automation rule:

```typescript
interface Unit {
  id: string;                    // Unique rule ID
  owner: string;                 // userId who created it
  name: string;                  // Human-friendly name
  
  // Original natural language
  raw: {
    when: string;                // "When I receive an email from a client"
    if?: string;                 // "If it's marked urgent"
    then: string;                // "Send me a Slack notification"
  };
  
  // Compiled structure
  when: Trigger;                 // Parsed trigger
  if: Condition[];               // Parsed conditions (can be empty)
  then: Action[];                // Parsed actions
  
  // State
  status: 'active' | 'paused' | 'disabled';
  run_count?: number;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}
```

**Example**: Client email notification
```json
{
  "id": "unit_xyz",
  "owner": "user_456",
  "name": "Client email notification",
  "raw": {
    "when": "I receive an email from a client",
    "if": "it seems urgent",
    "then": "Send me a Slack message with the summary"
  },
  "when": {
    "type": "event",
    "source": "gmail",
    "event": "email_received",
    "filter": null
  },
  "if": [
    {
      "type": "semantic",
      "check": "urgency",
      "input": "{{payload.subject}} {{payload.body_text}}",
      "expect": "high"
    }
  ],
  "then": [
    {
      "type": "llm",
      "prompt": "summarize",
      "input": { "text": "{{payload.body_text}}" },
      "store_as": "summary"
    },
    {
      "type": "tool",
      "tool": "slack.send",
      "args": {
        "channel": "#alerts",
        "message": "🚨 Urgent email from {{payload.from.name}}: {{summary}}"
      }
    }
  ],
  "status": "active",
  "run_count": 12,
  "last_run_at": "2024-01-15T10:30:00Z"
}
```

---

### Run

An execution instance of a Unit:

```typescript
interface Run {
  id: string;                    // Unique run ID
  unit_id: string;               // Which Unit is being executed
  event_id: string;              // What Event triggered it
  user_id: string;               // Owner
  
  // Execution state
  status: RunStatus;
  step: number;                  // Current step (0-indexed)
  context: Record<string, any>;  // Accumulated data from actions
  
  // Timing
  started_at: string;
  completed_at?: string;
  resume_at?: string;            // For wait actions
  
  // Error tracking
  error?: string;
  retry_count?: number;
}

type RunStatus = 
  | 'pending'   // Created, not yet started
  | 'running'   // Currently executing
  | 'waiting'   // Paused (wait action)
  | 'success'   // Completed successfully
  | 'failed';   // Failed with error
```

**Example**: Run in progress
```json
{
  "id": "run_123",
  "unit_id": "unit_xyz",
  "event_id": "evt_abc123",
  "user_id": "user_456",
  "status": "running",
  "step": 1,
  "context": {
    "summary": "Client Sarah needs project status update urgently."
  },
  "started_at": "2024-01-15T10:30:01Z"
}
```

---

## Triggers

What causes a Unit to fire:

```typescript
type Trigger = EventTrigger | ScheduleTrigger | CompoundTrigger;

interface EventTrigger {
  type: 'event';
  source: EventSource;           // 'gmail', 'salesforce', etc.
  event: string;                 // 'email_received', 'lead_created'
  filter?: string;               // JS expression: "payload.amount > 5000"
}

interface ScheduleTrigger {
  type: 'schedule';
  cron: string;                  // "0 9 * * 1" (Monday 9am)
  timezone?: string;             // "America/New_York"
}

interface CompoundTrigger {
  type: 'compound';
  operator: 'and' | 'or';
  triggers: Trigger[];
}
```

**Examples**:
```typescript
// Simple event trigger
{ "type": "event", "source": "gmail", "event": "email_received" }

// Event with filter
{ 
  "type": "event", 
  "source": "salesforce", 
  "event": "opportunity_updated",
  "filter": "payload.stage === 'Closed Won' && payload.amount > 50000"
}

// Schedule trigger
{ "type": "schedule", "cron": "0 9 * * 1-5", "timezone": "UTC" }
```

---

## Conditions

Additional filtering after trigger matches:

```typescript
type Condition = EvalCondition | SemanticCondition;

interface EvalCondition {
  type: 'eval';
  expr: string;                  // JS expression
}

interface SemanticCondition {
  type: 'semantic';
  check: 'urgency' | 'sentiment' | 'intent' | 'custom';
  prompt?: string;               // For custom checks
  input?: string;                // Template: "{{payload.body_text}}"
  expect: string;                // Expected classification result
}
```

**Eval Condition** — logical/numeric checks:
```typescript
{ "type": "eval", "expr": "payload.amount > 10000" }
{ "type": "eval", "expr": "payload.labels.includes('IMPORTANT')" }
```

**Semantic Condition** — LLM-based classification:
```typescript
{
  "type": "semantic",
  "check": "urgency",
  "input": "{{payload.subject}} {{payload.body_text}}",
  "expect": "high"
}
```

The `check` presets map to prompts:
- `urgency` → "Is this urgent? Reply: low, medium, high"
- `sentiment` → "What's the sentiment? Reply: positive, neutral, negative"
- `intent` → "What's the intent? Reply: question, request, complaint, info"

---

## Actions

What to do when conditions pass:

```typescript
type Action = ToolAction | LLMAction | WaitAction;

interface ToolAction {
  type: 'tool';
  tool: string;                  // 'slack.send', 'gmail.send'
  args: Record<string, any>;     // Arguments with templates
  store_as?: string;             // Store result as variable
}

interface LLMAction {
  type: 'llm';
  prompt: string;                // 'summarize', 'draft_reply', or custom
  input: Record<string, any>;    // Input data
  store_as?: string;             // Store result as variable
}

interface WaitAction {
  type: 'wait';
  duration: string;              // '24h', '7d', '30m'
}
```

**Tool Action** — execute a tool:
```typescript
{
  "type": "tool",
  "tool": "slack.send",
  "args": {
    "channel": "#sales",
    "message": "New deal closed: {{payload.name}} for ${{payload.amount}}"
  }
}
```

**LLM Action** — invoke LLM:
```typescript
{
  "type": "llm",
  "prompt": "summarize",
  "input": { "text": "{{payload.body_text}}" },
  "store_as": "email_summary"
}
```

**Wait Action** — pause execution:
```typescript
{
  "type": "wait",
  "duration": "24h"
}
```

After wait, the Run is marked `waiting` with `resume_at` set. A scheduler picks it up later.

---

## Template Syntax

Actions can reference event data and previous results:

```
{{payload.field}}           // Event payload
{{context.variable}}        // Stored from previous action
{{summary}}                 // Shorthand for context.summary
```

**Example flow**:
```typescript
// Event payload
{ "payload": { "from": { "name": "Sarah" }, "body": "..." } }

// Action 1: LLM summarize
{ "type": "llm", "prompt": "summarize", "input": { "text": "{{payload.body}}" }, "store_as": "summary" }
// Result stored in context: { "summary": "Sarah needs project update" }

// Action 2: Send Slack
{ "type": "tool", "tool": "slack.send", "args": { "message": "From {{payload.from.name}}: {{summary}}" } }
// Resolves to: "From Sarah: Sarah needs project update"
```

---

## Storage: HybridStore

Cortex uses Redis + Postgres hybrid storage:

```typescript
class HybridStore {
  constructor(
    private redis: Redis,
    private sql: PostgresClient
  ) {}
  
  // Events → Redis (fast writes, pub/sub, 7-day TTL)
  async writeEvent(event: Event): Promise<boolean>;
  async getEvent(id: string): Promise<Event | null>;
  
  // Units → Postgres (persistent, queryable)
  async saveUnit(unit: Unit): Promise<void>;
  async getUnitsByTrigger(source: string, event: string): Promise<Unit[]>;
  async getUnitsByOwner(userId: string): Promise<Unit[]>;
  
  // Runs → Postgres + Redis
  async saveRun(run: Run, eventPayload?: any): Promise<void>;
  async getWaitingRuns(beforeTime: number): Promise<Run[]>;
  
  // Run Steps → Postgres (audit log)
  async logRunStep(runId: string, step: number, action: Action, status: string, result?: any, error?: string): Promise<void>;
}
```

---

## Event Types by Source

### Gmail
| Event | Description |
|-------|-------------|
| `email_received` | New email in inbox |
| `email_sent` | Email sent by user |
| `email_reply_received` | Reply to user's email |

### Google Calendar
| Event | Description |
|-------|-------------|
| `event_created` | New calendar event |
| `event_updated` | Calendar event modified |
| `event_starting` | Event about to start |

### Salesforce
| Event | Description |
|-------|-------------|
| `lead_created` | New lead |
| `lead_stage_changed` | Lead stage updated |
| `opportunity_created` | New opportunity |
| `opportunity_updated` | Opportunity modified |
| `opportunity_closed_won` | Deal won |
| `opportunity_closed_lost` | Deal lost |

---

## Exercise

1. Design a Unit for: "When a deal over $10,000 closes, send a Slack message to #wins with the deal name and amount"

2. Write the JSON structure with:
   - `raw` (natural language)
   - `when` (trigger with filter)
   - `if` (conditions if any)
   - `then` (actions)

---

*Next: [3.2 Natural Language Compilation](./compiler.md)*
