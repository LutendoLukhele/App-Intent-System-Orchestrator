# Intent is Universal

> Conversation is just one way to say what you want.

---

## The Modality Trap

Most "AI" systems start with chat. Natural, since that's what ChatGPT demonstrated.

But think about what you're actually building:

```
User types: "Notify me when deals close over $5k"
     ↓
System creates: Automation rule
     ↓  
Later: Deal closes for $8k
     ↓
System: Sends notification
```

The *typing* was just how the user expressed intent. The *automation* is the real thing.

---

## Intent Sources in ASO

ASO accepts intent from:

### 1. Conversation (WebSocket)
```
User: "Send an email to John about the meeting"
→ Intent: send email, recipient: John, topic: meeting
```

### 2. Webhooks (External Events)
```
Salesforce: { event: "opportunity_closed_won", amount: 50000 }
→ Intent: notify about closed deal (matched from Cortex rules)
```

### 3. Schedules (Cron)
```
Every Monday 9am
→ Intent: send weekly summary (matched from Cortex rules)
```

### 4. Direct API
```
POST /api/execute
{ tool: "fetch_emails", args: { limit: 10 } }
→ Intent: explicit, no parsing needed
```

---

## Why This Matters

If conversation is your only input:
- Your architecture couples to chat
- You can't automate without users typing
- Background processes feel bolted on

If intent is universal:
- Chat is just one input parser
- Webhooks and schedules are first-class
- The same execution engine handles everything

---

## The Convergence Point

All intent sources converge here:

```typescript
interface Intent {
  action: string;        // What to do
  parameters: any;       // With what inputs
  context: {
    source: 'conversation' | 'webhook' | 'schedule' | 'api';
    userId: string;
    sessionId?: string;
    triggerEvent?: any;  // For webhooks
  };
}
```

Whether you typed it, a webhook triggered it, or a schedule fired it — by the time it reaches the planner, it's the same shape.

---

## Cortex: Intent from Events

Cortex is ASO's reactive automation system. Users define rules in natural language:

```
"When I receive an email from my boss, notify me on Slack"
```

This compiles to:

```typescript
{
  when: { event: 'email_received', filter: { from: { role: 'boss' } } },
  then: [{ action: 'notify', channel: 'slack' }]
}
```

When an email webhook fires, the Matcher checks if it matches any rules. If yes, the Runtime executes the actions.

**The user never typed "notify me" in real-time.** The intent was expressed once, compiled, and now runs automatically.

---

## The Implication

If you're building an orchestration system, ask:

1. What are all the ways someone might want to trigger this?
2. Can those all be normalized to the same intent shape?
3. Does my execution engine care where the intent came from?

The answer to #3 should be "no."

---

## Exercise

Take one thing your system does (e.g., "send daily report email").

List all the ways a user might want to trigger it:
- Type "send me the daily report" 
- Click a button in UI
- Schedule for 9am every day
- Trigger when some metric crosses a threshold
- API call from another system

Now: Does your architecture support all of these equally? Or is one "primary" and others feel hacky?

---

*Next: [The LLM is a Compiler](llm-as-compiler.md)*
