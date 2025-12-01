# Test Scenarios & Expected Outcomes

## Scenario 1: Complete Calendar Request (Happy Path)

### User Input
```
"Schedule a meeting with the sales team tomorrow at 2pm for 1 hour."
```

### Expected Flow

#### 1. Tool Detection
```json
{
  "detectedCategories": ["Calendar"],
  "relevantTools": ["fetch_calendar_events", "create_calendar_event", "update_calendar_event"]
}
```

#### 2. LLM Response (should identify create_calendar_event)
```
Tool Call Identified:
- Tool: create_calendar_event
- Arguments:
  {
    "title": "Meeting with sales team",
    "startTime": "tomorrow 2pm",
    "duration": 60,
    "attendees": ["sales-team@company.com"]
  }
```

#### 3. JSON Parsing
```
✅ Status: Success
✅ Tool call added to accumulatedToolCalls
```

#### 4. Final Response to Client
```json
{
  "toolCalls": true,
  "aggregatedToolCalls": [
    {
      "name": "create_calendar_event",
      "arguments": {
        "title": "Meeting with sales team",
        "startTime": "tomorrow 2pm",
        "duration": 60,
        "attendees": ["sales-team@company.com"]
      },
      "id": "tool_call_1",
      "streamType": "conversational"
    }
  ],
  "conversationalResponse": "I'll schedule that meeting for you tomorrow at 2pm with the sales team."
}
```

#### 5. WebSocket Events (to Client)
```
1. conversational_text_segment
   - status: START_STREAM
   - content: { status: 'START_STREAM' }

2. conversational_text_segment (streaming)
   - content: { status: 'STREAMING', segment: { segment: "I'll schedule...", ... } }

3. conversational_text_segment
   - status: END_STREAM
   - isFinal: true

4. run_updated
   - status: running
   - toolExecutionPlan: [
       {
         stepId: "tool_call_1",
         toolCall: { name: "create_calendar_event", arguments: {...} },
         status: "ready"
       }
     ]

5. stream_end
```

#### 6. Server Logs
```
✅ 🔥 Tool category detection: Calendar
✅ 🔥 Groq tools after schema validation: create_calendar_event
✅ 🔥 Conversational stream: Calling LLM with tools
✅ 🔥 Stream iteration complete: chunkCount=...
✅ 🔥 Conversational stream: LLM response complete
   - contentLength: ...
   - hasToolCalls: true
   - toolCallCount: 1
   - toolCallNames: ["create_calendar_event"]
✅ All ConversationService streams have settled
   - finalAggregatedToolCount: 1
   - conversationalResponseLength: ...
```

---

## Scenario 2: Vague Calendar Request (Placeholder Fallback)

### User Input
```
"please make an exmple meetign nmycalednar"
```

### Expected Flow

#### 1. Tool Detection
```json
{
  "detectedCategories": ["Calendar"],
  "relevantTools": ["fetch_calendar_events", "create_calendar_event", "update_calendar_event"]
}
```

#### 2. LLM Stream Attempt
```
LLM Response: "I'd love to help create a meeting for you..."
Tool Call Identified: create_calendar_event
Arguments: {
  "title": "{{some incomplete JSON}}",
  ...
}
```

#### 3. JSON Parsing Error
```
❌ Error: "400 Failed to parse tool call arguments as JSON"
🔥 Malformed tool call detected - will attempt plan generation with placeholders
✅ Continue processing (don't crash)
```

#### 4. Fallback: generatePlanWithPlaceholders()
```
Input: "please make an exmple meetign nmycalednar"

LLM Prompt:
"You are a planning expert. Analyze this user request and generate a structured plan...
Use {{PLACEHOLDER_field_name}} for missing parameters..."

LLM Response:
{
  "plan": [
    {
      "id": "action_1",
      "tool": "create_calendar_event",
      "intent": "Create a calendar meeting",
      "arguments": {
        "title": "{{PLACEHOLDER_meeting_title}}",
        "startTime": "{{PLACEHOLDER_start_time}}",
        "duration": "{{PLACEHOLDER_duration_minutes}}",
        "attendees": ["{{PLACEHOLDER_attendee_email}}"]
      }
    }
  ]
}
```

#### 5. Plan Parsing & Conversion
```
✅ Successfully parsed plan with placeholders
✅ Converting to aggregatedToolCalls format
✅ Adding to output
```

#### 6. Final Response to Client
```json
{
  "toolCalls": true,
  "aggregatedToolCalls": [
    {
      "name": "create_calendar_event",
      "arguments": {
        "title": "{{PLACEHOLDER_meeting_title}}",
        "startTime": "{{PLACEHOLDER_start_time}}",
        "duration": "{{PLACEHOLDER_duration_minutes}}",
        "attendees": ["{{PLACEHOLDER_attendee_email}}"]
      },
      "id": "action_1",
      "streamType": "planner"
    }
  ],
  "conversationalResponse": "I'd love to help create a meeting for you..."
}
```

#### 7. WebSocket Events (to Client)
```
1. conversational_text_segment (response)
   - "I'd love to help create a meeting for you..."

2. run_updated
   - toolExecutionPlan: [
       {
         stepId: "action_1",
         toolCall: {
           name: "create_calendar_event",
           arguments: {
             "title": "{{PLACEHOLDER_meeting_title}}",
             ...
           }
         },
         status: "ready"
       }
     ]
```

#### 8. UI Behavior
```
Detect placeholders in arguments:
- meeting_title
- start_time
- duration_minutes
- attendee_email

Show parameter form:
┌─────────────────────────────────┐
│ Missing Parameters Required      │
├─────────────────────────────────┤
│ Meeting Title:      [ _________ ]│
│ Start Time:         [ _________ ]│
│ Duration (minutes): [ _________ ]│
│ Attendee Email:     [ _________ ]│
│                                  │
│ [ Cancel ] [ Create Meeting ]    │
└─────────────────────────────────┘
```

#### 9. Server Logs
```
⚠️ 🔥 ERROR in LLM stream iteration
   - error: "400 Failed to parse tool call arguments as JSON"
   - chunkCount: 88

⚠️ 🔥 Malformed tool call detected - will attempt plan generation with placeholders
   - userMessage: "please make an exmple m..."

✅ 🔥 No valid tool calls from conversational stream, attempting plan generation
   - streamId: conversational_...
   - hasConversationalText: true

✅ 🔥 Generating plan with placeholders for vague request
   - userMessage: "please make an exmple m..."

✅ 🔥 Plan generation response received
   - responseLength: 245

✅ 🔥 Successfully parsed plan with placeholders
   - stepCount: 1
   - steps: [{ id: "action_1", tool: "create_calendar_event" }]

✅ 🔥 Successfully generated plan with placeholders
   - stepCount: 1
   - toolNames: ["create_calendar_event"]
```

---

## Scenario 3: User Fills Placeholders & Executes

### User Input (after form submission)
```json
{
  "type": "execute_action",
  "content": {
    "actionId": "action_1",
    "toolName": "create_calendar_event",
    "parameters": {
      "title": "Q4 Sales Strategy Review",
      "startTime": "2025-11-28T14:00:00",
      "duration": 60,
      "attendees": ["team@company.com"]
    }
  }
}
```

### Expected Flow

#### 1. Parameter Replacement
```
Original arguments:
{
  "title": "{{PLACEHOLDER_meeting_title}}",
  "startTime": "{{PLACEHOLDER_start_time}}",
  ...
}

After user input:
{
  "title": "Q4 Sales Strategy Review",
  "startTime": "2025-11-28T14:00:00",
  "duration": 60,
  "attendees": ["team@company.com"]
}
```

#### 2. Schema Validation
```
✅ Validate against create_calendar_event schema
✅ All required parameters present
✅ Types match schema expectations
✅ Values within valid ranges
```

#### 3. Tool Execution
```
→ ActionLauncherService.executeAction()
→ ToolOrchestrator.execute(create_calendar_event, {...})
→ NangoService.executeIntegration()
→ Calendar API call
← Response: { eventId: "event_123", url: "..." }
```

#### 4. Execution Result
```json
{
  "status": "completed",
  "result": {
    "eventId": "event_123",
    "title": "Q4 Sales Strategy Review",
    "startTime": "2025-11-28T14:00:00",
    "attendees": ["team@company.com"],
    "url": "https://calendar.google.com/calendar/u/0/r/event/event_123"
  }
}
```

#### 5. WebSocket Response
```
1. action_status
   - actionId: "action_1"
   - status: "starting"
   - message: "Starting create_calendar_event..."

2. action_status
   - actionId: "action_1"
   - status: "running"
   - message: "Creating calendar event..."

3. action_status
   - actionId: "action_1"
   - status: "completed"
   - message: "Calendar event created successfully"
   - result: { eventId: "...", url: "..." }

4. conversational_text_segment
   - "I've successfully created the meeting! Here's the details:
     Event: Q4 Sales Strategy Review
     When: Nov 28, 2025 at 2:00 PM
     Duration: 1 hour
     Attendees: team@company.com"
```

#### 6. Server Logs
```
✅ Executing tool: create_calendar_event
✅ Arguments validated
✅ Tool execution started
✅ Calendar API response received
✅ Tool execution completed
   - status: completed
   - result: { eventId: "event_123", ... }
✅ Conversational summary generated
✅ User history updated
```

---

## Scenario 4: Complex Multi-Step Request

### User Input
```
"Find all my unread emails from today and schedule a 15-minute callback meeting with whoever sent the most important one"
```

### Expected Flow

#### 1. Multi-Tool Detection
```
Detected Categories: ["Email", "Calendar"]
Relevant Tools: [
  "fetch_emails",
  "create_calendar_event",
  "fetch_entity" (optional for priority detection)
]
```

#### 2. Plan Generation with Data Dependencies
```
Generated Plan:
{
  "plan": [
    {
      "id": "step_1",
      "tool": "fetch_emails",
      "intent": "Fetch unread emails from today",
      "arguments": {
        "folder": "inbox",
        "filters": {
          "isUnread": true,
          "dateFrom": "today"
        }
      },
      "status": "ready"
    },
    {
      "id": "step_2",
      "tool": "create_calendar_event",
      "intent": "Schedule callback meeting with sender of most important email",
      "arguments": {
        "title": "Callback: {{step_1.result.emails[0].subject}}",
        "attendees": ["{{step_1.result.emails[0].from}}"],
        "duration": 15,
        "startTime": "{{PLACEHOLDER_callback_time}}"
      },
      "status": "ready"
    }
  ]
}
```

#### 3. Step 1 Execution: fetch_emails
```
Result:
{
  "emails": [
    {
      "id": "email_1",
      "from": "john.doe@company.com",
      "subject": "Urgent: Q4 Budget Review Required",
      "isUnread": true,
      "receivedTime": "2025-11-27T10:30:00"
    },
    {
      "id": "email_2",
      "from": "jane.smith@company.com",
      "subject": "Meeting notes attached",
      "isUnread": true,
      "receivedTime": "2025-11-27T09:15:00"
    }
  ]
}
```

#### 4. Placeholder Resolution for Step 2
```
Before: {
  "title": "Callback: {{step_1.result.emails[0].subject}}",
  "attendees": ["{{step_1.result.emails[0].from}}"],
  "startTime": "{{PLACEHOLDER_callback_time}}"
}

After placeholder extraction:
{
  "title": "Callback: Urgent: Q4 Budget Review Required",
  "attendees": ["john.doe@company.com"],
  "startTime": "{{PLACEHOLDER_callback_time}}"
}

UI shows form for:
- callback_time (only missing param)
```

#### 5. User Fills Missing Param
```
User input: "callback_time" = "2025-11-28T15:00:00"

Final arguments:
{
  "title": "Callback: Urgent: Q4 Budget Review Required",
  "attendees": ["john.doe@company.com"],
  "duration": 15,
  "startTime": "2025-11-28T15:00:00"
}
```

#### 6. Step 2 Execution: create_calendar_event
```
Result:
{
  "eventId": "event_456",
  "title": "Callback: Urgent: Q4 Budget Review Required",
  "startTime": "2025-11-28T15:00:00",
  "duration": 15,
  "attendees": ["john.doe@company.com"],
  "url": "https://calendar.google.com/calendar/u/0/r/event/event_456"
}
```

#### 7. Final Summary
```
Conversational Response:
"I've checked your unread emails from today. The most important one is from John 
about the Q4 Budget Review. I've scheduled a 15-minute callback meeting with him 
for tomorrow at 3:00 PM. Here's the meeting link: [url]"

Events sent to client:
1. Email fetch completed
2. Meeting scheduled
3. Summary with links
4. Both actions completed
```

---

## Edge Cases & Error Scenarios

### Edge Case 1: Completely Invalid Request
```
User: "asdfghjkl"

Expected:
- Tool detection: No relevant categories
- LLM generates: Conversational response asking for clarification
- Plan generation: Skipped (no relevant tools)
- Result: Conversational response only, no plan
```

### Edge Case 2: Network/API Failure
```
During: fetch_emails execution
Error: "Connection timeout to Gmail API"

Expected:
- Step 1 marked as "failed"
- Step 2 marked as "blocked" (depends on step 1)
- Error message sent to client
- User can retry or try different action
```

### Edge Case 3: Missing OAuth Token
```
During: Tool execution
Error: "No valid OAuth token for user"

Expected:
- Action marked as "failed"
- Error message: "Please reconnect your Gmail account"
- Link to reconnection flow
- User can reconnect and retry
```

### Edge Case 4: Ambiguous Request
```
User: "send an email"

Expected:
- Conversational response: "I can help! What would you like to say in the email?"
- Plan with placeholders:
  - to: {{PLACEHOLDER_recipient}}
  - subject: {{PLACEHOLDER_subject}}
  - body: {{PLACEHOLDER_email_body}}
- UI shows form for all fields
```

### Edge Case 5: Rate Limited by API
```
During: Multiple quick execution attempts
Error: "Rate limit exceeded"

Expected:
- Action queued
- Retry scheduled with exponential backoff
- User notified: "Request queued, executing in 30 seconds"
- Proceed with next available slot
```

---

## Performance Baseline Expectations

| Scenario | Expected Time | Notes |
|----------|---------------|-------|
| Complete request with tool call | 2-3 seconds | Includes LLM inference + validation |
| Vague request → plan generation | 4-5 seconds | LLM called twice (conversational + plan) |
| Placeholder execution | <1 second | Direct tool call, no LLM inference |
| Multi-step with dependencies | 8-12 seconds | Includes wait time between steps |
| Error recovery (malformed JSON) | 5-7 seconds | Fallback to plan generation |

---

## Monitoring Metrics

### Key Metrics to Track

1. **Error Rates**
   - JSON parsing errors: Should decrease with placeholder handling
   - Plan generation success rate: Target > 95%
   - Tool execution success rate: By tool type

2. **Latency**
   - Time to first conversational text: < 1 sec
   - Time to plan generation: < 3 sec
   - Time to execution: < 2 sec

3. **User Behavior**
   - % of requests with placeholders: Track baseline
   - % of placeholder forms completed: Target > 80%
   - Average parameters filled per form: Monitor trends

4. **Quality**
   - Plan accuracy: % of generated plans user accepts
   - Parameter accuracy: % of filled parameters valid
   - Execution success rate: % of plans executed successfully

---

## Next Steps for Testing

1. **Manual Testing**
   - Test each scenario above in dev environment
   - Verify WebSocket events match expected flow
   - Check server logs at each decision point

2. **Integration Testing**
   - Test with real Gmail/Calendar APIs
   - Test with real Salesforce/CRM data
   - Test provider-aware filtering

3. **Load Testing**
   - Multiple concurrent requests
   - Plan generation with large tool sets
   - High volume placeholder extraction

4. **Error Injection Testing**
   - Simulate malformed JSON responses
   - Simulate API timeouts
   - Simulate auth failures

5. **User Acceptance Testing**
   - Real users test vague requests
   - Collect feedback on placeholder forms
   - Measure satisfaction with auto-planning
