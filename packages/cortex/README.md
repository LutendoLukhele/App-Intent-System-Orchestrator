# @aso/cortex

> Reactive Automation: Natural language → Event-driven workflows

## Overview

Cortex is ASO's reactive automation subsystem. It compiles natural language rules ("When I get an email from my boss, notify me on Slack") into executable automation units that trigger on real-world events.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  "When email    │────▶│    Compiler     │────▶│      Unit       │
│   from boss,    │     │  NL → Struct    │     │  when/if/then   │
│   notify me"    │     └─────────────────┘     └────────┬────────┘
└─────────────────┘                                      │
                                                         │ stored
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Webhook      │────▶│    Matcher      │────▶│    Runtime      │
│  (email event)  │     │  Event → Unit   │     │  Execute Unit   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## What Makes Cortex Different

| Traditional (Zapier/IFTTT) | Cortex |
|---------------------------|--------|
| Pick trigger → configure → pick action | "Notify me when deals close over $5k" |
| **Explicit** structure (user defines) | **Inferred** structure (LLM compiles) |
| Predefined condition filters | **Semantic** conditions ("sounds urgent?") |
| Form validation for ambiguity | **Clarification dialogue** |

## Key Components

### Compiler
Translates natural language to structured Unit:
```typescript
const unit = await compiler.compile({
  when: "When I receive an email",
  if: "If it sounds urgent",
  then: "Notify me on Slack"
});
```

### Matcher
Matches incoming events to registered Units:
```typescript
const matchingUnits = await matcher.match(incomingEvent);
```

### Runtime
Executes matched Units with context:
```typescript
const run = await runtime.execute(unit, event, context);
```

### HybridStore
Persistence layer (Redis + Postgres):
```typescript
await store.saveUnit(unit);
const units = await store.getActiveUnits(userId);
```

## Unit Structure

```typescript
interface Unit {
  id: string;
  owner: string;
  name: string;
  
  // Original natural language
  raw: {
    when: string;   // "When I receive an email"
    if?: string;    // "If it sounds urgent"
    then: string;   // "Notify me on Slack"
  };
  
  // Compiled structure
  when: Trigger;      // EventTrigger | ScheduleTrigger
  if: Condition[];    // EvalCondition | SemanticCondition
  then: Action[];     // ToolAction | LLMAction | NotifyAction
  
  status: 'active' | 'paused' | 'disabled';
}
```

## Supported Event Types

### Gmail
- `email_received`, `email_sent`, `email_reply_received`

### Google Calendar
- `event_created`, `event_updated`, `event_deleted`, `event_starting`

### Salesforce
- `lead_created`, `lead_stage_changed`, `lead_converted`
- `opportunity_created`, `opportunity_stage_changed`
- `opportunity_closed_won`, `opportunity_closed_lost`

## Action Types

```typescript
type Action = 
  | LLMAction      // Invoke LLM for summarization, drafting
  | ToolAction     // Execute tool (slack.send, gmail.send)
  | NotifyAction   // Send notification to user
  | WaitAction     // Pause execution (24h, 48h, 7d)
  | CheckAction    // Conditional branch
  | FetchAction    // Retrieve data
  | LogAction;     // Debug logging
```

## Installation

```bash
npm install @aso/cortex
```

## Usage

```typescript
import { Compiler, Matcher, Runtime, HybridStore } from '@aso/cortex';

// Initialize
const store = new HybridStore(redis, postgres);
const compiler = new Compiler(llmClient);
const matcher = new Matcher(store);
const runtime = new Runtime(store, toolExecutor);

// Compile a rule
const unit = await compiler.compile({
  when: "When I receive an email from my boss",
  if: "If it's marked urgent",
  then: "Forward to my personal email and notify me on Slack"
});

await store.saveUnit(unit);

// Handle incoming event
async function handleWebhook(event: Event) {
  const units = await matcher.match(event);
  for (const unit of units) {
    await runtime.execute(unit, event);
  }
}
```

## License

MIT
