"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Poller = void 0;
const SALESFORCE_PROVIDER_KEYS = new Set(['salesforce-ybzg', 'salesforce-2', 'salesforce']);
const SALESFORCE_PROVIDER_CONFIG = {
    resource: 'leads',
    eventMap: {
        'created': 'lead_created',
        'stage_changed': 'lead_stage_changed',
        'converted': 'lead_converted',
    },
};
class Poller {
    constructor(redis, sql, nangoService, processEvent, logger) {
        this.redis = redis;
        this.sql = sql;
        this.nangoService = nangoService;
        this.processEvent = processEvent;
        this.logger = logger;
        this.interval = null;
        this.running = false;
        this.providerConfigs = {
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
    }
    start(intervalMs = 60000) {
        if (this.running)
            return;
        this.running = true;
        this.logger.info('Poller started', { intervalMs });
        this.poll().catch(err => {
            this.logger.error('Poll error', { error: err.message });
        });
        this.interval = setInterval(() => {
            this.poll().catch(err => {
                this.logger.error('Poll error', { error: err.message });
            });
        }, intervalMs);
    }
    stop() {
        if (this.interval)
            clearInterval(this.interval);
        this.running = false;
        this.logger.info('Poller stopped');
    }
    async poll() {
        const connections = await this.sql `
      SELECT id, user_id, provider, connection_id FROM connections 
      WHERE enabled = true
    `;
        for (const conn of connections) {
            try {
                await this.pollProvider(conn.user_id, conn.provider, conn.connection_id);
                await this.sql `
          UPDATE connections 
          SET last_poll_at = NOW(), error_count = 0, last_error = NULL 
          WHERE id = ${conn.id}
        `;
            }
            catch (err) {
                this.logger.error('Provider poll failed', {
                    provider: conn.provider,
                    user_id: conn.user_id,
                    error: err.message,
                });
                await this.sql `
          UPDATE connections 
          SET error_count = error_count + 1, last_error = ${err.message}
          WHERE id = ${conn.id}
        `;
                const result = await this.sql `SELECT error_count FROM connections WHERE id = ${conn.id}`;
                if (result[0]?.error_count > 10) {
                    await this.sql `UPDATE connections SET enabled = false WHERE id = ${conn.id}`;
                    this.logger.error('Connection disabled due to too many errors', { connection_id: conn.id });
                }
            }
        }
    }
    async pollProvider(userId, provider, connectionId) {
        const config = this.providerConfigs[provider];
        if (!config) {
            this.logger.error('Unknown provider', { provider });
            return;
        }
        const state = await this.redis.get(`poller:${provider}:${userId}`);
        const lastSyncTime = state ? JSON.parse(state).lastSyncTime : new Date(Date.now() - 3600000).toISOString();
        const data = await this.nangoService.fetchData(connectionId, config.resource);
        const newEvents = [];
        if (Array.isArray(data)) {
            for (const item of data) {
                const itemTime = item.created_at || item.updated_at || new Date().toISOString();
                if (new Date(itemTime) <= new Date(lastSyncTime))
                    continue;
                let eventType = 'unknown';
                if (provider === 'google-mail') {
                    eventType = this.detectGmailEvent(item);
                }
                else if (provider === 'google-calendar') {
                    eventType = item.status === 'cancelled' ? 'event_deleted' : item.updated_at !== item.created_at ? 'event_updated' : 'event_created';
                }
                else if (SALESFORCE_PROVIDER_KEYS.has(provider)) {
                    eventType = this.detectSalesforceEvent(item);
                }
                const event = {
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
        for (const event of newEvents) {
            await this.processEvent(event);
        }
        await this.redis.set(`poller:${provider}:${userId}`, JSON.stringify({ lastSyncTime: new Date().toISOString(), count: newEvents.length }));
        this.logger.info('Provider polled', {
            provider,
            user_id: userId,
            events: newEvents.length,
        });
    }
    detectGmailEvent(item) {
        if (item.from_me)
            return 'email_sent';
        if (item.in_reply_to)
            return 'email_reply_received';
        return 'email_received';
    }
    detectSalesforceEvent(item) {
        if (item.type === 'Lead') {
            if (item.is_converted)
                return 'lead_converted';
            if (item.previous_stage !== item.stage)
                return 'lead_stage_changed';
            return 'lead_created';
        }
        if (item.type === 'Opportunity') {
            if (item.is_closed && item.is_won)
                return 'opportunity_closed_won';
            if (item.is_closed)
                return 'opportunity_closed_lost';
            if (item.previous_amount !== item.amount)
                return 'opportunity_amount_changed';
            if (item.previous_stage !== item.stage)
                return 'opportunity_stage_changed';
            return 'opportunity_created';
        }
        return 'unknown';
    }
    mapProviderSource(provider) {
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
exports.Poller = Poller;
