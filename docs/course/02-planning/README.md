# Part 2: The Planning Engine

> Turn "send email to John" into an executable plan.

This is where the "LLM as compiler" idea becomes concrete. The planner takes natural language and produces a structured action plan.

---

## Modules

1. **[Intent Analysis](./intent-analysis.md)** — How the planner understands requests
2. **[Action Plans](./action-plans.md)** — The data structure that drives execution
3. **[Dependency Resolution](./dependencies.md)** — Steps that reference previous results
4. **[Provider-Aware Filtering](./provider-filtering.md)** — Only plan what user can do

---

## The Flow

```
User: "Send an email to John about tomorrow's meeting"
                        │
                        ▼
              ┌─────────────────┐
              │  PlannerService │
              │                 │
              │  1. Filter tools│   ← Only tools user has providers for
              │  2. Build prompt│   ← System prompt + tool definitions
              │  3. Call LLM    │   ← Get structured JSON plan
              │  4. Parse plan  │   ← Extract ActionSteps
              │  5. Validate    │   ← Ensure tools exist
              └────────┬────────┘
                       │
                       ▼
              ActionPlan [
                {
                  id: "step_1",
                  tool: "fetch_contacts",
                  arguments: { query: "John" }
                },
                {
                  id: "step_2",
                  tool: "send_email",
                  arguments: {
                    to: "{{step_1.result.data[0].email}}",
                    subject: "Tomorrow's Meeting",
                    body: "..."
                  }
                }
              ]
                       │
                       ▼
              [ToolOrchestrator]
```

---

## What You'll Learn

- How to prompt an LLM to generate structured plans
- How to validate plans against available tools
- How to handle dependencies between steps
- How to filter tools so users only see what they can use

---

## Key Insight: Plans Are Data

The plan is just JSON. This means:

```typescript
// Serializable → store in database
await db.plans.save(JSON.stringify(plan));

// Inspectable → analyze before execution
const hasEmailAction = plan.some(s => s.tool === 'send_email');

// Modifiable → add confirmation steps
plan[1].requiresConfirmation = true;

// Testable → deterministic assertions
expect(plan[0].tool).toBe('fetch_contacts');
```

The LLM outputs data, not code. We control what happens with that data.

---

*Start: [2.1 Intent Analysis](./intent-analysis.md)*
