# Connection Registration Fix

## Problem Solved ✅

**Issue**: User signed into a new Gmail connection (`285ed357...`), but the system kept using the old expired connection (`bb40121a...`).

**Root Cause**: The new connection was never registered in the database when the user re-authenticated.

## Immediate Fix Applied

Updated the database and Redis to use the working connection:

```bash
npx ts-node scripts/update-connection.ts
```

**Results**:
- ✅ Database now points to working connection `285ed357...`
- ✅ Redis `active-connection` updated
- ✅ Connection ownership cached
- ✅ Tool caches invalidated

## Long-term Prevention

### 1. Backend Enhancement (✅ DONE)

Added **automatic connection registration** via Nango `auth` webhooks in [src/index.ts](../src/index.ts):

```typescript
} else if (payload.type === 'auth') {
  // Auto-register new connections even if frontend fails
  const cachedUserId = await redis.get(`connection-owner:${connectionId}`);
  if (cachedUserId) {
    await registerConnectionForUser(cachedUserId, providerConfigKey, connectionId);
    await userToolCacheService.invalidateUserToolCache(cachedUserId);
  }
}
```

### 2. Frontend Integration Required ⚠️

**Your frontend MUST call this endpoint after OAuth**:

```typescript
// After Nango OAuth completes
const response = await fetch('https://your-backend/api/connections', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': userId
  },
  body: JSON.stringify({
    provider: providerConfigKey,  // e.g., 'google-mail-ynxw'
    connectionId: newConnectionId // from Nango
  })
});
```

## Database Schema (Reference)

The schema ensures **one connection per user per provider**:

```sql
CREATE TABLE connections (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  UNIQUE(user_id, provider)  -- ⭐ This constraint
);
```

**ON CONFLICT behavior**:
```sql
ON CONFLICT (user_id, provider) DO UPDATE SET
  connection_id = EXCLUDED.connection_id,  -- Replaces old connection
  enabled = true,
  error_count = 0,
  last_poll_at = NOW()
```

## How It Works Now

### Scenario: User reconnects Gmail

1. **User initiates OAuth** → Nango creates new `connection_id`
2. **Nango sends auth webhook** → Backend receives `{ type: 'auth', connectionId, providerConfigKey }`
3. **Backend auto-registers** → Calls `registerConnectionForUser()`
4. **Database updates** → Old connection replaced with new one via `ON CONFLICT`
5. **Redis updated** → `active-connection:${userId}` set to new connection
6. **Cache invalidated** → User's tool cache cleared

### Fallback Protection

If webhook fails or is delayed:
- Frontend POST to `/api/connections` ensures registration
- Manual fix script available: `scripts/update-connection.ts`

## Testing

Check if a connection is properly registered:

```bash
npx ts-node -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async () => {
  const rows = await sql\`
    SELECT user_id, provider, connection_id, last_poll_at 
    FROM connections 
    WHERE user_id = '7CSWY89B4sT7nj3ixd9mvgcJPSm2'
  \`;
  console.log(rows);
})();
"
```

## Prevention Checklist

- ✅ Backend handles `auth` webhooks automatically
- ⚠️ Frontend calls `/api/connections` POST after OAuth
- ✅ Database enforces unique constraint per user+provider
- ✅ Redis caches connection ownership
- ✅ Tool caches invalidated on connection change
- ✅ Manual fix script available for emergencies

## Related Files

- [src/index.ts](../src/index.ts) - Webhook handler with auth support
- [scripts/update-connection.ts](../scripts/update-connection.ts) - Manual fix script
- [migrations/001_cortex.sql](../migrations/001_cortex.sql) - Database schema
