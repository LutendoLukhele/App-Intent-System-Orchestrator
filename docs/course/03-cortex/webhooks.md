# 3.5 Webhook Integration

> External events → Cortex events.

---

## The Problem

External services send webhooks in their own formats:
- Nango sends sync completion notifications
- Gmail sends push notifications
- Salesforce sends outbound messages

Cortex needs uniform Events. The **EventShaper** transforms provider webhooks into Cortex Events.

---

## EventShaper

```typescript
// packages/cortex/src/EventShaper.ts

export class EventShaper {
  constructor(
    private nangoSecretKey: string,
    private redis: Redis,
    private sql: PostgresClient,
    private emit: (event: Event) => Promise<void>
  ) {}
  
  async handleWebhook(payload: NangoWebhookPayload): Promise<{ processed: number }> {
    // 1. Validate webhook signature
    if (!this.validateSignature(payload)) {
      throw new Error('Invalid webhook signature');
    }
    
    // 2. Check idempotency (prevent duplicate processing)
    const dedupeKey = `webhook:${payload.connectionId}:${payload.activityLogId}`;
    const alreadyProcessed = await this.redis.get(dedupeKey);
    if (alreadyProcessed) {
      return { processed: 0 };
    }
    
    // 3. Get userId from connectionId
    const userId = await this.getUserFromConnection(payload.connectionId);
    if (!userId) {
      console.warn(`No user found for connection: ${payload.connectionId}`);
      return { processed: 0 };
    }
    
    // 4. Shape records into events
    const events = await this.shapeRecords(payload, userId);
    
    // 5. Emit events
    for (const event of events) {
      await this.emit(event);
    }
    
    // 6. Mark as processed
    await this.redis.set(dedupeKey, '1', 'EX', 86400);  // 24h TTL
    
    return { processed: events.length };
  }
}
```

---

## Webhook Payload

Nango sends webhooks when syncs complete:

```typescript
interface NangoWebhookPayload {
  from: 'nango';
  type: 'sync' | 'auth' | 'webhook';
  connectionId: string;
  providerConfigKey: string;
  syncName: string;
  model: string;
  responseResults: {
    added: number;
    updated: number;
    deleted: number;
  };
  modifiedAfter: string;
  activityLogId: string;
}
```

---

## Shaping Records

Transform provider data into Cortex Events:

```typescript
private async shapeRecords(
  payload: NangoWebhookPayload,
  userId: string
): Promise<Event[]> {
  const events: Event[] = [];
  
  // Fetch the actual records from Nango
  const records = await this.fetchSyncedRecords(payload);
  
  for (const record of records) {
    const event = this.shapeRecord(payload, record, userId);
    if (event) {
      events.push(event);
    }
  }
  
  return events;
}

private shapeRecord(
  payload: NangoWebhookPayload,
  record: any,
  userId: string
): Event | null {
  const { model, providerConfigKey } = payload;
  
  // Route to appropriate shaper based on model
  switch (model) {
    case 'GmailThread':
      return this.shapeGmailThread(record, userId);
    
    case 'GoogleCalendarEvent':
      return this.shapeCalendarEvent(record, userId);
    
    case 'SalesforceLead':
      return this.shapeSalesforceLead(record, userId);
    
    case 'SalesforceOpportunity':
      return this.shapeSalesforceOpportunity(record, userId);
    
    default:
      console.warn(`Unknown model: ${model}`);
      return null;
  }
}
```

---

## Gmail Event Shaping

```typescript
private shapeGmailThread(record: GmailThreadRecord, userId: string): Event {
  const eventType = this.detectGmailEventType(record);
  
  return {
    id: `evt_${generateId()}`,
    source: 'gmail',
    event: eventType,
    timestamp: new Date().toISOString(),
    user_id: userId,
    payload: {
      id: record.id,
      from: record.from,
      to: record.to,
      subject: record.subject,
      body_text: record.messages?.[0]?.body_text || '',
      body_html: record.messages?.[0]?.body_html || '',
      snippet: record.snippet,
      labels: record.labels,
      hasAttachment: record.hasAttachment,
      date: record.date
    },
    meta: {
      dedupe_key: `gmail:${record.id}:${record.historyId}`
    }
  };
}

private detectGmailEventType(record: GmailThreadRecord): string {
  // Check labels and metadata to determine event type
  if (record.labels.includes('SENT')) {
    return 'email_sent';
  }
  
  if (record._nango_metadata?.action === 'ADDED') {
    // Check if it's a reply
    if (record.messages?.length > 1) {
      return 'email_reply_received';
    }
    return 'email_received';
  }
  
  return 'email_updated';
}
```

---

## Salesforce Event Shaping

```typescript
private shapeSalesforceOpportunity(
  record: SalesforceOpportunityRecord,
  userId: string
): Event {
  const eventType = this.detectOpportunityEventType(record);
  
  return {
    id: `evt_${generateId()}`,
    source: 'salesforce',
    event: eventType,
    timestamp: new Date().toISOString(),
    user_id: userId,
    payload: {
      id: record.Id,
      name: record.Name,
      amount: record.Amount,
      stage: record.StageName,
      close_date: record.CloseDate,
      account_name: record.Account?.Name,
      owner_email: record.Owner?.Email,
      probability: record.Probability,
      old_stage: record._nango_metadata?.previous?.StageName
    },
    meta: {
      dedupe_key: `sf:opp:${record.Id}:${record.LastModifiedDate}`
    }
  };
}

private detectOpportunityEventType(record: SalesforceOpportunityRecord): string {
  const metadata = record._nango_metadata;
  
  if (metadata?.action === 'ADDED') {
    return 'opportunity_created';
  }
  
  // Check for stage changes
  if (metadata?.previous?.StageName !== record.StageName) {
    if (record.StageName === 'Closed Won') {
      return 'opportunity_closed_won';
    }
    if (record.StageName === 'Closed Lost') {
      return 'opportunity_closed_lost';
    }
    return 'opportunity_stage_changed';
  }
  
  return 'opportunity_updated';
}
```

---

## Calendar Event Shaping

```typescript
private shapeCalendarEvent(
  record: GoogleCalendarEventRecord,
  userId: string
): Event {
  const eventType = this.detectCalendarEventType(record);
  
  return {
    id: `evt_${generateId()}`,
    source: 'google-calendar',
    event: eventType,
    timestamp: new Date().toISOString(),
    user_id: userId,
    payload: {
      id: record.id,
      title: record.summary,
      description: record.description,
      start: record.start?.dateTime || record.start?.date,
      end: record.end?.dateTime || record.end?.date,
      location: record.location,
      attendees: record.attendees?.map(a => ({
        email: a.email,
        name: a.displayName,
        response: a.responseStatus
      })),
      organizer: record.organizer?.email,
      status: record.status
    }
  };
}

private detectCalendarEventType(record: GoogleCalendarEventRecord): string {
  const metadata = record._nango_metadata;
  
  if (metadata?.action === 'ADDED') {
    return 'event_created';
  }
  
  if (metadata?.action === 'DELETED') {
    return 'event_cancelled';
  }
  
  return 'event_updated';
}
```

---

## Event Starting Detection

For "event about to start" notifications, we need a different approach:

```typescript
// Scheduler checks upcoming events
async checkUpcomingEvents(): Promise<void> {
  const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000);
  
  // Query calendar events starting soon
  const upcomingEvents = await this.sql`
    SELECT * FROM cached_calendar_events
    WHERE start_time > NOW()
    AND start_time <= ${fifteenMinutesFromNow}
    AND notified = false
  `;
  
  for (const event of upcomingEvents) {
    await this.emit({
      id: `evt_${generateId()}`,
      source: 'google-calendar',
      event: 'event_starting',
      timestamp: new Date().toISOString(),
      user_id: event.user_id,
      payload: {
        id: event.external_id,
        title: event.title,
        start: event.start_time,
        location: event.location,
        minutes_until: Math.floor((new Date(event.start_time).getTime() - Date.now()) / 60000)
      }
    });
    
    // Mark as notified
    await this.sql`UPDATE cached_calendar_events SET notified = true WHERE id = ${event.id}`;
  }
}
```

---

## Webhook Endpoint

The Express route that receives webhooks:

```typescript
// src/routes/webhooks.ts

router.post('/webhooks/nango', async (req, res) => {
  try {
    const result = await eventShaper.handleWebhook(req.body);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## The Full Flow

```
┌─────────────────────┐
│    Nango Sync       │
│   (background)      │
└──────────┬──────────┘
           │ Syncs Gmail threads
           ▼
┌─────────────────────┐
│  Nango Webhook      │
│  POST /webhooks/    │
│  {model: 'Gmail...'}│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    EventShaper      │
│                     │
│  1. Validate        │
│  2. Dedupe check    │
│  3. Get userId      │
│  4. Fetch records   │
│  5. Shape → Events  │
│  6. Emit            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Matcher        │
│  Find matching      │
│  Units, create Runs │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Runtime        │
│  Execute actions    │
└─────────────────────┘
```

---

## Idempotency

Webhooks can be delivered multiple times. We prevent duplicate processing:

```typescript
// Check before processing
const dedupeKey = `webhook:${payload.connectionId}:${payload.activityLogId}`;
if (await this.redis.exists(dedupeKey)) {
  return { processed: 0 };  // Already processed
}

// Mark after processing
await this.redis.set(dedupeKey, '1', 'EX', 86400);
```

Also at the event level:
```typescript
// In HybridStore.writeEvent()
async writeEvent(event: Event): Promise<boolean> {
  if (event.meta?.dedupe_key) {
    const exists = await this.redis.exists(`evt:${event.meta.dedupe_key}`);
    if (exists) {
      return false;  // Duplicate
    }
    await this.redis.set(`evt:${event.meta.dedupe_key}`, '1', 'EX', 604800);  // 7 days
  }
  
  // Write event...
  return true;
}
```

---

## Exercise

1. Write a shaper for Slack messages:
   - Input: Slack message record from Nango sync
   - Output: Cortex Event with `source: 'slack'`, `event: 'message_received'`

2. What event types would you support for Slack?
   - `message_received`
   - `mention_received`
   - `reaction_added`
   - Others?

3. How would you handle a "message edited" event vs "new message"?

---

*Next: [Part 5 - The Frontier: Offline-First Intent](../05-frontier/README.md)*
