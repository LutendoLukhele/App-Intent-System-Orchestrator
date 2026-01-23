# Follow-Up Flow: Log Patterns to Monitor

## Critical Log Patterns (Copy-paste for monitoring)

### Pattern 1: Hydration Success
```
message: "✅ Compressed email data for summary mode"
originalCount: 5
compressedCount: 3
originalSize: 107378
compressedSize: 18234
compressionRatio: "83.0%"
```
**✅ Good:** Shows data was compressed and actual content will be sent

---

### Pattern 2: Data Being Sent to LLM
```
message: "Summary mode: Messages being sent to LLM"
toolResults: [{
    name: "fetch_emails",
    contentLength: 18234,
    isRedisRef: false,
    contentPreview: "[{\"from\":\"John Smith\""
}]
```
**✅ Good:** `isRedisRef: false` means actual email data is being sent
**❌ Bad:** `contentLength: 288` with `isRedisRef: true` means reference is being sent

---

### Pattern 3: LLM Call in Summary Mode
```
message: "🔥 Conversational stream: Calling LLM in summary mode (NO tools)"
toolResultMessages: 1
toolResultDetails: [{
    name: "fetch_emails",
    size: 18234,
    isRedisRef: false,
    preview: "[{\"from\":\"John Smith\",\"subject\":\"Q3 Planning\""
}]
```
**✅ Good:** Preview shows email subjects, not `__redisKey`

---

### Pattern 4: Final LLM Response
```
message: "🔥 Conversational stream: LLM response complete"
hasContent: true
contentLength: 1608
contentPreview: "I've fetched your most recent 3 email threads..."
isEmpty: false
```
**✅ Good:** Response length > 500 chars, includes actual email details
**❌ Bad:** Response contains "waiting for clarification" or "placeholders"

---

## Real-Time Monitoring Command

### Watch all critical logs:
```bash
npm run dev 2>&1 | grep -E "^{.*" | jq -r 'select(.message | contains("Compressed") or contains("isRedisRef") or contains("Calling LLM in summary") or contains("response complete")) | "\(.timestamp) [\(.message)] \(.contentLength // .compressionRatio // .size // "")"'
```

### Simpler version (easier to run):
```bash
npm run dev 2>&1 | grep -E "(Compressed|isRedisRef|Calling LLM in summary|response complete)"
```

### Ultra simple (tail last N logs):
```bash
npm run dev 2>&1 | tail -50 | grep -E "(Compressed|hydration|summary)"
```

---

## Detailed Log Analysis Workflow

### Step 1: Trigger Email Fetch + Summary
```javascript
// In browser console or test client:
{
  type: 'content',
  content: 'What are my latest emails?'
}
```

### Step 2: Monitor Hydration Phase
Watch logs for pattern like:
```
✅ Compressed email data for summary mode
  originalCount: X
  compressedCount: Y
  compressionRatio: "Z%"
```

**Check:** Compression ratio should be > 80%

### Step 3: Verify Data is Sent
Watch for:
```
Summary mode: Messages being sent to LLM
  toolResults[0].isRedisRef: false
  toolResults[0].contentLength: XXXX
```

**Check:** 
- `isRedisRef` should be `false`
- `contentLength` should be > 10000 (not 288)
- `contentPreview` should show email JSON

### Step 4: Verify LLM Call
Watch for:
```
Conversational stream: Calling LLM in summary mode
  toolResultDetails: [ { ... } ]
```

**Check:** The preview should show email content, not references

### Step 5: Check Final Response
Watch for:
```
Conversational stream: LLM response complete
  hasContent: true
  contentLength: XXXX
  contentPreview: "I've fetched your most recent..."
```

**Check:**
- `hasContent: true`
- `contentLength` > 500
- `contentPreview` mentions actual email senders/subjects

---

## Expected vs Actual Logs

### ✅ CORRECT FLOW

```json
{
  "timestamp": "2026-01-16T08:00:00.000Z",
  "level": "info",
  "message": "🔄 Starting Redis hydration",
  "summaryMode": true,
  "messageCount": 4
}
{
  "timestamp": "2026-01-16T08:00:00.050Z",
  "level": "info",
  "message": "✅ Compressed email data for summary mode",
  "originalCount": 5,
  "compressedCount": 3,
  "originalSize": 107378,
  "compressedSize": 18234,
  "compressionRatio": "83.0%"
}
{
  "timestamp": "2026-01-16T08:00:00.100Z",
  "level": "info",
  "message": "Summary mode: Messages being sent to LLM",
  "toolResults": [
    {
      "name": "fetch_emails",
      "contentLength": 18234,
      "isRedisRef": false,
      "contentPreview": "[{\"from\":\"John Smith\",\"subject\":\"Q3 Planning\",\"body_text\":\"Hi team...\""
    }
  ]
}
{
  "timestamp": "2026-01-16T08:00:01.000Z",
  "level": "info",
  "message": "🔥 Conversational stream: LLM response complete",
  "hasContent": true,
  "contentLength": 1608,
  "contentPreview": "I've fetched your most recent 3 email threads from your inbox..."
}
```

### ❌ BROKEN FLOW (BEFORE FIX)

```json
{
  "timestamp": "2026-01-16T08:00:00.000Z",
  "level": "info",
  "message": "🔄 Starting Redis hydration",
  "summaryMode": true,
  "messageCount": 4
}
{
  "timestamp": "2026-01-16T08:00:00.050Z",
  "level": "warn",
  "message": "Redis result exceeds size limit even after processing, keeping reference",
  "originalSize": 107378,
  "processedSize": 107378
}
{
  "timestamp": "2026-01-16T08:00:00.100Z",
  "level": "info",
  "message": "Summary mode: Messages being sent to LLM",
  "toolResults": [
    {
      "name": "fetch_emails",
      "contentLength": 288,
      "isRedisRef": true,
      "contentPreview": "{\"__note\":\"Full result stored in Redis\",\"__redisKey\":\"tool-result:abc123..."
    }
  ]
}
{
  "timestamp": "2026-01-16T08:00:02.000Z",
  "level": "info",
  "message": "🔥 Conversational stream: LLM response complete",
  "hasContent": true,
  "contentLength": 800,
  "contentPreview": "I've prepared a plan with placeholders for missing email data..."
}
```

---

## Troubleshooting by Log Pattern

### Issue: "Result data is not an array, cannot process"
```
⚠️ Result data is not an array, cannot process
  dataType: "object"
  dataKeys: ["data", "records", "error"]
```

**Cause:** Fetch returned wrapped response (e.g., `{ data: [...] }`)

**Fix:** Check fetch_emails implementation, may need to unwrap:
```typescript
const items = Array.isArray(result) ? result :
             Array.isArray(result.records) ? result.records :
             Array.isArray(result.data) ? result.data : [];
```

---

### Issue: "Redis key not found"
```
Redis key not found
  redisKey: "tool-result:abc123:def456"
  toolName: "fetch_emails"
```

**Cause:** Data was stored in Redis but has expired or was never stored

**Fix:** Check Redis TTL settings in ToolOrchestrator or ActionLauncherService

---

### Issue: "Could not parse result data"
```
⚠️ Could not parse result data for compression
  error: "Unexpected token..."
  resultPreview: "some garbage data"
```

**Cause:** Data in Redis is corrupted or not valid JSON

**Fix:** Clear Redis cache and re-fetch:
```bash
redis-cli KEYS "tool-result:*" | xargs redis-cli DEL
```

---

### Issue: Response Still Uses Placeholders
```
contentLength: 850
contentPreview: "I've prepared a plan with placeholder parameters..."
```

**Check:**
1. Is `isRedisRef` false in the toolResults? If true, hydration failed
2. Is `contentLength` in toolResults > 10000? If not, data wasn't sent
3. Run this command:
```bash
npm run dev 2>&1 | grep "isRedisRef" | tail -1
```

If it shows `true`, the fix didn't work. Check file modifications.

---

## Performance Baseline

### Expected Performance:
```
Hydration: < 10ms
Compression: < 5ms
LLM API call: 2-4 seconds
Total flow: 2.5-4.5 seconds
```

### If slower:
- Check Redis retrieval time in logs
- Check compression time (should be < 5ms)
- Check network latency to Groq

---

## Debugging Dashboard (JSON parsing)

```bash
# Extract just the key metrics
npm run dev 2>&1 | jq -r '
  select(
    .message | 
    contains("Compressed") or 
    contains("being sent to LLM") or 
    contains("response complete")
  ) | 
  "\(.timestamp) | \(.message) | size:\(.compressedSize // .contentLength // .size) | ref:\(.isRedisRef // "N/A")"
' 2>/dev/null
```

---

## Copy-Paste Verification Commands

### Quick Check (60 second test):
```bash
timeout 60 npm run dev 2>&1 | \
  grep -E "Compressed|isRedisRef|Calling LLM in summary|response complete" | \
  head -20
```

### Detailed Analysis (with context):
```bash
timeout 60 npm run dev 2>&1 | \
  grep -B2 -A2 "isRedisRef" | \
  head -30
```

### Just the Failed Cases:
```bash
npm run dev 2>&1 | \
  grep -E "(Redis key not found|Result data is not an array|Could not parse|exceeds size limit)"
```

---

## Success Criteria Checklist

Run this and verify all are TRUE:

```bash
npm run dev 2>&1 | tee /tmp/server.log &
# Wait 5 seconds for server to start
sleep 5
# Trigger a test request
# Then check the log:
tail -100 /tmp/server.log | grep -q "✅ Compressed" && echo "✅ Compression works" || echo "❌ No compression"
tail -100 /tmp/server.log | grep -q 'isRedisRef.*false' && echo "✅ Data sent (not ref)" || echo "❌ Reference sent"
tail -100 /tmp/server.log | grep -q 'contentLength.*[1-9][0-9]{4}' && echo "✅ Good data size" || echo "❌ Small data"
kill %1
```

---

## For Developers

If you need to add similar logging elsewhere:

```typescript
// Template for data send logging
logger.info('Sending data to LLM', {
    toolName: msg.name,
    hasRedisRef: msg.content?.includes('__redisKey'),
    contentSize: msg.content?.length,
    contentPreview: msg.content?.substring(0, 200),
    isCompressed: JSON.stringify(msg.content).length < originalSize
});
```
