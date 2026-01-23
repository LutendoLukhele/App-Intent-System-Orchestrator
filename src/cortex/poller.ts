// =============================================================================
// cortex/poller.ts — Poll providers via Nango and emit events
// =============================================================================

import Redis from 'ioredis';
import { NeonQueryFunction } from '@neondatabase/serverless';
import { Event } from './types';

export interface Logger {
  info(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
}

export interface NangoServiceClient {
  fetchData(connectionId: string, resource: string): Promise<any>;
}

export type EventProcessor = (event: Event) => Promise<void>;

const SALESFORCE_PROVIDER_KEYS = new Set(['salesforce-ybzg', 'salesforce-2', 'salesforce']);
const SALESFORCE_PROVIDER_CONFIG = {
  resource: 'leads',
  eventMap: {
    'created': 'lead_created',
    'stage_changed': 'lead_stage_changed',
    'converted': 'lead_converted',
  },
};

/**
 * Poller: Continuously fetch events from connected providers via Nango
 * and trigger the event processor
 */
export class Poller {
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  
  private providerConfigs: Record<string, { resource: string; eventMap: Record<string, string> }> = {
    'google-mail': {
      resource: 'emails',
      eventMap: {
        'from_me': 'email_sent',
        'not_from_me': 'email_received',
        'in_reply_to': 'email_reply_received',
      },
    },
    'google-calendar': {
      resource: 'events',
      eventMap: {
        'created': 'event_created',
        'updated': 'event_updated',
        'deleted': 'event_deleted',
        'starting': 'event_starting',
      },
    },
    'salesforce-ybzg': SALESFORCE_PROVIDER_CONFIG,
    'salesforce-2': SALESFORCE_PROVIDER_CONFIG,
    'salesforce': SALESFORCE_PROVIDER_CONFIG,
  };
  
  constructor(
    private redis: Redis,
    private sql: NeonQueryFunction<false, false>,
    private nangoService: NangoServiceClient,
    private processEvent: EventProcessor,
    private logger: Logger
  ) {}
  
  start(intervalMs: number = 60_000): void {
    if (this.running) return;
    this.running = true;
    
    this.logger.info('Poller started', { intervalMs });
    
    // Run immediately
    this.poll().catch(err => {
      this.logger.error('Poll error', { error: err.message });
    });
    
    // Then run on interval
    this.interval = setInterval(() => {
      this.poll().catch(err => {
        this.logger.error('Poll error', { error: err.message });
      });
    }, intervalMs);
  }
  
  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.running = false;
    this.logger.info('Poller stopped');
  }
  
  private async poll(): Promise<void> {
    // Get all enabled connections
    const connections = await this.sql`
      SELECT id, user_id, provider, connection_id FROM connections 
      WHERE enabled = true
    `;
    
    for (const conn of connections) {
      try {
        await this.pollProvider(conn.user_id, conn.provider, conn.connection_id);
        
        // Update last_poll_at
        await this.sql`
          UPDATE connections 
          SET last_poll_at = NOW(), error_count = 0, last_error = NULL 
          WHERE id = ${conn.id}
        `;
      } catch (err: any) {
        this.logger.error('Provider poll failed', {
          provider: conn.provider,
          user_id: conn.user_id,
          error: err.message,
        });
        
        // Increment error count
        await this.sql`
          UPDATE connections 
          SET error_count = error_count + 1, last_error = ${err.message}
          WHERE id = ${conn.id}
        `;
        
        // Disable if too many errors
        const result = await this.sql`SELECT error_count FROM connections WHERE id = ${conn.id}`;
        if (result[0]?.error_count > 10) {
          await this.sql`UPDATE connections SET enabled = false WHERE id = ${conn.id}`;
          this.logger.error('Connection disabled due to too many errors', { connection_id: conn.id });
        }
      }
    }
  }
  
  private async pollProvider(userId: string, provider: string, connectionId: string): Promise<void> {
    const config = this.providerConfigs[provider];
    if (!config) {
      this.logger.error('Unknown provider', { provider });
      return;
    }
    
    // Get last sync state
    const state = await this.redis.get(`poller:${provider}:${userId}`);
    const lastSyncTime = state ? JSON.parse(state).lastSyncTime : new Date(Date.now() - 3600000).toISOString();
    
    // Fetch data from Nango
    const data = await this.nangoService.fetchData(connectionId, config.resource);
    
    // Transform into events
    const newEvents: Event[] = [];
    
    if (Array.isArray(data)) {
      for (const item of data) {
        const itemTime = item.created_at || item.updated_at || new Date().toISOString();
        
        // Only process items updated since last sync
        if (new Date(itemTime) <= new Date(lastSyncTime)) continue;
        
        // Determine event type
        let eventType = 'unknown';
        if (provider === 'google-mail') {
          eventType = this.detectGmailEvent(item);
        } else if (provider === 'google-calendar') {
          eventType = item.status === 'cancelled' ? 'event_deleted' : item.updated_at !== item.created_at ? 'event_updated' : 'event_created';
        } else if (SALESFORCE_PROVIDER_KEYS.has(provider)) {
          eventType = this.detectSalesforceEvent(item);
        }
        
        const event: Event = {
          id: `${provider}_${item.id}_${Date.now()}`,
          source: this.mapProviderSource(provider),
          event: eventType,
          timestamp: itemTime,
          user_id: userId,
          payload: item,
          meta: {
            dedupe_key: `${provider}:${item.id}:${itemTime}`,
          },
        };
        
        newEvents.push(event);
      }
    }
    
    // Process events
    for (const event of newEvents) {
      await this.processEvent(event);
    }
    
    // Update sync state
    await this.redis.set(
      `poller:${provider}:${userId}`,
      JSON.stringify({ lastSyncTime: new Date().toISOString(), count: newEvents.length })
    );
    
    this.logger.info('Provider polled', {
      provider,
      user_id: userId,
      events: newEvents.length,
    });
  }
  
  private detectGmailEvent(item: any): string {
    if (item.from_me) return 'email_sent';
    if (item.in_reply_to) return 'email_reply_received';
    return 'email_received';
  }
  
  private detectSalesforceEvent(item: any): string {
    if (item.type === 'Lead') {
      if (item.is_converted) return 'lead_converted';
      if (item.previous_stage !== item.stage) return 'lead_stage_changed';
      return 'lead_created';
    }
    if (item.type === 'Opportunity') {
      if (item.is_closed && item.is_won) return 'opportunity_closed_won';
      if (item.is_closed) return 'opportunity_closed_lost';
      if (item.previous_amount !== item.amount) return 'opportunity_amount_changed';
      if (item.previous_stage !== item.stage) return 'opportunity_stage_changed';
      return 'opportunity_created';
    }
    return 'unknown';
  }
  
  private mapProviderSource(provider: string): 'gmail' | 'google-calendar' | 'salesforce' {
    switch (provider) {
      case 'google-mail': return 'gmail';
      case 'google-calendar': return 'google-calendar';
      case 'salesforce-2':
      case 'salesforce-ybzg':
      case 'salesforce':
        return 'salesforce';
      default: return 'gmail';
    }
  }
}
