# 2.2 Action Plans

> Plans are data structures, not procedures.

---

## The ActionStep

Every step in a plan has this shape:

```typescript
interface ActionStep {
  // Identity
  id: string;              // Unique ID for this step
  
  // What to do
  intent: string;          // Human-readable description
  tool: string;            // Tool to execute
  arguments: {
    input: any;            // Tool-specific arguments
  };
  
  // State
  status: 'ready' | 'executing' | 'completed' | 'failed';
  
  // Position
  stepNumber?: number;     // 1-indexed position
  totalSteps?: number;     // Total steps in plan
  
  // Results (filled after execution)
  result?: any;
  error?: string;
}
```

---

## Why "Intent"?

Each step has an `intent` field — a human-readable description:

```json
{
  "id": "step_1",
  "intent": "Find John's email address",  // ← Human understands this
  "tool": "fetch_entity",                  // ← Machine executes this
  "arguments": {
    "input": {
      "operation": "fetch",
      "entityType": "Contact",
      "filters": { "name": "John" }
    }
  }
}
```

The intent serves multiple purposes:
1. **UI display**: "Step 1: Find John's email address"
2. **Logging**: Understand what the system was trying to do
3. **Debugging**: When something fails, intent explains why the step exists

---

## An ActionPlan

A plan is just an array of steps:

```typescript
type ActionPlan = ActionStep[];
```

Example:
```json
[
  {
    "id": "fetch_john",
    "intent": "Look up John's contact information",
    "tool": "fetch_entity",
    "arguments": {
      "input": {
        "operation": "fetch",
        "entityType": "Contact",
        "filters": { "name": "John" }
      }
    },
    "status": "ready",
    "stepNumber": 1,
    "totalSteps": 2
  },
  {
    "id": "send_email",
    "intent": "Send email to John",
    "tool": "send_email",
    "arguments": {
      "input": {
        "to": "{{fetch_john.result.data[0].email}}",
        "subject": "Quick question",
        "body": "Hey John, ..."
      }
    },
    "status": "ready",
    "stepNumber": 2,
    "totalSteps": 2
  }
]
```

---

## Plans Are Data

The key insight: **a plan is just JSON**. This means:

### Serializable
```typescript
// Save to database
await db.plans.insert({
  sessionId,
  plan: JSON.stringify(actionPlan),
  createdAt: new Date()
});

// Load later
const saved = await db.plans.findOne({ sessionId });
const plan = JSON.parse(saved.plan);
```

### Inspectable
```typescript
// What tools does this plan use?
const toolsUsed = plan.map(step => step.tool);

// Does it have dependencies?
const hasDependencies = plan.some(step => 
  JSON.stringify(step.arguments).includes('{{')
);

// Does it need user input?
const hasPlaceholders = plan.some(step =>
  JSON.stringify(step.arguments).includes('PLACEHOLDER')
);
```

### Modifiable
```typescript
// User wants to skip step 2
const modifiedPlan = plan.filter(step => step.id !== 'step_2');

// Add confirmation requirement for mutations
for (const step of plan) {
  const tool = toolConfig.getToolByName(step.tool);
  if (tool?.source === 'action') {
    step.requiresConfirmation = true;
  }
}
```

### Testable
```typescript
// Test that planner produces expected structure
const plan = await planner.generatePlan("Send email to John", [], sessionId, msgId, userId);

expect(plan).toHaveLength(2);
expect(plan[0].tool).toBe('fetch_entity');
expect(plan[1].tool).toBe('send_email');
expect(plan[1].arguments.input.to).toContain('{{fetch_john');
```

---

## Status Lifecycle

Each step moves through states:

```
ready → executing → completed
                  ↘ failed
```

```typescript
// Initial state
step.status = 'ready';

// Execution starts
step.status = 'executing';
emitToUI('step_started', { stepId: step.id });

// Success
step.status = 'completed';
step.result = executionResult;
emitToUI('step_completed', { stepId: step.id, result });

// Or failure
step.status = 'failed';
step.error = errorMessage;
emitToUI('step_failed', { stepId: step.id, error });
```

---

## Step Results

After execution, results are attached to the step:

```typescript
// Before execution
{
  "id": "fetch_contacts",
  "tool": "fetch_entity",
  "arguments": { "input": { "entityType": "Contact", "filters": {} } },
  "status": "ready"
}

// After execution
{
  "id": "fetch_contacts",
  "tool": "fetch_entity",
  "arguments": { "input": { "entityType": "Contact", "filters": {} } },
  "status": "completed",
  "result": {
    "data": [
      { "name": "John Smith", "email": "john.smith@example.com" },
      { "name": "John Doe", "email": "john.doe@example.com" }
    ],
    "count": 2
  }
}
```

The result is available for subsequent steps to reference via `{{stepId.result.path}}`.

---

## Confirmation Flow

Some steps need user confirmation before execution:

```typescript
interface ActionStep {
  // ... other fields
  requiresConfirmation?: boolean;
  confirmedAt?: Date;
  confirmedBy?: string;
}
```

Execution pauses at confirmation steps:

```typescript
for (const step of plan) {
  // Check if this action needs confirmation
  const tool = toolConfig.getToolByName(step.tool);
  if (tool?.source === 'action' && !step.confirmedAt) {
    // Emit to UI, wait for confirmation
    this.emit('confirmation_required', {
      stepId: step.id,
      intent: step.intent,
      tool: step.tool,
      arguments: step.arguments
    });
    return; // Pause execution
  }
  
  // Execute confirmed steps
  await this.executeStep(step);
}
```

---

## Plan Visualization

The UI shows plans as a sequence:

```
┌──────────────────────────────────────┐
│ Step 1: Find John's contact info     │  ✅ Completed
│ Tool: fetch_entity                   │
│ Found: john.smith@example.com        │
└──────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 2: Send email to John           │  ⏳ Awaiting confirmation
│ Tool: send_email                     │
│ To: john.smith@example.com           │
│ Subject: Quick question              │
│                                      │
│  [Cancel]  [Send Email]              │
└──────────────────────────────────────┘
```

---

## Error Handling in Plans

When a step fails:

```typescript
// Option 1: Stop execution (default)
if (step.status === 'failed') {
  emitError('Step failed: ' + step.error);
  return; // Don't continue
}

// Option 2: Mark dependent steps as blocked
const dependentSteps = plan.filter(s => 
  JSON.stringify(s.arguments).includes(`{{${step.id}.`)
);
dependentSteps.forEach(s => {
  s.status = 'blocked';
  s.error = `Blocked: depends on failed step ${step.id}`;
});

// Option 3: Continue with independent steps
const independentSteps = plan.filter(s =>
  !JSON.stringify(s.arguments).includes(`{{${step.id}.`)
);
// Continue executing independent steps
```

---

## Plan Metadata

Plans can carry additional metadata:

```typescript
interface PlanMetadata {
  createdAt: Date;
  createdBy: string;      // userId
  sessionId: string;
  originalInput: string;  // The user's original request
  
  // Execution tracking
  startedAt?: Date;
  completedAt?: Date;
  
  // Statistics
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
}
```

Useful for:
- Audit logs ("who ran what when")
- Analytics ("average plan size", "common failures")
- Debugging ("what did the user actually say?")

---

## Exercise

1. Given this user request: "Find all emails from Sarah and forward them to my manager"

2. Design the ActionPlan:
   - What steps are needed?
   - What are the dependencies?
   - What placeholders might be needed?

3. Write out the JSON:
```json
{
  "plan": [
    // Your steps here
  ]
}
```

**Hint**: You'll need at least 3 steps, and step 3 depends on steps 1 and 2.

---

*Next: [2.3 Dependency Resolution](./dependencies.md)*
