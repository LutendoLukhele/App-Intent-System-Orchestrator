# 1.4 Nango Integration

> OAuth, syncs, and actions — the integration layer that makes it all work.

---

## What is Nango?

[Nango](https://www.nango.dev/) is an open-source platform for building integrations. It handles:

1. **OAuth** — Token management, refresh, secure storage
2. **Syncs** — Background jobs that pull data from APIs into a cache
3. **Actions** — On-demand API calls (mutations)
4. **Webhooks** — Receive events when external data changes

ASO uses Nango as the integration layer between tools and external APIs.

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ASO Backend                               │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  ToolOrchestrator│───▶│   NangoService   │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                              │
└───────────────────────────────────┼──────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Nango                                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    OAuth     │  │    Syncs     │  │   Actions    │          │
│  │  Management  │  │  (Workers)   │  │  (On-demand) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              Nango Records Cache (Postgres)           │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                    │                        │
                    ▼                        ▼
        ┌──────────────────┐      ┌──────────────────┐
        │   Gmail API      │      │  Salesforce API  │
        └──────────────────┘      └──────────────────┘
```

---

## NangoService

The wrapper around the Nango SDK:

```typescript
// src/services/NangoService.ts
import { Nango } from '@nangohq/node';

export class NangoService {
  private nango: Nango;
  
  constructor() {
    this.nango = new Nango({
      secretKey: process.env.NANGO_SECRET_KEY!,
      host: process.env.NANGO_HOST  // Optional: self-hosted URL
    });
  }
  
  // List records from sync cache
  async listRecords<T>(options: {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    filter?: string;
    cursor?: string;
    limit?: number;
    modifiedAfter?: string;
  }): Promise<{ records: T[]; next_cursor?: string }> {
    return await this.nango.listRecords<T>({
      providerConfigKey: options.providerConfigKey,
      connectionId: options.connectionId,
      model: options.model,
      filter: options.filter,
      cursor: options.cursor,
      limit: options.limit,
      modifiedAfter: options.modifiedAfter
    });
  }
  
  // Trigger an action (mutation)
  async triggerAction<T>(
    providerConfigKey: string,
    connectionId: string,
    actionName: string,
    input: Record<string, any>
  ): Promise<T> {
    return await this.nango.triggerAction<T>(
      providerConfigKey,
      connectionId,
      actionName,
      input
    );
  }
  
  // Direct proxy to external API
  async proxy<T>(options: {
    providerConfigKey: string;
    connectionId: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    endpoint: string;
    data?: any;
    headers?: Record<string, string>;
  }): Promise<T> {
    return await this.nango.proxy(options);
  }
  
  // Get connection details
  async getConnection(providerConfigKey: string, connectionId: string) {
    return await this.nango.getConnection(providerConfigKey, connectionId);
  }
}
```

---

## Syncs: Background Data Ingestion

Syncs are scripts that run periodically to pull data from external APIs:

```typescript
// nango-integrations/google-mail/syncs/gmail-threads.ts
import type { NangoSync, GmailThread } from '../../models';

export default async function fetchGmailThreads(nango: NangoSync) {
  // Get the last sync cursor
  const lastSyncToken = await nango.getMetadata<string>('historyId');
  
  let threads: GmailThread[] = [];
  
  if (lastSyncToken) {
    // Incremental sync - only get changes
    threads = await fetchHistoryChanges(nango, lastSyncToken);
  } else {
    // Full sync - get all threads
    threads = await fetchAllThreads(nango);
  }
  
  // Save to Nango cache
  await nango.batchSave(threads, 'GmailThread');
  
  // Store cursor for next sync
  await nango.setMetadata('historyId', threads[0]?.historyId);
}

async function fetchAllThreads(nango: NangoSync): Promise<GmailThread[]> {
  const threads: GmailThread[] = [];
  let pageToken: string | undefined;
  
  do {
    const response = await nango.proxy({
      method: 'GET',
      endpoint: '/gmail/v1/users/me/threads',
      params: { maxResults: 100, pageToken }
    });
    
    for (const thread of response.data.threads || []) {
      // Fetch full thread details
      const fullThread = await nango.proxy({
        method: 'GET',
        endpoint: `/gmail/v1/users/me/threads/${thread.id}`
      });
      
      threads.push(mapToGmailThread(fullThread.data));
    }
    
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  
  return threads;
}
```

**Key concepts:**
- `nango.proxy()` — Make authenticated API calls
- `nango.batchSave()` — Store records in cache
- `nango.getMetadata()` / `setMetadata()` — Track sync state

---

## Models: The Data Shape

Each sync defines what data it produces:

```typescript
// nango-integrations/google-mail/models.ts
export interface GmailThread {
  id: string;                  // Required: unique ID
  historyId: string;
  snippet: string;
  subject: string | null;
  from: {
    email: string;
    name: string | null;
  };
  to: string[];
  date: string;
  labels: string[];
  hasAttachment: boolean;
  messages: GmailMessage[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: { email: string; name: string | null };
  to: string[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  date: string;
}
```

These become the `cache_model` in tool configs:

```json
{
  "name": "fetch_emails",
  "source": "cache",
  "cache_model": "GmailThread"  // ← Matches model name
}
```

---

## Actions: On-Demand Mutations

Actions are scripts that execute immediately when called:

```typescript
// nango-integrations/google-mail/actions/send-email.ts
import type { NangoAction, SendEmailInput, SendEmailOutput } from '../../models';

export default async function sendEmail(
  nango: NangoAction,
  input: SendEmailInput
): Promise<SendEmailOutput> {
  const { to, subject, body, cc, replyTo } = input;
  
  // Build RFC 2822 email
  const emailLines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body
  ].filter(Boolean);
  
  const rawEmail = Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  // Send via Gmail API
  const response = await nango.proxy({
    method: 'POST',
    endpoint: '/gmail/v1/users/me/messages/send',
    data: {
      raw: rawEmail,
      threadId: replyTo  // For replies
    }
  });
  
  return {
    id: response.data.id,
    threadId: response.data.threadId,
    success: true
  };
}
```

Called from ASO:

```typescript
// In ToolOrchestrator
const result = await this.nango.triggerAction(
  'google-mail-ynxw',
  connectionId,
  'send-email',  // ← Action name
  { to, subject, body }
);
```

---

## nango.yaml: Integration Configuration

```yaml
# nango-integrations/nango.yaml
integrations:
  google-mail-ynxw:
    syncs:
      gmail-threads:
        runs: every 5m
        output: GmailThread
        endpoint: GET /gmail/threads
        description: Sync Gmail threads
        
      gmail-contacts:
        runs: every 1h
        output: GoogleContact
        endpoint: GET /contacts
        
    actions:
      send-email:
        input: SendEmailInput
        output: SendEmailOutput
        endpoint: POST /gmail/send
        
      reply-email:
        input: ReplyEmailInput
        output: SendEmailOutput
        endpoint: POST /gmail/reply
        
  salesforce-ybzg:
    syncs:
      salesforce-leads:
        runs: every 10m
        output: SalesforceLead
        track_deletes: true
        
      salesforce-opportunities:
        runs: every 10m
        output: SalesforceOpportunity
        
    actions:
      create-lead:
        input: CreateLeadInput
        output: SalesforceRecord
        
      update-opportunity:
        input: UpdateOpportunityInput
        output: SalesforceRecord
```

---

## Connection Management

Users connect via OAuth (handled by Nango):

```typescript
// Frontend: Initiate connection
const nango = new Nango({ publicKey: NANGO_PUBLIC_KEY });
await nango.auth('google-mail-ynxw', `${userId}-gmail`);

// Backend: Store connection reference
await db.connections.insert({
  userId,
  provider: 'google-mail',
  connectionId: `${userId}-gmail`,
  connectedAt: new Date()
});
```

Later, when executing tools:

```typescript
// Get user's connection ID
const connection = await db.connections.findOne({
  userId,
  provider: 'google-mail'
});

if (!connection) {
  throw new Error('Gmail not connected');
}

// Use with Nango
const emails = await nango.listRecords({
  providerConfigKey: 'google-mail-ynxw',
  connectionId: connection.connectionId,
  model: 'GmailThread'
});
```

---

## Webhooks: Real-Time Events

Nango can notify you when synced data changes:

```typescript
// Webhook handler
app.post('/webhooks/nango', async (req, res) => {
  const { connectionId, providerConfigKey, model, type, records } = req.body;
  
  if (type === 'SYNC_SUCCESS') {
    // New/updated records
    for (const record of records.added || []) {
      await processNewRecord(connectionId, model, record);
    }
    
    for (const record of records.updated || []) {
      await processUpdatedRecord(connectionId, model, record);
    }
  }
  
  res.status(200).send('OK');
});
```

This powers **Cortex** — reactive automation triggered by external events.

---

## The Full Flow

1. **User connects Gmail** → OAuth via Nango
2. **Sync runs** → Pulls threads into Nango cache
3. **User asks "show my emails"** → PlannerService generates plan
4. **ToolOrchestrator executes** → Calls `nango.listRecords('GmailThread')`
5. **Fast read from cache** → Returns to user
6. **User asks "send email to John"** → PlannerService generates plan
7. **ToolOrchestrator executes** → Calls `nango.triggerAction('send-email', {...})`
8. **Real-time API call** → Email sent via Gmail API

---

## Directory Structure

```
nango-integrations/
├── nango.yaml              # Integration config
├── models.ts               # Shared type definitions
│
├── google-mail/
│   ├── syncs/
│   │   ├── gmail-threads.ts
│   │   └── gmail-contacts.ts
│   ├── actions/
│   │   ├── send-email.ts
│   │   └── reply-email.ts
│   └── models.ts           # Gmail-specific types
│
├── salesforce/
│   ├── syncs/
│   │   ├── leads.ts
│   │   └── opportunities.ts
│   ├── actions/
│   │   ├── create-lead.ts
│   │   └── update-opportunity.ts
│   └── models.ts
│
└── google-calendar/
    ├── syncs/
    │   └── events.ts
    ├── actions/
    │   ├── create-event.ts
    │   └── update-event.ts
    └── models.ts
```

---

## Exercise

1. Look at `nango-integrations/` in the repo
2. Find a sync script and trace:
   - What API does it call?
   - What model does it produce?
   - How often does it run?

3. Find an action script and trace:
   - What input does it expect?
   - What API call does it make?
   - What does it return?

4. Find the tool in `tool-config.json` that uses this sync/action

---

*Next: [1.5 The Orchestrator](./orchestrator.md)*
