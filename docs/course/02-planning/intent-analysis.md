# 2.1 Intent Analysis

> Parse intent, don't parse commands.

---

## Commands vs Intent

**Command parsing** (traditional):
```
/send-email --to="john@example.com" --subject="Meeting" --body="..."
```
- Rigid syntax
- User must know exact format
- No ambiguity, but no flexibility

**Intent parsing** (what we do):
```
"Send an email to John about the meeting tomorrow"
```
- Natural language
- User expresses goal, not implementation
- Ambiguous, but flexible

The planner's job: **understand the intent and translate to structured actions**.

---

## The PlannerService

```typescript
// packages/intent-engine/src/PlannerService.ts

export interface PlannerConfig {
  llmClient: ILLMClient;
  toolProvider: IToolProvider;
  toolFilter?: IToolFilter;
  maxTokens: number;
  model?: string;
}

export class PlannerService extends EventEmitter {
  constructor(private config: PlannerConfig) {
    super();
  }
  
  async generatePlan(
    userInput: string,
    identifiedToolCalls: ToolCall[],
    sessionId: string,
    clientMessageId: string,
    userId?: string
  ): Promise<ActionPlan> {
    // 1. Get available tools (filtered if userId provided)
    const tools = await this.getToolsForUser(userId);
    
    // 2. Build prompt with tool definitions
    const prompt = this.buildPlannerPrompt(userInput, tools, userId);
    
    // 3. Call LLM with JSON response format
    const response = await this.config.llmClient.chat({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userInput }
      ],
      maxTokens: this.config.maxTokens,
      temperature: 0.1,  // Low for consistent plans
      responseFormat: { type: 'json_object' }
    });
    
    // 4. Parse and validate
    const plan = this.parsePlan(response.content);
    this.validatePlan(plan, tools);
    
    // 5. Emit for UI
    this.emit('plan_generated', { sessionId, plan });
    
    return plan;
  }
}
```

---

## The System Prompt

The prompt is critical. It tells the LLM:
1. What tools are available
2. How to format the output
3. Rules for tool selection
4. How to handle missing information

```typescript
const PLANNER_SYSTEM_PROMPT = `You are a specialized AI planner for ASO (App-System-Orchestrator).
Your task is to analyze the user's request and create a structured execution plan.

## AVAILABLE TOOLS
{{TOOL_DEFINITIONS}}

## PROVIDER CONTEXT
{{PROVIDER_CONTEXT}}

## OUTPUT FORMAT
You MUST respond with valid JSON in this exact format:
{
  "plan": [
    {
      "id": "unique_step_id",
      "intent": "Human-readable description of what this step does",
      "tool": "exact_tool_name",
      "arguments": {
        "input": {
          // Tool-specific arguments
        }
      }
    }
  ]
}

## RULES
1. ONLY use tools from the Available Tools list - never invent tools
2. Use EXACT tool names as shown (e.g., "fetch_emails" not "get_emails")
3. If information is missing for a required parameter, use: {{PLACEHOLDER_param_name}}
4. If a step needs output from a previous step, use: {{stepId.result.path}}
5. Keep plans minimal - only include necessary steps
6. For Salesforce entities, use fetch_entity/create_entity/update_entity tools
7. Always wrap arguments in an "input" object

## EXAMPLES

User: "Show me emails from John"
{
  "plan": [
    {
      "id": "fetch_john_emails",
      "intent": "Fetch emails from John",
      "tool": "fetch_emails",
      "arguments": {
        "input": {
          "operation": "fetch",
          "filters": {
            "sender": "john"
          }
        }
      }
    }
  ]
}

User: "Send an email to the sales lead about the proposal"
{
  "plan": [
    {
      "id": "find_lead",
      "intent": "Find the sales lead contact",
      "tool": "fetch_entity",
      "arguments": {
        "input": {
          "operation": "fetch",
          "entityType": "Lead",
          "filters": {}
        }
      }
    },
    {
      "id": "send_proposal_email",
      "intent": "Send proposal email to the lead",
      "tool": "send_email",
      "arguments": {
        "input": {
          "to": "{{find_lead.result.data[0].email}}",
          "subject": "{{PLACEHOLDER_subject}}",
          "body": "{{PLACEHOLDER_body}}"
        }
      }
    }
  ]
}
`;
```

---

## Building the Prompt

```typescript
private buildPlannerPrompt(
  userInput: string,
  tools: ToolConfig[],
  userId?: string
): string {
  // Format tools for LLM
  const toolDefinitions = JSON.stringify(
    tools.map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      parameters: t.parameters
    })),
    null,
    2
  );
  
  // Get provider context
  const providerContext = this.getProviderContext(tools);
  
  return PLANNER_SYSTEM_PROMPT
    .replace('{{TOOL_DEFINITIONS}}', toolDefinitions)
    .replace('{{PROVIDER_CONTEXT}}', providerContext);
}

private getProviderContext(tools: ToolConfig[]): string {
  const providers = new Set(
    tools
      .filter(t => t.providerConfigKey)
      .map(t => t.providerConfigKey)
  );
  
  const lines = [];
  if (providers.has('google-mail-ynxw')) {
    lines.push('✓ Gmail - Email operations (fetch, send, reply)');
  }
  if (providers.has('salesforce-ybzg')) {
    lines.push('✓ Salesforce - CRM operations (leads, contacts, opportunities)');
  }
  if (providers.has('google-calendar')) {
    lines.push('✓ Google Calendar - Calendar events');
  }
  
  return lines.length > 0
    ? `User has these integrations connected:\n${lines.join('\n')}`
    : 'No integrations connected.';
}
```

---

## Parsing the Response

The LLM returns JSON (because we requested `json_object` format):

```typescript
private parsePlan(content: string | null): ActionPlan {
  if (!content) {
    return [];
  }
  
  try {
    const parsed = JSON.parse(content);
    
    if (!parsed.plan || !Array.isArray(parsed.plan)) {
      throw new Error('Invalid plan format: missing plan array');
    }
    
    return parsed.plan.map((step: any, idx: number) => ({
      id: step.id || `step_${idx + 1}`,
      intent: step.intent || `Step ${idx + 1}`,
      tool: step.tool,
      arguments: step.arguments || {},
      status: 'ready' as const,
      stepNumber: idx + 1,
      totalSteps: parsed.plan.length
    }));
  } catch (error: any) {
    throw new Error(`Failed to parse plan: ${error.message}`);
  }
}
```

---

## Validating the Plan

**Critical: verify the LLM didn't hallucinate tools.**

```typescript
private validatePlan(plan: ActionPlan, availableTools: ToolConfig[]): void {
  const toolNames = new Set(availableTools.map(t => t.name));
  
  for (const step of plan) {
    // Check tool exists
    if (!toolNames.has(step.tool)) {
      throw new Error(
        `Invalid tool "${step.tool}". Available tools: ${[...toolNames].join(', ')}`
      );
    }
    
    // Check arguments structure
    if (step.arguments && !step.arguments.input) {
      // Try to wrap in input
      step.arguments = { input: step.arguments };
    }
  }
}
```

If the LLM invents a tool that doesn't exist, we catch it here.

---

## Handling Missing Information: Placeholders

When the user doesn't provide enough info:

**User**: "Schedule a meeting"

**LLM generates**:
```json
{
  "plan": [
    {
      "id": "create_meeting",
      "intent": "Create a calendar event",
      "tool": "create_calendar_event",
      "arguments": {
        "input": {
          "title": "{{PLACEHOLDER_meeting_title}}",
          "startTime": "{{PLACEHOLDER_start_time}}",
          "duration": "{{PLACEHOLDER_duration_minutes}}",
          "attendees": ["{{PLACEHOLDER_attendee_email}}"]
        }
      }
    }
  ]
}
```

The UI detects placeholders and prompts the user:

```typescript
function findPlaceholders(plan: ActionPlan): string[] {
  const json = JSON.stringify(plan);
  const matches = json.matchAll(/\{\{PLACEHOLDER_(\w+)\}\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}

// Returns: ['meeting_title', 'start_time', 'duration_minutes', 'attendee_email']
```

---

## Multi-Step Plans

**User**: "Email John the sales report"

**LLM reasons**:
1. Need to find John's email (fetch contacts)
2. Need to find the sales report (might need more context)
3. Send the email

**Plan**:
```json
{
  "plan": [
    {
      "id": "find_john",
      "intent": "Find John's contact information",
      "tool": "fetch_entity",
      "arguments": {
        "input": {
          "operation": "fetch",
          "entityType": "Contact",
          "filters": { "name": "John" }
        }
      }
    },
    {
      "id": "send_email",
      "intent": "Send the sales report to John",
      "tool": "send_email",
      "arguments": {
        "input": {
          "to": "{{find_john.result.data[0].email}}",
          "subject": "Sales Report",
          "body": "{{PLACEHOLDER_email_body}}"
        }
      }
    }
  ]
}
```

Step 2 references `{{find_john.result.data[0].email}}` — a dependency on step 1.

---

## Filtering Tools for User

Before planning, filter to only tools the user can execute:

```typescript
private async getToolsForUser(userId?: string): Promise<ToolConfig[]> {
  if (!this.config.toolFilter || !userId) {
    return this.config.toolProvider.getAllTools();
  }
  
  const tools = await this.config.toolFilter.getAvailableToolsForUser(userId);
  
  if (tools.length === 0) {
    throw new Error('No tools available. Please connect an integration.');
  }
  
  return tools;
}
```

This ensures:
- LLM only sees tools user can actually use
- Fewer tokens (only relevant tools)
- No failed plans due to missing connections

---

## Error Recovery

What if planning fails?

```typescript
async generatePlan(...): Promise<ActionPlan> {
  try {
    // ... planning logic
  } catch (error: any) {
    // Log for debugging
    logger.error('Planning failed', { 
      error: error.message,
      userInput,
      sessionId 
    });
    
    // Emit error event
    this.emit('planning_error', { 
      sessionId, 
      error: error.message 
    });
    
    // Return empty plan (UI will show helpful message)
    return [];
  }
}
```

An empty plan signals "couldn't understand request" — better than crashing.

---

## Temperature Setting

We use low temperature (0.1) for planning:

```typescript
await this.llmClient.chat({
  // ...
  temperature: 0.1  // Low = consistent, deterministic
});
```

**Why?**
- Plans should be consistent for the same input
- Don't want creativity in structure
- Save creativity for content generation (email bodies, etc.)

---

## Exercise

1. Look at `packages/intent-engine/src/PlannerService.ts`
2. Find the prompt template and understand each section
3. Try these inputs mentally — what plan would be generated?
   - "Show my emails from today"
   - "Create a meeting with Sarah tomorrow at 3pm"
   - "Send John the quarterly report and schedule a follow-up"

---

*Next: [2.2 Action Plans](./action-plans.md)*
