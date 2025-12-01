# Code Implementation Details

## 1. Error Handling Enhancement in ConversationService

### Location: `src/services/conversation/ConversationService.ts` (lines 375-421)

```typescript
let chunkCount = 0;
let streamError: any = null;
try {
    for await (const chunk of responseStream) {
        chunkCount++;

        const contentDelta = chunk.choices[0]?.delta?.content;
        const toolCallsDelta = chunk.choices[0]?.delta?.tool_calls;

        if (contentDelta) {
            accumulatedText += contentDelta;
            if (parser.parsing && !parserSuccessfullyCleanedUp) {
                parser.parseToken(contentDelta);
            }
        }

        if (toolCallsDelta) {
            if (!accumulatedToolCalls) accumulatedToolCalls = [];
            this.accumulateToolCallDeltas(accumulatedToolCalls, toolCallsDelta);
        }

        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason) {
            logger.info(`🔥 Conversational stream finished. Reason: ${finishReason}`, {
                sessionId,
                streamId,
                finishReason,
                chunkCount
            });
            break;
        }
    }

    logger.info('🔥 Stream iteration complete', {
        sessionId,
        streamId,
        chunkCount,
        accumulatedTextLength: accumulatedText.length,
        hasToolCalls: !!accumulatedToolCalls
    });
} catch (err: any) {
    streamError = err;
    logger.error('🔥🔥🔥 ERROR in LLM stream iteration', {
        sessionId,
        streamId,
        error: err.message,
        errorStack: err.stack,
        errorName: err.name,
        chunkCount,
        accumulatedTextLength: accumulatedText.length
    });
    // Check if this is a malformed tool call error
    if (err.message?.includes('Failed to parse tool call arguments as JSON')) {
        logger.warn('🔥 Malformed tool call detected - will attempt plan generation with placeholders', {
            sessionId,
            streamId,
            userMessage: currentUserMessage?.substring(0, 100)
        });
        // Continue processing - we'll generate a plan with placeholders instead
        accumulatedToolCalls = null;
        streamError = null; // Clear error to continue
    } else {
        throw err; // Re-throw other errors
    }
}
```

**Key Features:**
- Catches specific "Failed to parse tool call arguments as JSON" error
- Sets `streamError = null` to allow fallback processing
- Logs detailed error information for debugging
- Continues execution instead of crashing

---

## 2. Placeholder-Based Plan Generation

### Location: `src/services/conversation/ConversationService.ts` (lines 612-704)

```typescript
/**
 * Generate a plan with placeholders for vague requests
 * This allows the UI to prompt the user for missing parameters
 */
private async generatePlanWithPlaceholders(
    userMessage: string,
    sessionId: string,
    messageId: string,
    userId?: string
): Promise<any[]> {
    logger.info('🔥 Generating plan with placeholders for vague request', {
        sessionId,
        userMessage: userMessage.substring(0, 100)
    });

    // Use provider-aware filtering if available
    let availableTools;
    if (this.providerAwareFilter && userId) {
        const relevantCategories = getRelevantToolCategories(userMessage);
        availableTools = await this.providerAwareFilter.getToolsByCategoriesForUser(userId, relevantCategories);
    } else {
        const relevantCategories = getRelevantToolCategories(userMessage);
        availableTools = this.toolConfigManager.getToolsByCategories(relevantCategories);
    }

    const toolDefinitions = availableTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        schema: this.toolConfigManager.getToolInputSchema(tool.name)
    })).filter(t => t.schema);

    // Create a prompt that instructs the LLM to generate a plan with placeholders
    const planPrompt = `You are a planning expert. Analyze this user request and generate a structured plan using the available tools.

User Request: "${userMessage}"

Available Tools:
${JSON.stringify(toolDefinitions, null, 2)}

**IMPORTANT INSTRUCTIONS:**
1. For EACH action in the plan, use {{PLACEHOLDER_field_name}} for any missing or vague parameters
2. Example: {{PLACEHOLDER_meeting_title}}, {{PLACEHOLDER_attendee_email}}, {{PLACEHOLDER_start_time}}
3. Create action steps even if some parameters are missing - the UI will prompt for these
4. Output ONLY valid JSON in this format:

{
  "plan": [
    {
      "id": "step_1",
      "tool": "create_calendar_event",
      "intent": "Create a calendar meeting",
      "arguments": {
        "title": "{{PLACEHOLDER_meeting_title}}",
        "startTime": "{{PLACEHOLDER_start_time}}",
        "attendees": ["{{PLACEHOLDER_attendee_email}}"]
      }
    }
  ]
}`;

    try {
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: 'user', content: planPrompt }],
            max_tokens: 2048,
            temperature: 0.3,
        });

        const responseText = response.choices[0]?.message?.content || '';
        logger.info('🔥 Plan generation response received', {
            sessionId,
            responseLength: responseText.length
        });

        // Parse the JSON response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.warn('🔥 No JSON found in plan response', { sessionId });
            return [];
        }

        const parsedResponse = JSON.parse(jsonMatch[0]);
        const planSteps = parsedResponse.plan || [];

        logger.info('🔥 Successfully parsed plan with placeholders', {
            sessionId,
            stepCount: planSteps.length,
            steps: planSteps.map((s: any) => ({ id: s.id, tool: s.tool }))
        });

        return planSteps;
    } catch (error: any) {
        logger.error('🔥 Error generating plan with placeholders', {
            sessionId,
            error: error.message
        });
        return [];
    }
}
```

**Key Features:**
- Uses provider-aware tool filtering if available
- Creates a focused prompt for plan generation
- Extracts tool definitions and schemas
- Instructs LLM to use placeholder format
- Parses and validates JSON output
- Returns empty array on error (graceful failure)

---

## 3. Fallback to Plan Generation

### Location: `src/services/conversation/ConversationService.ts` (lines 524-546)

```typescript
// If tool calls failed or no tool calls were made, attempt to generate a plan with placeholders
// This allows vague requests to proceed with a plan that the UI can fill in missing params for
if (!accumulatedToolCalls || accumulatedToolCalls.length === 0) {
    logger.info('🔥 No valid tool calls from conversational stream, attempting plan generation with placeholders', {
        sessionId,
        streamId,
        userMessage: currentUserMessage?.substring(0, 100),
        hasConversationalText: !!accumulatedText
    });
    
    try {
        // Attempt to generate a plan from the user message
        // The planner will create a plan with placeholders for missing parameters
        const generatedPlan = await this.generatePlanWithPlaceholders(
            currentUserMessage || '',
            sessionId,
            currentMessageId,
            _userId
        );

        if (generatedPlan && generatedPlan.length > 0) {
            logger.info('🔥 Successfully generated plan with placeholders', {
                sessionId,
                stepCount: generatedPlan.length,
                toolNames: generatedPlan.map((s: any) => s.tool)
            });
            // Convert plan steps to aggregated tool calls format
            for (const step of generatedPlan) {
                aggregatedToolCallsOutput.push({
                    name: step.tool,
                    arguments: step.arguments,
                    id: step.id,
                    function: step.function,
                    streamType: 'planner'
                });
            }
        }
    } catch (planError: any) {
        logger.warn('🔥 Plan generation with placeholders failed', {
            sessionId,
            error: planError.message
        });
        // Continue without plan - conversational response is still valid
    }
}
```

**Key Features:**
- Triggered when no tool calls exist or are malformed
- Calls `generatePlanWithPlaceholders` method
- Converts plan steps to aggregated tool calls format
- Adds plan to output alongside conversational response
- Continues gracefully on error (no crash)

---

## 4. Updated Planner Prompt

### Location: `src/services/conversation/prompts/dedicatedPlannerPrompt.ts`

```typescript
**HANDLING VAGUE REQUESTS - USE PLACEHOLDERS:**
   - If parameters are missing or vague, use placeholder format: {{PLACEHOLDER_parameter_name}}
   - DO NOT mark status as "conditional" when you can use placeholders
   - The UI will prompt the user to fill in placeholders
   - Example: {{PLACEHOLDER_meeting_title}}, {{PLACEHOLDER_attendee_email}}, {{PLACEHOLDER_start_time}}
   - Always set status to "ready" when using placeholders - the plan should proceed to execution

---

**Output Format:**
You MUST output a single JSON object with a key named "plan". The value must be an array of action objects.
Each action object in the "plan" array must strictly follow this format:
{
  "id": "string",
  "intent": "string",
  "tool": "string",  // MUST be an exact match from Available Tools
  "arguments": { /* JSON object of arguments - use placeholders for missing params */ },
  "status": "ready",
  "requiredParams": []
}

**Example Output with Placeholders (PREFERRED when info is missing):**
{
  "plan": [
    {
      "id": "action_1",
      "intent": "Create a calendar meeting for the sales team",
      "tool": "create_calendar_event",
      "arguments": { 
        "title": "{{PLACEHOLDER_meeting_title}}",
        "startTime": "{{PLACEHOLDER_start_time}}",
        "duration": "{{PLACEHOLDER_duration_minutes}}",
        "attendees": ["{{PLACEHOLDER_attendee_email}}"]
      },
      "status": "ready",
      "requiredParams": []
    }
  ]
}
```

**Key Changes:**
- Added explicit placeholder handling section
- Clarified that placeholders are ALWAYS preferred over "conditional" status
- Provided concrete format: `{{PLACEHOLDER_*}}`
- Emphasized "ready" status when using placeholders
- Simplified LLM's decision-making process

---

## Data Flow Diagram

```
User Message
    ↓
ConversationService.processMessageAndAggregateResults()
    ↓
runConversationalStream()
    ↓
LLM call with tools=[fetch_*, create_*, update_*, planParallelActions]
    ├─ Success: Tool calls generated
    │   ├─ Parse tool arguments
    │   ├─ Success → Add to history
    │   └─ Error: Malformed JSON detected
    │       └─ Set accumulatedToolCalls = null
    │           └─ Continue to fallback
    │
    └─ Tool calls parsed successfully or caught
        ↓
    Check: accumulatedToolCalls && accumulatedToolCalls.length > 0?
        ├─ YES: Use tool calls directly
        │       └─ Emit tool_calls to aggregatedToolCallsOutput
        │
        └─ NO: Fallback to plan generation
                ↓
            generatePlanWithPlaceholders(userMessage)
                ↓
            LLM generates plan with {{PLACEHOLDER_*}}
                ↓
            Parse plan JSON
                ↓
            Convert to aggregatedToolCalls
                ↓
            Emit to aggregatedToolCallsOutput
                ↓
Return ProcessedMessageResult {
    toolCalls: boolean,
    aggregatedToolCalls: [...],
    conversationalResponse: string
}
```

---

## Integration Points

### What Consumes These Results

#### 1. WebSocket Handler (src/index.ts)
```typescript
// Line 561 - receives ProcessedMessageResult
const result = await conversationService.processMessageAndAggregateResults(
    userMessage,
    sessionId,
    currentMessageId,
    userId
);

// Check if plan was generated
if (result.toolCalls) {
    // Emit run or execute actions
}
```

#### 2. PlanExecutorService
```typescript
// Receives aggregatedToolCalls with placeholder arguments
// If argument contains {{PLACEHOLDER_*}}, shows UI form
// User fills in value
// Execution proceeds with complete arguments
```

#### 3. UI Detection Logic
```javascript
// Pseudocode for frontend
function hasPlaceholders(arguments) {
    return JSON.stringify(arguments).includes('{{PLACEHOLDER_');
}

if (hasPlaceholders(toolArguments)) {
    showParameterForm();
} else {
    enableExecuteButton();
}
```

---

## Error Recovery Paths

### Path 1: Malformed JSON → Placeholder Plan
```
try {
    parse tool call arguments as JSON
} catch (error: "Failed to parse tool call arguments as JSON") {
    → Continue processing
    → Call generatePlanWithPlaceholders()
    → Return plan with placeholders
} catch (other_error) {
    → Re-throw (hard failure)
}
```

### Path 2: LLM Returns Empty Response → Placeholder Plan
```
if (!accumulatedToolCalls || accumulatedToolCalls.length === 0) {
    → Check if conversational response exists
    → Call generatePlanWithPlaceholders()
    → Return both response + plan
}
```

### Path 3: Plan Generation Fails → Continue Gracefully
```
try {
    generate plan with placeholders
} catch (planError) {
    logger.warn()
    → Continue without plan
    → Return conversational response only
}
```

---

## Testing Checklist

- [ ] Test calendar tool with complete parameters
- [ ] Test vague calendar request (verify placeholder plan generated)
- [ ] Test malformed JSON error handling
- [ ] Test concurrent response streaming
- [ ] Test placeholder extraction in arguments
- [ ] Test provider-aware filtering in plan generation
- [ ] Test error logging at each decision point
- [ ] Test graceful fallback on plan generation failure
- [ ] Verify UI receives both response and plan
- [ ] Verify parameter forms shown for placeholders

---

## Performance Considerations

1. **Parallel Execution**: Conversational response and plan generation can run in parallel
2. **Async/Await**: No blocking operations
3. **Early Exit**: If tool calls succeed, skip plan generation
4. **Cached Tool Configs**: Provider-aware filtering uses caching
5. **LLM Temperature**: Plan generation uses temp=0.3 (lower variance, more deterministic)

---

## Security Considerations

1. **Parameter Validation**: UI should validate placeholder values before execution
2. **Schema Validation**: Plan executor validates arguments against tool schemas
3. **Authorization**: Provider-aware filtering ensures user only sees own tools
4. **Logging**: Sensitive data not logged in prompt content
5. **JSON Parsing**: Safe JSON parsing with try-catch
