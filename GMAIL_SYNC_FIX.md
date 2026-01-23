# Gmail Sync Fix: INBOX-Only Filtering

## Problem Identified
The original sync was fetching **ALL** emails across all Gmail labels:
```typescript
q: 'after:' + sinceEpoch  // ❌ Gets everything: promotions, social, forums, etc.
```

This is why your cache tests were returning only promotional emails (ClickUp, Artlist, Codecademy, Temu).

## Solution
Update the Gmail API query to filter for INBOX emails and exclude promotional categories:

```typescript
// ✅ INBOX-FOCUSED query
q: `after:${sinceEpoch} label:INBOX -label:CATEGORY_PROMOTIONS -label:CATEGORY_SOCIAL -label:CATEGORY_FORUMS`
```

## Gmail API Query Syntax

| Query | Meaning |
|-------|---------|
| `label:INBOX` | Only INBOX emails |
| `-label:CATEGORY_PROMOTIONS` | Exclude promotions |
| `-label:CATEGORY_SOCIAL` | Exclude social |
| `-label:CATEGORY_FORUMS` | Exclude forums |
| `after:1704355800` | After this Unix timestamp |

## Implementation

### Step 1: Update Nango Dashboard
Go to **Nango Dashboard** → **Syncs** → **google-mail** → **emails.ts**

Replace line ~13:
```typescript
// ❌ Old
q: 'after:' + sinceEpoch,

// ✅ New
q: `after:${sinceEpoch} label:INBOX -label:CATEGORY_PROMOTIONS -label:CATEGORY_SOCIAL -label:CATEGORY_FORUMS`,
```

### Step 2: Trigger Fresh Sync
Once deployed, trigger a fresh sync to re-fetch emails with the new filter:

```bash
# Via API
curl -X POST http://localhost:8080/api/sync/trigger \
  -H "x-user-id: your-user-id" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google-mail-ynxw",
    "connectionId": "your-connection-id",
    "syncName": "gmail-emails"
  }'
```

Or use the Nango dashboard to manually trigger a sync.

### Step 3: Verify Results
Run the cache test again:
```bash
npx jest tests/cortex/2-cache.test.ts -t "fetchFromCache\(\) returns Gmail emails" --no-coverage
```

You should now get **actual INBOX emails** instead of promotions! ✅

## Expected Results After Fix

Instead of:
```
Email 1: ClickUp (promotion)
Email 2: Artlist (promotion)
Email 3: Codecademy (promotion)
Email 4: Temu (promotion)
Email 5: Temu (promotion)
```

You'll get:
```
Email 1: Real business email
Email 2: Real personal email
Email 3: Newsletter you subscribed to
Email 4: Real conversation
Email 5: Team message
```

## Alternative: Server-Side Filtering
If you prefer to keep the sync unchanged and filter on fetch, the server already supports this via the `filter` option:

```typescript
await nangoService.fetchFromCache(
  provider,
  connectionId,
  'GmailEmail',
  { 
    limit: 5,
    filter: {
      labels: ['INBOX'],
      excludeLabels: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL']
    }
  }
);
```

However, **sync-side filtering is preferred** because:
- ✅ Reduces data stored in cache
- ✅ Faster sync operations
- ✅ Lower Nango API costs
- ✅ Better performance for cache reads

## Sync File Reference
Updated sync file is available at:
`/nango-integrations/google-mail/syncs/emails.ts`

---

**Status**: Ready to deploy to Nango dashboard 🚀
