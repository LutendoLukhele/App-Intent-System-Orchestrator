# 1.3 Provider Abstraction

> One interface to Gmail, Salesforce, Slack, and everything else.

---

## The Problem

You need to connect to:
- Gmail (OAuth, Google REST API)
- Salesforce (OAuth, different REST API)
- Slack (OAuth, yet another API)
- Google Calendar (OAuth, shared auth with Gmail, different endpoints)
- Notion (OAuth, different API shapes)

Each has:
- Different authentication flows
- Different API shapes
- Different rate limits
- Different error handling

Without abstraction:

```typescript
// ❌ Provider-specific spaghetti
if (provider === 'gmail') {
  const token = await refreshGmailToken(userId);
  return await fetch('https://gmail.googleapis.com/...', {
    headers: { Authorization: `Bearer ${token}` }
  });
} else if (provider === 'salesforce') {
  const token = await refreshSalesforceToken(userId);
  return await fetch('https://yourinstance.salesforce.com/...', {
    headers: { Authorization: `Bearer ${token}` }
  });
} else if (provider === 'slack') {
  // ... and on and on
}
```

---

## The Solution: Provider Adapters

Define a single interface that all providers implement:

```typescript
interface IProviderAdapter {
  readonly providerKey: string;   // 'google-mail', 'salesforce'
  readonly displayName: string;   // 'Gmail', 'Salesforce'
  
  // Connection management
  warmConnection(connectionId: string): Promise<boolean>;
  getConnectionStatus(connectionId: string): Promise<ConnectionInfo>;
  
  // Data operations
  fetchFromCache<T>(connectionId: string, options: FetchOptions): Promise<FetchResult<T>>;
  triggerAction<T>(connectionId: string, action: string, payload: any): Promise<ActionResult<T>>;
}
```

Now Gmail, Salesforce, Slack all look the same to your orchestration code.

---

## The Gateway Pattern

A `ProviderGateway` manages multiple adapters:

```typescript
interface IProviderGateway {
  // Adapter management
  registerAdapter(adapter: IProviderAdapter): void;
  getAdapter(providerKey: string): IProviderAdapter | undefined;
  
  // Unified operations
  warmConnection(providerKey: string, connectionId: string): Promise<boolean>;
  fetchFromCache<T>(providerKey: string, connectionId: string, options: FetchOptions): Promise<FetchResult<T>>;
  triggerAction<T>(providerKey: string, connectionId: string, action: string, payload: any): Promise<ActionResult<T>>;
  
  // Observability
  getStats(): GatewayStats;
  onEvent(listener: GatewayEventListener): () => void;
}
```

Usage:

```typescript
const gateway = new ProviderGateway();
gateway.registerAdapter(new NangoProviderAdapter('google-mail', nangoClient));
gateway.registerAdapter(new NangoProviderAdapter('salesforce', nangoClient));
gateway.registerAdapter(new NangoProviderAdapter('slack', nangoClient));

// Use uniformly
await gateway.fetchFromCache('google-mail', connectionId, { model: 'GmailThread' });
await gateway.triggerAction('salesforce', connectionId, 'create-lead', leadData);
```

---

## Connection Status

```typescript
interface ConnectionInfo {
  connected: boolean;
  lastSynced?: Date;
  error?: string;
  metadata?: {
    email?: string;        // For email providers
    instanceUrl?: string;  // For Salesforce
    workspaceName?: string;// For Slack
  };
}
```

Uniform way to check if a provider is working:

```typescript
const status = await gateway.getConnectionStatus('google-mail', connectionId);
if (!status.connected) {
  // Prompt user to reconnect
  throw new Error(`Please reconnect Gmail: ${status.error}`);
}
```

---

## Fetch Options & Results

```typescript
interface FetchOptions {
  model: string;                // 'GmailThread', 'SalesforceContact'
  limit?: number;
  cursor?: string;              // For pagination
  filter?: Record<string, any>; // Query filters
  modifiedAfter?: Date;         // Incremental sync
}

interface FetchResult<T = any> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  syncedAt: Date;
}
```

All providers return data in the same shape:

```typescript
// Gmail
const emails = await gateway.fetchFromCache('google-mail', conn, {
  model: 'GmailThread',
  limit: 10,
  filter: { from: 'john@example.com' }
});

// Salesforce - same interface!
const leads = await gateway.fetchFromCache('salesforce', conn, {
  model: 'SalesforceLead',
  limit: 10,
  filter: { status: 'Open' }
});

// Both return: { data: T[], cursor?, hasMore, syncedAt }
```

---

## Action Results

```typescript
interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```

Uniform success/failure handling:

```typescript
const result = await gateway.triggerAction('google-mail', conn, 'send-email', {
  to: 'john@example.com',
  subject: 'Hello',
  body: 'Hi John!'
});

if (!result.success) {
  // Handle uniformly
  if (result.error.code === 'AUTH_EXPIRED') {
    // Prompt reconnect
  } else if (result.error.code === 'RATE_LIMITED') {
    // Retry later
  }
}
```

---

## Error Normalization

The adapter normalizes provider-specific errors:

```typescript
async triggerAction<T>(...): Promise<ActionResult<T>> {
  try {
    const result = await this.nango.triggerAction(...);
    return { success: true, data: result };
  } catch (error: any) {
    // Normalize to ActionResult
    if (error.response?.status === 401) {
      return {
        success: false,
        error: {
          code: 'AUTH_EXPIRED',
          message: 'Please reconnect your account',
          details: { provider: this.providerKey }
        }
      };
    }
    
    if (error.response?.status === 429) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
          details: { retryAfter: error.response.headers['retry-after'] }
        }
      };
    }
    
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error.message
      }
    };
  }
}
```

Orchestration code handles uniform error types, not provider exceptions.

---

## Connection Warmup

To reduce latency, warm connections when user starts a session:

```typescript
class SessionManager {
  async warmUserConnections(userId: string): Promise<void> {
    const connections = await db.connections.find({ userId });
    
    // Warm all in parallel
    await Promise.allSettled(
      connections.map(conn =>
        this.gateway.warmConnection(conn.provider, conn.connectionId)
          .catch(e => logger.warn(`Warmup failed for ${conn.provider}`))
      )
    );
  }
}
```

When user opens the app, their provider connections are already warm.

---

## Provider Aliases

Some providers have multiple identifiers (legacy, variants):

```typescript
const PROVIDER_ALIASES: Record<string, string[]> = {
  'google-mail': ['google-mail', 'google-mail-ynxw', 'gmail'],
  'salesforce': ['salesforce', 'salesforce-ybzg', 'salesforce-2'],
  'google-calendar': ['google-calendar', 'gcal'],
};

function normalizeProvider(provider: string): string {
  for (const [canonical, aliases] of Object.entries(PROVIDER_ALIASES)) {
    if (aliases.includes(provider.toLowerCase())) {
      return canonical;
    }
  }
  return provider.toLowerCase();
}
```

This handles the reality that provider keys vary across environments.

---

## Adding a New Provider

1. **Configure in Nango** (OAuth credentials, integration ID)

2. **Register adapter**:
```typescript
gateway.registerAdapter(
  new NangoProviderAdapter('hubspot', nangoClient, {
    displayName: 'HubSpot',
    models: ['HubSpotContact', 'HubSpotDeal'],
    actions: ['create-contact', 'update-deal']
  })
);
```

3. **Add tools** that use this provider:
```json
{
  "name": "fetch_hubspot_contacts",
  "providerConfigKey": "hubspot",
  "source": "cache",
  "cache_model": "HubSpotContact"
}
```

No changes to orchestration code. The gateway handles it.

---

## Exercise

1. Look at `src/services/NangoService.ts`
2. Trace a tool execution:
   - `ToolOrchestrator.executeTool()`
   - → `NangoService.fetchFromCache()` or `.triggerAction()`
   - → Nango SDK
   - → External API

3. Think: What would change to add HubSpot?

---

*Next: [1.4 Nango Integration](./nango-integration.md)*
