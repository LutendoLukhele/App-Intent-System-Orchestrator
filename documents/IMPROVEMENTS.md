# Integration Testing & Improvements: Calendar Tool & Plan Generation

## Executive Summary
This document outlines the improvements made to the conversation service and plan generation pipeline to handle the JSON parsing error and implement a more robust placeholder-based approach for vague requests.

## Issues Identified & Fixed

### 1. **JSON Parsing Error in Tool Call Arguments**
**Problem:** 
- Error: `400 Failed to parse tool call arguments as JSON`
- Occurred when the LLM attempted to generate tool calls but produced malformed JSON
- This was caused by the LLM trying to call `planParallelActions` tool with improper argument formatting

**Root Cause:**
- The conversational stream was attempting to parse incomplete or malformed JSON from the LLM's tool call deltas
- No graceful fallback mechanism existed when tool calls failed to parse

**Solution Implemented:**
- Added resilient error handling in `runConversationalStream` to catch JSON parsing errors
- When a malformed tool call error is detected, the stream continues gracefully instead of crashing
- The system now falls back to plan generation with placeholders

### 2. **Over-Engineered Missing Parameter Handling**
**Problem:**
- The previous solution for handling missing parameters relied entirely on the LLM's `planParallelActions` tool
- This required the LLM to perfectly understand complex planning scenarios
- When tool call formatting failed, the entire pipeline broke

**Solution Implemented:**
- Introduced `generatePlanWithPlaceholders()` method in ConversationService
- Uses a dedicated prompt to instruct the LLM to generate plans with placeholder parameters
- Format: `{{PLACEHOLDER_parameter_name}}` for missing values
- Example: `{{PLACEHOLDER_meeting_title}}`, `{{PLACEHOLDER_attendee_email}}`, `{{PLACEHOLDER_start_time}}`

## Architecture Changes

### 3. **Parallel Conversational Response & Plan Generation**
**Implementation:**
```
User Request
    ↓
Conversational Stream (parallel)
├─ Generate conversational response
├─ Attempt tool call identification
├─ If tool calls fail or missing parameters detected:
│  └─ Trigger plan generation with placeholders
└─ Return both response + plan (if generated)

UI receives:
- Conversational message (always)
- Generated plan with placeholders (if applicable)
- Run state with action steps
```

**Benefits:**
- User always gets a conversational response, even if tool calls fail
- Plan generation happens automatically when needed
- Both responses stream simultaneously to the client
- UI can prompt for missing parameters without blocking conversation flow

### 4. **Improved Planner Prompt - Placeholder-Centric Design**

**Key Changes to `dedicatedPlannerPrompt.ts`:**

#### Old Approach:
```
- Mark status as "conditional" if parameters missing
- Require exact parameter values in arguments
- LLM must ask clarifying questions
- Plan execution blocked until parameters provided
```

#### New Approach:
```
- Use placeholders for missing parameters: {{PLACEHOLDER_name}}
- Always mark status as "ready"
- Plan proceeds to UI for parameter fulfillment
- Much simpler for LLM to understand and execute
- UI shows forms/prompts for placeholder fields
```

**Prompt Instructions:**
```
4. **HANDLING VAGUE REQUESTS - USE PLACEHOLDERS:**
   - If parameters are missing or vague, use placeholder format: {{PLACEHOLDER_parameter_name}}
   - DO NOT mark status as "conditional" when you can use placeholders
   - The UI will prompt the user to fill in placeholders
   - Example: {{PLACEHOLDER_meeting_title}}, {{PLACEHOLDER_attendee_email}}, {{PLACEHOLDER_start_time}}
   - Always set status to "ready" when using placeholders - the plan should proceed to execution
```

**Example Output:**
```json
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

## Test Case: Calendar Meeting Creation

### User Input
```
"please make an exmple meetign nmycalednar"
(vague, has typos)
```

### Expected Flow with New Implementation

1. **Conversational Stream:**
   - LLM generates: "I'd love to help create a meeting. Let me set that up for you."
   - Attempts to identify tool: `create_calendar_event`
   - Tool call arguments malformed → Caught gracefully

2. **Fallback to Plan Generation:**
   - `generatePlanWithPlaceholders()` called
   - Prompt instructs LLM: "Generate a plan even if parameters are vague, use placeholders"
   - LLM generates:
     ```json
     {
       "plan": [{
         "id": "action_1",
         "tool": "create_calendar_event",
         "intent": "Create a calendar meeting",
         "arguments": {
           "title": "{{PLACEHOLDER_meeting_title}}",
           "startTime": "{{PLACEHOLDER_start_time}}",
           "attendees": ["{{PLACEHOLDER_attendee_email}}"]
         },
         "status": "ready"
       }]
     }
     ```

3. **Response to Client:**
   - ✅ Conversational message: "I'll create a meeting for you"
   - ✅ Run object with action steps
   - ✅ UI displays form fields for: meeting_title, start_time, attendee_email
   - ✅ User fills in parameters
   - ✅ Execution proceeds with complete information

## Code Changes Summary

### Files Modified

#### 1. `src/services/conversation/ConversationService.ts`
**Changes:**
- Enhanced error handling in stream iteration (lines 375-421)
  - Catches malformed JSON errors gracefully
  - Continues processing instead of crashing
- Added `generatePlanWithPlaceholders()` method (lines 612-704)
  - Generates plans with placeholder parameters
  - Handles missing parameters elegantly
  - Returns ready-to-execute action steps
- Added fallback logic after conversational stream (lines 524-546)
  - Automatically triggers plan generation when needed
  - Provides both conversational response + plan

**Key Features:**
```typescript
- Graceful error recovery from malformed tool calls
- Automatic placeholder-based plan generation
- Logging at each decision point for debugging
- Non-blocking fallback mechanism
```

#### 2. `src/services/conversation/prompts/dedicatedPlannerPrompt.ts`
**Changes:**
- Added "HANDLING VAGUE REQUESTS - USE PLACEHOLDERS" section
- Clarified that placeholders should ALWAYS be used for missing params
- Specified `{{PLACEHOLDER_*}}` format consistently
- Changed guidance: always use "ready" status when using placeholders
- Provided concrete examples of placeholder usage
- Removed emphasis on "conditional" status

**Benefits:**
```
- LLM receives clearer instructions
- Less ambiguity about parameter handling
- Simpler for LLM to generate valid plans
- Better UI integration
```

## Flow Diagram: Request → Response

```
┌─────────────────────────────────────────────────────────────┐
│ User: "please make an example meeting in my calendar"       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ ConversationService.processMessageAndAggregateResults()     │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────────────┐
                    │ Tool Detection│
                    └───────┬───────┘
                            ↓
              ┌─────────────────────────────┐
              │ runConversationalStream()    │
              │ (Try LLM with tool choice)  │
              └──────────┬──────────────────┘
                         ↓
            ┌────────────────────────────┐
            │ Try JSON Parsing of Tool   │
            │ Call Arguments             │
            └────┬───────────────────┬──┘
                 │ Success          │ Malformed JSON
                 ↓                  ↓
         ┌──────────────┐    ┌─────────────────────┐
         │ Generate     │    │ Catch Error         │
         │ Conversational   │ generatePlanWith    │
         │ Response     │    │ Placeholders()      │
         └──────┬───────┘    └────────┬────────────┘
                │                     ↓
                │            ┌──────────────────────┐
                │            │ LLM Creates Plan     │
                │            │ with {{PLACEHOLDER}} │
                │            └────────┬─────────────┘
                │                     ↓
                │            ┌──────────────────────┐
                │            │ Parse JSON Plan      │
                │            │ Add to aggregatedTC  │
                │            └────────┬─────────────┘
                │                     ↓
                └──────────┬──────────┘
                           ↓
        ┌──────────────────────────────────────┐
        │ Return ProcessedMessageResult:       │
        │ - conversationalResponse             │
        │ - aggregatedToolCalls (with plan)    │
        │ - toolCalls: true (if plan generated)│
        └──────────────────────────────────────┘
                           ↓
        ┌──────────────────────────────────────┐
        │ Stream to WebSocket Client:          │
        │ - conversational_text_segment        │
        │ - run_updated (with action steps)    │
        │ - UI detects placeholders in args    │
        │ - Shows form for parameter input     │
        └──────────────────────────────────────┘
```

## UI Integration Points

### What the Frontend Should Expect

#### 1. **Conversational Response**
```json
{
  "type": "conversational_text_segment",
  "content": "I'd be happy to create a meeting for you. Let me set that up!",
  "messageId": "234f5d8b-c195-49d9-a840-82d17bdb24da",
  "streamType": "conversational"
}
```

#### 2. **Run with Action Steps (containing placeholders)**
```json
{
  "type": "run_updated",
  "content": {
    "toolExecutionPlan": [
      {
        "stepId": "action_1",
        "toolCall": {
          "id": "action_1",
          "name": "create_calendar_event",
          "arguments": {
            "title": "{{PLACEHOLDER_meeting_title}}",
            "startTime": "{{PLACEHOLDER_start_time}}",
            "duration": "{{PLACEHOLDER_duration_minutes}}",
            "attendees": ["{{PLACEHOLDER_attendee_email}}"]
          }
        },
        "status": "ready"
      }
    ]
  }
}
```

#### 3. **UI Rendering Logic**
```javascript
// Detect placeholders in arguments
function extractPlaceholders(arguments) {
  const placeholders = [];
  const regex = /\{\{PLACEHOLDER_(\w+)\}\}/g;
  let match;
  while ((match = regex.exec(JSON.stringify(arguments))) !== null) {
    placeholders.push({
      field: match[1],
      placeholder: match[0]
    });
  }
  return placeholders;
}

// Show form for missing parameters
if (placeholders.length > 0) {
  showParameterForm(placeholders);
} else {
  enableExecuteButton();
}
```

## Improvements & Best Practices

### 1. **Error Resilience**
- ✅ Malformed JSON from LLM doesn't crash the system
- ✅ Graceful fallback to alternative approach
- ✅ Comprehensive logging at each decision point

### 2. **Simpler LLM Prompting**
- ✅ Placeholder format is unambiguous
- ✅ LLM doesn't need to understand complex conditional logic
- ✅ Lower cognitive load on the model
- ✅ More reliable output

### 3. **Better UX**
- ✅ User always gets immediate conversational response
- ✅ Plan is generated automatically when vague
- ✅ UI can show forms for missing parameters
- ✅ No waiting for clarification questions

### 4. **Maintainability**
- ✅ Clear separation of concerns
- ✅ Explicit placeholder format (`{{PLACEHOLDER_*}}`)
- ✅ Reduced code complexity
- ✅ Easier to debug and extend

## Testing Recommendations

### 1. **Calendar Tool Integration Test**
```
Scenario: "Create a meeting with the sales team tomorrow at 2pm"
Expected:
- ✅ Conversational response received
- ✅ Create_calendar_event tool identified
- ✅ Run object returned with action steps
- ✅ All parameters filled (no placeholders)
- ✅ Can proceed directly to execution
```

### 2. **Vague Request Test (Placeholder Fallback)**
```
Scenario: "make a meeting on my calendar"
Expected:
- ✅ Conversational response received
- ✅ Plan generated with placeholders:
  - {{PLACEHOLDER_title}}
  - {{PLACEHOLDER_startTime}}
  - {{PLACEHOLDER_duration}}
  - {{PLACEHOLDER_attendees}}
- ✅ UI shows form for parameters
- ✅ User can fill in and execute
```

### 3. **Malformed JSON Recovery Test**
```
Scenario: LLM returns malformed tool call arguments
Expected:
- ✅ Error caught gracefully
- ✅ Fallback to plan generation
- ✅ Plan with placeholders returned
- ✅ System continues without crash
```

### 4. **Concurrent Response Streaming Test**
```
Scenario: Both conversational response and plan generation
Expected:
- ✅ Conversational text streams immediately
- ✅ Plan updates/run_updated streamed in parallel
- ✅ Both arrive at client
- ✅ UI shows both response and action steps
```

## Monitoring & Logging

### Key Log Patterns to Monitor

#### Success Path (with placeholders):
```
🔥 No valid tool calls from conversational stream, attempting plan generation
🔥 Generating plan with placeholders for vague request
🔥 Successfully parsed plan with placeholders
🔥 Plan generation response received
```

#### Error Recovery Path:
```
🔥 Malformed tool call detected - will attempt plan generation with placeholders
🔥 Error in LLM stream iteration: 400 Failed to parse tool call arguments
🔥 No valid tool calls from conversational stream
```

#### Normal Path (with complete parameters):
```
🔥 Conversational stream: LLM response complete
toolCallCount: 1
toolCallNames: ["create_calendar_event"]
```

## Future Enhancements

1. **Parameter Persistence**
   - Remember previously entered parameters for similar requests
   - Auto-fill placeholders based on context

2. **Smart Placeholder Detection**
   - Automatically extract possible values from conversation history
   - Pre-fill placeholders when high confidence values exist

3. **Progressive Refinement**
   - Allow user to refine parameters in subsequent messages
   - Update plan with clarified values

4. **Validation at Execution**
   - Validate filled-in placeholder values against tool schema
   - Show errors if invalid and request correction

5. **Template System**
   - Create templates for common requests
   - Suggest templates to user based on request similarity

## Conclusion

The new implementation provides a more reliable, user-friendly approach to handling vague requests and tool call failures. By using placeholders and enabling parallel response streaming, the system achieves:

- **Robustness**: No crashes on malformed LLM output
- **Simplicity**: Clearer prompts lead to more reliable LLM behavior
- **UX**: Immediate feedback with gradual parameter collection
- **Maintainability**: Simpler code, easier to debug and extend

The placeholder-based approach is significantly more reliable than relying on complex conditional status flags, and it better matches real-world usage patterns where users often provide vague initial requests.
