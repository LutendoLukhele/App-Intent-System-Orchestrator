# Date Formatting Fix for Email Tool Calls

## Issue
The LLM was generating invalid date parameters when processing email queries like "Show me my most recent 5 email threads from today".

**Error:**
```
400 tool call validation failed: parameters for tool fetch_emails did not match schema: 
errors: [`/input/filters/dateRange/after`: 'today' is not valid 'date-time']
```

**Root Cause:** The LLM was using natural language dates ("today", "last week") instead of ISO 8601 formatted dates.

---

## Solution

Added comprehensive date handling guidance to both:
1. `mainConversationalPrompt.ts` - For general conversation
2. `dedicatedToolCallPrompt.ts` - For explicit tool invocation

### Key Guidance Added

```typescript
// DATE PARAMETER EXAMPLES:

// ❌ WRONG: Using natural language
{"input": {"operation": "fetch", "filters": {"dateRange": {"after": "today"}}}}

// ✅ CORRECT: Using ISO 8601 format
{"input": {"operation": "fetch", "filters": {"dateRange": {"after": "2026-01-16T00:00:00Z"}}}}

// ✅ ALTERNATIVE: Using backfillPeriodMs for time windows
{"input": {"operation": "fetch", "backfillPeriodMs": 86400000}}  // 24 hours
{"input": {"operation": "fetch", "backfillPeriodMs": 604800000}} // 7 days
```

### What Changed

#### mainConversationalPrompt.ts
- Added examples of ISO 8601 date formatting
- Explained when to use `dateRange` (specific dates) vs `backfillPeriodMs` (time windows)
- Provided clear examples for "today", "this week" scenarios

#### dedicatedToolCallPrompt.ts
- Added dedicated DATE PARAMETERS section
- Explicit warning: "NEVER use natural language like 'today', 'this week', 'yesterday'"
- Examples of correct conversion (e.g., "today" → "2026-01-16T00:00:00Z")
- Guidance on when to prefer milliseconds over ISO dates

---

## Test Scenario

**Before Fix:**
```
User: "Show me my most recent 5 email threads from today, excluding promotions."
  ↓
LLM generates: dateRange: { after: "today" }
  ↓
Groq validation fails with 400 error
  ↓
No email results, user sees error
```

**After Fix:**
```
User: "Show me my most recent 5 email threads from today, excluding promotions."
  ↓
LLM generates: dateRange: { after: "2026-01-16T00:00:00Z" }
  ↓
Groq validation passes
  ↓
Emails fetched, hydrated, and sent to LLM
  ↓
User sees rich summary with email content
```

---

## Date Format Reference

### ISO 8601 Format
All dates must follow: `YYYY-MM-DDTHH:MM:SSZ`

Examples:
- `"2026-01-16T00:00:00Z"` - Jan 16, 2026 at midnight UTC
- `"2026-01-16T08:16:28Z"` - Jan 16, 2026 at 8:16:28 AM UTC
- `"2026-01-01T00:00:00Z"` - Jan 1, 2026 at midnight UTC

### Milliseconds Format (backfillPeriodMs)
For relative time windows:
- `86400000` = 24 hours (1 day)
- `604800000` = 7 days (1 week)
- `2592000000` = 30 days (1 month)
- `2592000000 * 3` = 90 days (3 months)

---

## Files Modified

1. **src/services/conversation/prompts/mainConversationalPrompt.ts**
   - Added date formatting examples
   - Clarified when to use dateRange vs backfillPeriodMs
   - Provided "today", "this week" examples

2. **src/services/conversation/prompts/dedicatedToolCallPrompt.ts**
   - Added DATE PARAMETERS section
   - Explicit conversion rules
   - Warnings about natural language

---

## Expected Behavior After Fix

### ✅ LLM Now Correctly:
- Converts "today" → ISO 8601 format
- Converts "last week" → `backfillPeriodMs: 604800000`
- Understands `dateRange.after` requires ISO 8601
- Avoids natural language in date parameters

### ✅ Error Resolution:
- No more "`'today' is not valid 'date-time'` errors
- Email fetch calls pass schema validation
- Emails are properly retrieved and processed
- Follow-up flow works end-to-end

---

## Future Improvements

1. **Helper Function:** Add utility to convert dates client-side
   ```typescript
   function getTodayISO8601(): string {
     return new Date().toISOString().split('T')[0] + 'T00:00:00Z';
   }
   ```

2. **Natural Language Parser:** Consider preprocessing user queries to convert dates before sending to LLM

3. **Schema Validation:** Add more helpful error messages for date format failures

4. **Prompt Cache:** Cache the date formatting guidance to reduce token usage

---

## Rollback Plan

If any issues occur:

```bash
git checkout src/services/conversation/prompts/mainConversationalPrompt.ts
git checkout src/services/conversation/prompts/dedicatedToolCallPrompt.ts
npm run dev
```

The changes are purely guidance in prompts - no code logic was modified.

---

## Testing Checklist

- [ ] Test: "Show me emails from today"
  - Expected: Fetch call with proper ISO 8601 date
  - Check logs for: `dateRange: { after: "2026-01-16T00:00:00Z" }`

- [ ] Test: "Find emails from last week"
  - Expected: Fetch call with backfillPeriodMs or dateRange
  - Check logs: Should NOT contain `"last week"`

- [ ] Test: "Get my emails from January 1st, 2026"
  - Expected: Proper ISO 8601: `"2026-01-01T00:00:00Z"`

- [ ] Test: Complex query with date and filters
  - "Show me emails from today from Sarah, excluding promotions"
  - Expected: Date + sender + excludeCategories all correct

---

## Questions?

Refer to [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for complete fix summary including email hydration improvements.
