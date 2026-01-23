# CRM Entity Caching & Deduplication Implementation Guide

## Overview

Implemented a session-scoped caching system that allows email, Salesforce records, and other CRM entities to persist across conversation turns without refetching. This significantly improves:

- **User Experience**: Follow-up questions about previously fetched emails work instantly without re-running searches
- **API Efficiency**: Eliminates redundant fetch_emails/fetch_entity calls when users ask for the same data
- **Token Management**: Smart body cleaning preserves human-readable content only (5KB per entity)
- **Broad CRM Support**: Works with Email (Gmail/Nango) and Salesforce records

## Architecture

### Three Core Services

#### 1. **CRMEntityCacheService** (`src/services/data/CRMEntityCacheService.ts`)

Manages entity bodies with session-level persistence.

**Key Features:**
- 24-hour TTL for entity caching (survives entire conversation)
- Automatic HTML stripping and body cleaning
- 5KB per-entity size cap (smart truncation)
- Support for emails, contacts, deals, accounts, leads
- Batch operations for efficiency

**Usage:**
```typescript
// Cache an entity after fetching
await entityCache.cacheEntity(sessionId, {
  id: email.id,
  type: 'email',
  provider: 'gmail',
  from: email.from,
  subject: email.subject,
  cleanBody: extractedText,  // HTML stripped, 5KB max
  bodyHash: md5(text),
  metadata: { labels, timestamps, etc },
  sessionId,
});

// Retrieve later
const cached = await entityCache.getEntity(sessionId, emailId);
```

#### 2. **ToolExecutionDeduplicationService** (`src/services/tool/ToolExecutionDeduplicationService.ts`)

Detects and prevents redundant tool executions.

**Key Features:**
- Hashes fetch request (tool name + filters) for comparison
- Checks if exact same fetch done in past hour
- Returns cached entity IDs if duplicate found
- Records fetch results for future dedup

**How It Works:**
```
Turn 1: User → "Show emails from Sarah"
  └─ fetch_emails executed
  └─ Results cached, dedup record stored (TTL: 1h)

Turn 2: User → "Show recent emails from Sarah"
  └─ Dedup check: Hash matches!
  └─ Returns cached entity IDs (silent reuse)
  └─ No Nango API call made
```

#### 3. **Enhanced ToolOrchestrator** (modified `src/services/tool/ToolOrchestrator.ts`)

Integrated dedup and caching into the execution pipeline.

**Pipeline:**
```
1. Dedup Check: Is this fetch already cached? (1h window)
   → If yes: Return cached IDs (silent reuse)
   → If no: Proceed to execution

2. Execute: Call Nango/Salesforce API, get fresh data

3. Normalize: Clean bodies, cap sizes, remove HTML

4. Cache Bodies: Store cleaned text (5KB max) in Redis (24h)

5. Record Fetch: Save dedup metadata (1h TTL) for next request

6. Return Result: Send normalized data to conversation
```

## Implementation Details

### Caching Strategy: Option C (Hybrid)

**Fetch Result Cache (Dedup):** 1 hour TTL
- Used for: "Did we already fetch this in the last hour?"
- Detects: Tool name + provider + filters match

**Entity Body Cache:** 24 hour TTL  
- Used for: Access full email bodies across conversation turns
- Stores: Human-readable text only (HTML stripped)
- Survives: Entire conversation session

**Timeline Example:**
```
0:00  → User: "Show emails from John"
         fetch_emails executed, bodies cached (24h)
         dedup record created (1h)

0:30  → User: "What did John say about Q3?"
         Dedup check: Different request (no "from" filter)
         BUT: Can retrieve John's emails from entity cache
         LLM can analyze full bodies

1:05  → User: "Show emails from John again"
         Dedup check: EXPIRED (>1h)
         Refetch triggered (safe)

12:00 → Same day, new turn
        Entity cache STILL valid (24h)
        Can reference John's emails without refetch
```

### Token Budget: Option A (Smart Cleaning)

**Strategy:** Keep 5 recent emails in hydrated context, preserve bodies for human-readable text only.

**What Gets Cleaned:**
```
REMOVED:
- body_html (verbose HTML markup)
- headers (unless key metadata)
- attachments metadata (just flags if present)
- excessive whitespace and line breaks

PRESERVED:
- body_text (human-readable, 5KB max)
- from, to, subject, timestamp
- labels, isRead, hasAttachments flags
- metadata needed for sorting/filtering
```

**Example Result:**
```json
{
  "from": "john@company.com",
  "subject": "Q3 Planning Discussion",
  "body_text": "Hi team,\n\nHere's the Q3 roadmap...[5KB of clean text]",
  "_body_truncated": true,
  "_original_body_length": 12500,
  "labels": ["INBOX", "IMPORTANT"],
  "isRead": false
}
```

### Silent Reuse: Option 3

When dedup detects a cached fetch:
- **No notification** to user
- Results transparently reused
- Conversation continues naturally
- User never sees "Using cached result from..."

**Why:** Reduces verbosity, feels natural, improves UX.

## Integration Points

### 1. Within ToolOrchestrator.executeTool()

```typescript
// STEP 1: Check for duplicates
const cachedEntityIds = await this.deduplicationService.checkForDuplicate(
  sessionId,
  { toolName, provider, arguments: originalArgs }
);

if (cachedEntityIds) {
  return { status: 'success', data: { _deduped: true, ...} };
}

// STEP 2: Execute normally
const result = await executeCacheTool(toolCall);

// STEP 3: Cache the results
await this._cacheEntityResults(sessionId, toolName, originalArgs, result);

// STEP 4: Record for dedup
await this.deduplicationService.recordExecution(
  sessionId,
  { toolName, provider, arguments },
  entityIds
);
```

### 2. In FollowUpService

Already retrieves from Redis:
```typescript
// Get full result from Redis if available
const storedResult = await this.redis.get(resultData.__redisKey);
if (storedResult) {
  resultData = JSON.parse(storedResult);
}
```

### 3. SessionId Flow

Must be passed through conversation → tool execution → orchestrator:

```typescript
// WebSocket handler
const sessionId = session.id;

// ConversationService.processMessage()
await this.runConversationalStream(
  userMessage,
  sessionId,  // Pass here
  ...
);

// ToolOrchestrator.executeTool()
async executeTool(toolCall, planId, stepId, sessionId) {
  const cached = await this.deduplicationService.checkForDuplicate(sessionId, ...);
}
```

## Usage Examples

### Example 1: Email Follow-Up

```
Turn 1:
User: "Show me emails from Sarah"
System: fetch_emails(from: "sarah@...")
        → 15 emails cached with clean bodies
        → Dedup record created

Turn 2:
User: "What project did Sarah mention?"
System: Already have email bodies in cache
        → LLM analyzes cached bodies
        → Answers question (no refetch)

Turn 3: (30 minutes later)
User: "Show emails from Sarah one more time"
System: Dedup check hits! Same request within 1h
        → Returns cached IDs silently
        → User gets instant response
```

### Example 2: Salesforce Record Updates

```
Turn 1:
User: "Show me high-value deals"
System: fetch_entities(type: deal, filter: amount > $100k)
        → 8 deals cached
        → Bodies (descriptions) preserved for context

Turn 2:
User: "Tell me about the largest deal"
System: Can reference cached deal bodies
        → LLM provides details
        → No re-fetch needed

Turn 4: (2 hours later)
User: "Show high-value deals again"
System: Entity cache still valid (24h)
        → Can use bodies, OR
        → Dedup expired, refetch to get latest (fresh data)
```

## Configuration

### TTL Values (Configurable in CRMEntityCacheService)

```typescript
// In CRMEntityCacheService constructor
private readonly ENTITY_CACHE_TTL = 24 * 60 * 60;      // 24 hours
private readonly FETCH_RESULT_TTL = 60 * 60;            // 1 hour (dedup)
private readonly MAX_CLEAN_BODY_SIZE = 5 * 1024;        // 5KB per entity
private readonly MAX_EMAILS_IN_HYDRATED_CONTEXT = 5;    // Keep 5 recent
```

To adjust (e.g., for testing):
```typescript
private readonly ENTITY_CACHE_TTL = 2 * 60 * 60;  // 2 hours instead of 24
```

### Dedup Comparison Logic (Customizable)

In `ToolExecutionDeduplicationService.extractFilters()`:

Currently deduplicates on:
- For emails: `from`, `to`, `subject`, `labels`, `dateRange`, `limit`
- For CRM: `entityType`, `filters`, `limit`

To add more fields (e.g., timestamp):
```typescript
private extractFilters(toolName: string, args: any) {
  if (toolName === 'fetch_emails') {
    return {
      // ... existing fields
      dateRange: args.filters?.dateRange,
      timestamp: args.filters?.timestamp,  // Add this
    };
  }
}
```

## Monitoring & Debugging

### Logs to Watch

```
INFO: "Caching entity results"
  sessionId: xxx
  toolName: fetch_emails
  itemCount: 15

INFO: "Duplicate fetch detected and reused"
  sessionId: xxx
  toolName: fetch_emails
  cachedCount: 15

WARN: "Failed to cache entities"
  sessionId: xxx
  error: "..."
```

### Redis Keys to Inspect

```bash
# Entity cache entries
redis-cli KEYS "crm-entity:sessionId:*"

# Fetch dedup records
redis-cli KEYS "fetch-dedup:sessionId:*"

# Inspect entity
redis-cli GET "crm-entity:sessionId:email-123"

# Check TTL
redis-cli TTL "crm-entity:sessionId:email-123"
```

## Testing

### Unit Test Example

```typescript
// Test entity caching
it('caches email bodies with human-readable text only', async () => {
  const service = new CRMEntityCacheService(redis);
  
  const result = service.extractCleanBody(
    'Hi Sarah,\n\nHere is the Q3 plan...',
    '<html>...</html>',
    'email'
  );
  
  expect(result.cleanBody).not.toContain('<html>');
  expect(result.cleanBody).toContain('Q3 plan');
});

// Test deduplication
it('detects duplicate fetch requests', async () => {
  const dedup = new ToolExecutionDeduplicationService(entityCache);
  
  // First fetch
  await dedup.recordExecution(sessionId, request, ['id1', 'id2']);
  
  // Check duplicate
  const cached = await dedup.checkForDuplicate(sessionId, request);
  expect(cached).toEqual(['id1', 'id2']);
});
```

### Integration Test Example

```typescript
// Full flow: fetch, cache, reuse
it('caches and reuses email results silently', async () => {
  // Turn 1: Initial fetch
  const result1 = await orchestrator.executeTool(fetchCall, planId, stepId, sessionId);
  expect(result1.status).toBe('success');
  
  // Turn 2: Same request (should deduplicate)
  const result2 = await orchestrator.executeTool(fetchCall, planId, stepId, sessionId);
  expect(result2.data._deduped).toBe(true);
  expect(result2.data._cacheInfo).toContain('cached');
});
```

## Future Enhancements

1. **Selective Refresh**: Add "force_refresh" flag to skip dedup when user wants fresh data
   ```
   User: "Show emails from Sarah (refresh)"
   System: Skips dedup, refetches from Nango
   ```

2. **Smart Expiration**: Invalidate cache when related events occur
   ```
   If email marked as read/archived in Gmail → Invalidate cached version
   If Salesforce record updated → Invalidate cached version
   ```

3. **Cross-Session Sharing**: Allow same user across sessions to share recent caches
   ```
   User A, Session 1 → Fetches emails from Sarah
   User A, Session 2 (next day) → Can reuse from previous session
   ```

4. **Cache Analytics**: Track cache hit rate and effectiveness
   ```
   "In this session: 3 fetches, 2 were cached (66% hit rate)"
   ```

## Troubleshooting

**Issue: "Entity cache expired, can't find body"**
- Likely: Entity cache TTL (24h) expired
- Solution: Let user refetch or increase TTL in config

**Issue: "Dedup not triggering when it should"**
- Check: Are filters being compared correctly?
- Debug: Log `extractFilters()` output to see dedup key

**Issue: "Memory growing due to Redis entities"**
- Check: Entity cleanup on session end
- Consider: Reduce MAX_EMAILS_IN_HYDRATED_CONTEXT or TTL
