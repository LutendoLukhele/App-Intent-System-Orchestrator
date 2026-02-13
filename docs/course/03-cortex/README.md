# Part 3: Reactive Automation (Cortex)

> Event-driven workflows from natural language.

Cortex is where ASO becomes proactive. Instead of waiting for user commands, Cortex **watches for events** and **executes automations** automatically.

---

## The Vision

**Traditional automation**: Complex rules, IFTTT-style triggers, brittle configuration.

**Cortex**: "When I get an email from a client, send me a Slack notification and create a follow-up task."

Write it in plain English. Cortex compiles it to executable automation.

---

## Modules

1. **[The Cortex Model](./model.md)** — Units, Runs, Events
2. **[Natural Language Compilation](./compiler.md)** — "When X, do Y" → structured rules
3. **[Event Matching](./matcher.md)** — Which rules fire for this event?
4. **[Runtime Execution](./runtime.md)** — Execute matched rules
5. **[Webhook Integration](./webhooks.md)** — External events → Cortex events

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Services                            │
│      Gmail • Salesforce • Google Calendar • Slack                │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Webhooks
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       EventShaper                                │
│  Transform provider-specific webhooks → Cortex Events            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Emit Event
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Matcher                                  │
│  Find Units whose triggers match this Event                      │
│  Evaluate conditions (semantic + logical)                        │
│  Create Runs for matching Units                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Runs
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Runtime                                  │
│  Execute each Run step by step                                   │
│  - Tool actions (send email, create lead)                        │
│  - LLM actions (summarize, draft reply)                          │
│  - Wait actions (delay for 24h)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Flow: From Event to Action

**1. Event arrives** (webhook from Gmail):
```json
{
  "source": "gmail",
  "event": "email_received",
  "payload": {
    "from": { "email": "client@company.com" },
    "subject": "Urgent: Need update on project"
  }
}
```

**2. Matcher finds relevant Unit**:
```json
{
  "name": "Client email notification",
  "raw": {
    "when": "I receive an email from a client",
    "then": "Send me a Slack notification"
  },
  "when": { "type": "event", "source": "gmail", "event": "email_received" },
  "then": [
    { "type": "tool", "tool": "slack.send", "args": { "message": "..." } }
  ]
}
```

**3. Runtime executes** → Slack notification sent.

---

## What Makes Cortex Different

### 1. Natural Language Rules
```
"When a high-value opportunity closes, send a celebration message to #wins"
```
Not:
```yaml
trigger:
  type: webhook
  source: salesforce
  event: opportunity_update
  filter:
    - field: Stage
      operator: equals
      value: "Closed Won"
    - field: Amount
      operator: greater_than
      value: 50000
action:
  type: slack
  channel: "#wins"
  message: "..."
```

### 2. Semantic Conditions
```
"When I receive an urgent email..."
```
Cortex uses LLM to classify urgency — not regex or keywords.

### 3. LLM Actions
```
"...summarize it and draft a response"
```
Invoke LLM as part of the automation, not just for routing.

### 4. Compiled Execution
The natural language is compiled once into structured triggers/actions.
Execution is fast — no LLM call per event (unless semantic condition needed).

---

## Key Concepts

| Concept | What It Is |
|---------|-----------|
| **Unit** | A compiled automation rule (when/if/then) |
| **Run** | A single execution instance of a Unit |
| **Event** | An incoming trigger from external service |
| **Trigger** | When clause: what event fires this rule |
| **Condition** | If clause: additional filtering |
| **Action** | Then clause: what to do |

---

*Start: [3.1 The Cortex Model](./model.md)*
