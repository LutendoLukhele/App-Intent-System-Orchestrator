# 2.3 Dependency Resolution

> Steps can reference previous results.

---

## The Problem

Multi-step plans often have dependencies:

1. **Find John's email** → result: john@example.com
2. **Send email to John** → needs: john@example.com

How does step 2 know the email address from step 1?

---

## Placeholder Syntax

ASO uses template placeholders:

```
{{stepId.result.path.to.data}}
```

Examples:
- `{{step_1.result.email}}` — Get `email` from step_1's result
- `{{find_john.result.data[0].email}}` — First item's email
- `{{get_report.result.url}}` — URL from get_report step

---

## How It Works

**Plan with placeholders:**
```json
[
  {
    "id": "find_john",
    "tool": "fetch_entity",
    "arguments": {
      "input": {
        "entityType": "Contact",
        "filters": { "name": "John" }
      }
    }
  },
  {
    "id": "send_email",
    "tool": "send_email",
    "arguments": {
      "input": {
        "to": "{{find_john.result.data[0].email}}",
        "subject": "Hello",
        "body": "Hi {{find_john.result.data[0].name}}!"
      }
    }
  }
]
```

**After step 1 executes:**
```json
{
  "id": "find_john",
  "status": "completed",
  "result": {
    "data": [
      { "name": "John Smith", "email": "john.smith@example.com" }
    ]
  }
}
```

**Before step 2 executes, resolver transforms:**
```json
{
  "input": {
    "to": "john.smith@example.com",
    "subject": "Hello",
    "body": "Hi John Smith!"
  }
}
```

---

## The Resolver

```typescript
// src/services/PlaceholderResolver.ts

export class PlaceholderResolver {
  /**
   * Resolve all placeholders in an object
   */
  resolve(obj: any, executedSteps: StepResult[]): any {
    const json = JSON.stringify(obj);
    
    // Find all {{...}} patterns (but not PLACEHOLDER_)
    const resolved = json.replace(
      /\{\{(?!PLACEHOLDER_)([^}]+)\}\}/g,
      (match, path) => {
        const value = this.resolvePath(path, executedSteps);
        
        // Handle different value types
        if (typeof value === 'string') {
          return value;
        }
        // For objects/arrays, stringify (but will be re-parsed)
        return JSON.stringify(value);
      }
    );
    
    return JSON.parse(resolved);
  }
  
  /**
   * Resolve a single path like "step_1.result.data[0].email"
   */
  private resolvePath(path: string, executedSteps: StepResult[]): any {
    const parts = path.split('.');
    const stepId = parts[0];
    
    // Find the step result
    const step = executedSteps.find(s => s.stepId === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }
    
    if (step.status !== 'completed') {
      throw new Error(`Step ${stepId} not completed yet`);
    }
    
    // Navigate the path starting from step object
    let value: any = step;
    for (const part of parts.slice(1)) {  // Skip stepId
      value = this.accessProperty(value, part);
      
      if (value === undefined) {
        throw new Error(`Path not found: ${path}`);
      }
    }
    
    return value;
  }
  
  /**
   * Access a property, handling array notation
   */
  private accessProperty(obj: any, key: string): any {
    // Handle array notation: data[0], items[2]
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, prop, indexStr] = arrayMatch;
      const index = parseInt(indexStr);
      return obj[prop]?.[index];
    }
    
    return obj[key];
  }
}
```

---

## Usage in ToolOrchestrator

```typescript
class ToolOrchestrator {
  private resolver = new PlaceholderResolver();
  
  async executePlan(plan: ActionPlan, userId: string): Promise<void> {
    const executedSteps: StepResult[] = [];
    
    for (const step of plan) {
      // 1. Resolve placeholders using previous results
      const resolvedArgs = this.resolver.resolve(
        step.arguments,
        executedSteps
      );
      
      // 2. Execute with resolved arguments
      const result = await this.executeTool(
        step.tool,
        resolvedArgs,
        userId
      );
      
      // 3. Store result for later steps
      executedSteps.push({
        stepId: step.id,
        status: 'completed',
        result
      });
    }
  }
}
```

---

## Dependency Detection

Find which steps a given step depends on:

```typescript
function findDependencies(step: ActionStep): string[] {
  const argString = JSON.stringify(step.arguments);
  const matches = argString.matchAll(/\{\{(\w+)\./g);
  return [...new Set([...matches].map(m => m[1]))];
}

// Example
const step = {
  arguments: {
    input: {
      to: '{{find_john.result.email}}',
      cc: '{{find_manager.result.email}}'
    }
  }
};

findDependencies(step);  // ['find_john', 'find_manager']
```

---

## Execution Order

For complex plans, you might have parallel opportunities:

```
    A
   / \
  B   C    ← B and C can run in parallel
   \ /
    D      ← D must wait for both
```

```typescript
function getExecutionLevels(plan: ActionPlan): string[][] {
  const deps = new Map<string, string[]>();
  for (const step of plan) {
    deps.set(step.id, findDependencies(step));
  }
  
  const levels: string[][] = [];
  const completed = new Set<string>();
  
  while (completed.size < plan.length) {
    // Find steps whose dependencies are all completed
    const ready = plan
      .filter(s => !completed.has(s.id))
      .filter(s => deps.get(s.id)!.every(d => completed.has(d)))
      .map(s => s.id);
    
    if (ready.length === 0) {
      throw new Error('Circular dependency detected');
    }
    
    levels.push(ready);
    ready.forEach(id => completed.add(id));
  }
  
  return levels;
}

// Example: [['A'], ['B', 'C'], ['D']]
// Level 0: Run A
// Level 1: Run B and C in parallel
// Level 2: Run D
```

---

## PLACEHOLDER_ Convention

For **user-provided values** (not step results), we use a different pattern:

```
{{PLACEHOLDER_parameter_name}}
```

Example:
```json
{
  "id": "create_meeting",
  "tool": "create_calendar_event",
  "arguments": {
    "input": {
      "title": "{{PLACEHOLDER_meeting_title}}",
      "startTime": "{{PLACEHOLDER_start_time}}",
      "attendees": ["{{PLACEHOLDER_attendee_email}}"]
    }
  }
}
```

These are **not resolved** by PlaceholderResolver — they're detected by the UI:

```typescript
function findUserPlaceholders(plan: ActionPlan): string[] {
  const json = JSON.stringify(plan);
  const matches = json.matchAll(/\{\{PLACEHOLDER_(\w+)\}\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}

// Returns: ['meeting_title', 'start_time', 'attendee_email']
```

UI prompts user to fill these before execution can proceed.

---

## Error Handling

When resolution fails:

```typescript
try {
  const resolved = resolver.resolve(step.arguments, executedSteps);
  // Execute...
} catch (error) {
  if (error.message.includes('not completed')) {
    // Dependency not ready - execution order bug
    step.status = 'blocked';
    step.error = 'Waiting for dependency';
  } else if (error.message.includes('Path not found')) {
    // The referenced data doesn't exist in result
    step.status = 'failed';
    step.error = `Missing data: ${error.message}`;
  } else if (error.message.includes('Step not found')) {
    // Referenced step doesn't exist - plan bug
    step.status = 'failed';
    step.error = `Invalid reference: ${error.message}`;
  }
}
```

---

## Real Example

**User**: "Find emails from Sarah and reply to the most recent one"

**Plan**:
```json
[
  {
    "id": "fetch_sarah_emails",
    "intent": "Find emails from Sarah",
    "tool": "fetch_emails",
    "arguments": {
      "input": {
        "operation": "fetch",
        "filters": { "sender": "sarah" }
      }
    }
  },
  {
    "id": "reply_to_email",
    "intent": "Reply to Sarah's most recent email",
    "tool": "reply_email",
    "arguments": {
      "input": {
        "threadId": "{{fetch_sarah_emails.result.data[0].id}}",
        "to": "{{fetch_sarah_emails.result.data[0].from.email}}",
        "subject": "Re: {{fetch_sarah_emails.result.data[0].subject}}",
        "body": "{{PLACEHOLDER_reply_message}}"
      }
    }
  }
]
```

**After step 1**:
```json
{
  "stepId": "fetch_sarah_emails",
  "status": "completed",
  "result": {
    "data": [
      {
        "id": "thread_abc123",
        "from": { "email": "sarah@company.com", "name": "Sarah" },
        "subject": "Q1 Report",
        "date": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

**Step 2 resolved to**:
```json
{
  "input": {
    "threadId": "thread_abc123",
    "to": "sarah@company.com",
    "subject": "Re: Q1 Report",
    "body": "{{PLACEHOLDER_reply_message}}"  // Still needs user input
  }
}
```

---

## Exercise

1. Given this plan:
```json
[
  { "id": "A", "tool": "fetch_contacts", "arguments": { "input": {} } },
  { "id": "B", "tool": "fetch_emails", "arguments": { "input": { "from": "{{A.result.data[0].email}}" } } },
  { "id": "C", "tool": "summarize", "arguments": { "input": { "text": "{{B.result.data[0].body}}" } } },
  { "id": "D", "tool": "send_email", "arguments": { "input": { "to": "{{A.result.data[0].email}}", "body": "{{C.result.summary}}" } } }
]
```

2. Draw the dependency graph
3. What's the execution order?
4. If step B fails, which steps are affected?

---

*Next: [2.4 Provider-Aware Filtering](./provider-filtering.md)*
