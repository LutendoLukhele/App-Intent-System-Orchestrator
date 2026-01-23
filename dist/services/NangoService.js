"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NangoService = void 0;
const node_1 = require("@nangohq/node");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
const axios_1 = __importDefault(require("axios"));
const SessionAwareWarmupManager_1 = require("./SessionAwareWarmupManager");
class NangoService {
    constructor() {
        this.connectionWarmCache = new Map();
        if (!config_1.CONFIG.NANGO_SECRET_KEY) {
            throw new Error("Configuration error: NANGO_SECRET_KEY is missing.");
        }
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: { service: 'NangoService' },
            transports: [
                new winston_1.default.transports.Console(),
            ],
        });
        this.nango = new node_1.Nango({ secretKey: config_1.CONFIG.NANGO_SECRET_KEY });
        this.warmupManager = new SessionAwareWarmupManager_1.SessionAwareWarmupManager();
        this.logger.info(`NangoService initialized with SessionAwareWarmupManager.`);
    }
    async warmConnection(providerConfigKey, connectionId, force = false) {
        const cacheKey = `${providerConfigKey}:${connectionId}`;
        const lastWarmed = this.connectionWarmCache.get(cacheKey);
        const WARM_CACHE_TTL = 5 * 60 * 1000;
        if (!force && lastWarmed && (Date.now() - lastWarmed) < WARM_CACHE_TTL) {
            this.logger.debug('Connection already warm', { providerConfigKey, connectionId: '***' });
            return true;
        }
        const startTime = Date.now();
        try {
            let pingEndpoint;
            switch (providerConfigKey) {
                case 'gmail':
                case 'google':
                case 'google-mail':
                    pingEndpoint = '/gmail/v1/users/me/profile';
                    break;
                case 'google-calendar':
                    pingEndpoint = '/calendar/v3/users/me/calendarList';
                    break;
                case 'salesforce':
                case 'salesforce-2':
                case 'salesforce-ybzg':
                    pingEndpoint = '/services/data/v60.0/sobjects';
                    break;
                case 'outlook':
                    pingEndpoint = '/me';
                    break;
                case 'notion':
                    pingEndpoint = '/v1/users/me';
                    break;
                default:
                    pingEndpoint = '/';
            }
            try {
                await this.nango.get({ endpoint: pingEndpoint, connectionId, providerConfigKey });
            }
            catch (sdkErr) {
                this.logger.debug('Nango SDK ping failed; attempting lightweight action trigger', { providerConfigKey });
                await axios_1.default.post('https://api.nango.dev/action/trigger', { action_name: 'ping', input: {} }, {
                    headers: {
                        'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                        'Provider-Config-Key': providerConfigKey,
                        'Connection-Id': connectionId,
                        'Content-Type': 'application/json'
                    }
                }).catch(() => {
                });
            }
            const duration = Date.now() - startTime;
            this.connectionWarmCache.set(cacheKey, Date.now());
            this.logger.info('Connection warmed successfully', {
                providerConfigKey,
                connectionId: '***',
                duration
            });
            return true;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.warn('Connection warm failed', {
                providerConfigKey,
                connectionId: '***',
                duration,
                error: error.message
            });
            return false;
        }
    }
    async triggerGenericNangoAction(providerConfigKey, connectionId, actionName, actionPayload) {
        this.logger.info('Triggering generic Nango action via direct API', { providerConfigKey, actionName });
        try {
            const response = await axios_1.default.post('https://api.nango.dev/action/trigger', {
                action_name: actionName,
                input: actionPayload
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                }
            });
            this.logger.info('Nango direct API call successful', { actionName });
            return response.data;
        }
        catch (error) {
            this.logger.error('Generic Nango action failed', {
                error: error.response?.data?.message || error.message,
                actionName,
            });
            const enhancedError = new Error(error.response?.data?.message || `Request failed with status code ${error.response?.status}`);
            enhancedError.nangoErrorDetails = {
                actionName,
                statusCode: error.response?.status,
                nangoPayload: error.response?.data || null,
                timestamp: new Date().toISOString()
            };
            throw enhancedError;
        }
    }
    async triggerSalesforceAction(providerConfigKey, connectionId, actionPayload) {
        let actionName;
        switch (actionPayload.operation) {
            case 'fetch':
                actionName = 'salesforce-fetch-entity';
                break;
            case 'create':
                actionName = 'salesforce-create-entity';
                break;
            case 'update':
                actionName = 'salesforce-update-entity';
                break;
            default:
                const msg = `Unsupported Salesforce operation: ${actionPayload.operation}`;
                this.logger.error(msg, { actionPayload });
                throw new Error(msg);
        }
        this.logger.info('Triggering Salesforce action via Nango action trigger', {
            actionName,
            input: actionPayload
        });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            console.log("🔥 FINAL TOOL PAYLOAD SENT TO NANGO:", JSON.stringify(actionPayload, null, 2));
            const response = await axios_1.default.post('https://api.nango.dev/action/trigger', {
                action_name: actionName,
                input: actionPayload
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                }
            });
            this.logger.info('Salesforce action executed successfully', { actionName });
            return response.data;
        }
        catch (error) {
            this.logger.error('Salesforce action failed', {
                error: error.response?.data || error.message,
                actionName
            });
            const enhancedError = new Error(error.response?.data?.message || `Request failed for '${actionName}' with status code ${error.response?.status}`);
            enhancedError.nangoErrorDetails = {
                actionName,
                statusCode: error.response?.status,
                nangoPayload: error.response?.data || null,
                timestamp: new Date().toISOString()
            };
            throw enhancedError;
        }
    }
    async sendEmail(providerConfigKey, connectionId, payload) {
        const actionName = 'send-email';
        this.logger.info('🔥 sendEmail raw payload', {
            payloadKeys: Object.keys(payload || {}),
            hasInput: !!payload?.input,
            inputKeys: payload?.input ? Object.keys(payload.input) : [],
            rawPayload: JSON.stringify(payload).substring(0, 500)
        });
        const emailPayload = payload?.input || payload;
        this.logger.info('Sending email via Nango action trigger', {
            actionName,
            to: emailPayload?.to,
            subject: emailPayload?.subject,
            hasTo: !!emailPayload?.to,
            emailPayloadKeys: Object.keys(emailPayload || {})
        });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await axios_1.default.post('https://api.nango.dev/action/trigger', {
                action_name: actionName,
                input: emailPayload
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                }
            });
            this.logger.info('Nango send email action successful', {
                id: response.data?.id,
                threadId: response.data?.threadId
            });
            return response.data;
        }
        catch (error) {
            this.logger.error('Nango send email action failed', {
                error: error.response?.data || error.message,
            });
            throw new Error(error.response?.data?.message || `Send email failed with status ${error.response?.status}`);
        }
    }
    async fetchEmails(providerConfigKey, connectionId, input) {
        const actionName = 'fetch-emails';
        this.logger.info('Fetching emails via Nango action trigger', { actionName, input });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await axios_1.default.post('https://api.nango.dev/action/trigger', {
                action_name: actionName,
                input: input
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                }
            });
            const responseData = response.data;
            const emailCount = Array.isArray(responseData) ? responseData.length :
                responseData?.data && Array.isArray(responseData.data) ? responseData.data.length : 1;
            const responseSize = JSON.stringify(responseData).length;
            this.logger.info('Nango fetch-emails call successful', {
                actionName,
                emailCount,
                responseSizeBytes: responseSize,
                note: 'Email bodies excluded from logs for brevity'
            });
            return responseData;
        }
        catch (error) {
            this.logger.error('Nango direct API call to fetch-emails failed', {
                error: error.response?.data || error.message,
                actionName
            });
            const enhancedError = new Error(error.response?.data?.message || `Request failed for '${actionName}' with status code ${error.response?.status}`);
            enhancedError.nangoErrorDetails = {
                actionName,
                statusCode: error.response?.status,
                nangoPayload: error.response?.data || null,
                timestamp: new Date().toISOString()
            };
            throw enhancedError;
        }
    }
    async fetchCalendarEvents(providerConfigKey, connectionId, args) {
        const actionName = 'fetch-events';
        this.logger.info('Fetching calendar events via Nango', { actionName, args });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await this.nango.triggerAction(providerConfigKey, connectionId, actionName, args);
            return response;
        }
        catch (error) {
            this.logger.error('Failed to fetch calendar events', { error: error.message || error });
            throw error;
        }
    }
    async createCalendarEvent(providerConfigKey, connectionId, args) {
        const actionName = 'create-event';
        this.logger.info('Creating calendar event via Nango', { actionName });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await this.nango.triggerAction(providerConfigKey, connectionId, actionName, args);
            return response;
        }
        catch (error) {
            this.logger.error('Failed to create calendar event', { error: error.message || error });
            throw error;
        }
    }
    async updateCalendarEvent(providerConfigKey, connectionId, args) {
        const actionName = 'update-event';
        this.logger.info('Updating calendar event via Nango', { actionName });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await this.nango.triggerAction(providerConfigKey, connectionId, actionName, args);
            return response;
        }
        catch (error) {
            this.logger.error('Failed to update calendar event', { error: error.message || error });
            throw error;
        }
    }
    async fetchFromCache(provider, connectionId, model, options) {
        try {
            const params = { model };
            if (options?.limit) {
                params.limit = options.limit;
            }
            if (options?.modifiedAfter) {
                params.modified_after = options.modifiedAfter;
            }
            if (options?.cursor) {
                params.cursor = options.cursor;
            }
            this.logger.info('🔍 [NangoService.fetchFromCache] Request details', {
                url: 'https://api.nango.dev/records',
                provider,
                connectionId: connectionId.substring(0, 12) + '...',
                params,
                headers: {
                    'Provider-Config-Key': provider,
                    'Connection-Id': connectionId.substring(0, 12) + '...'
                }
            });
            const response = await axios_1.default.get('https://api.nango.dev/records', {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': provider,
                    'Connection-Id': connectionId,
                },
                params,
            });
            this.logger.info('🔍 [NangoService.fetchFromCache] Response details', {
                statusCode: response.status,
                recordCount: response.data.records?.length || 0,
                hasNextCursor: !!response.data.next_cursor,
                responseKeys: Object.keys(response.data),
                firstRecordKeys: response.data.records?.[0] ? Object.keys(response.data.records[0]) : []
            });
            return {
                records: response.data.records || [],
                nextCursor: response.data.next_cursor,
            };
        }
        catch (error) {
            this.logger.error('fetchFromCache failed', {
                provider,
                connectionId,
                model,
                error: error.response?.data || error.message,
                statusCode: error.response?.status,
                fullError: JSON.stringify(error.response?.data).substring(0, 500)
            });
            throw new Error(`Failed to fetch from Nango cache: ${error.response?.data?.error || error.message}`);
        }
    }
    async triggerOutlookAction(providerConfigKey, connectionId, actionPayload) {
        const { operation, entityType } = actionPayload;
        let actionName;
        if (operation === 'create') {
            actionName = `outlook-create-${entityType.toLowerCase()}`;
        }
        else if (operation === 'update') {
            actionName = `outlook-update-${entityType.toLowerCase()}`;
        }
        else if (operation === 'fetch') {
            actionName = `outlook-fetch-${entityType.toLowerCase()}`;
        }
        else {
            throw new Error(`Unsupported Outlook operation: ${operation} for ${entityType}`);
        }
        this.logger.info('Triggering Outlook action via Nango', { actionName, input: actionPayload });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await axios_1.default.post('https://api.nango.dev/action/trigger', {
                action_name: actionName,
                input: actionPayload
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                }
            });
            this.logger.info('Outlook action executed successfully', { actionName });
            return response.data;
        }
        catch (error) {
            this.logger.error('Outlook action failed', {
                error: error.response?.data || error.message,
                actionName
            });
            const enhancedError = new Error(error.response?.data?.message || `Request failed for '${actionName}' with status code ${error.response?.status}`);
            enhancedError.nangoErrorDetails = {
                actionName,
                statusCode: error.response?.status,
                nangoPayload: error.response?.data || null,
                timestamp: new Date().toISOString()
            };
            throw enhancedError;
        }
    }
    async fetchOutlookEventBody(providerConfigKey, connectionId, args) {
        const actionName = 'outlook-fetch-event-body';
        this.logger.info('Fetching Outlook event body via Nango', { actionName });
        try {
            await this.warmConnection(providerConfigKey, connectionId);
            const response = await axios_1.default.post('https://api.nango.dev/action/trigger', {
                action_name: actionName,
                input: args
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            this.logger.error('Failed to fetch Outlook event body', { error: error.message || error });
            throw error;
        }
    }
    clearWarmCache(providerConfigKey, connectionId) {
        if (providerConfigKey && connectionId) {
            const cacheKey = `${providerConfigKey}:${connectionId}`;
            this.connectionWarmCache.delete(cacheKey);
            this.logger.info('Cleared warm cache for specific connection', { providerConfigKey, connectionId: '***' });
        }
        else {
            this.connectionWarmCache.clear();
            this.logger.info('Cleared all warm cache entries');
        }
    }
    getConnectionHealth() {
        return {
            totalConnections: this.connectionWarmCache.size,
            cacheSize: this.connectionWarmCache.size
        };
    }
    async triggerSync(provider, connectionId, syncName) {
        try {
            await axios_1.default.post('https://api.nango.dev/sync/trigger', { syncs: [syncName] }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': provider,
                    'Connection-Id': connectionId,
                    'Content-Type': 'application/json'
                },
            });
            return { success: true };
        }
        catch (error) {
            this.logger.error('triggerSync failed', {
                provider,
                connectionId,
                syncName,
                error: error.response?.data || error.message,
            });
            throw new Error(`Failed to trigger Nango sync: ${error.response?.data?.error || error.message}`);
        }
    }
    getWarmupManager() {
        return this.warmupManager;
    }
    async triggerNangoWarmupAction(providerConfigKey, connectionId) {
        try {
            await axios_1.default.get('https://api.nango.dev/v1/whoami', {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId,
                },
                timeout: 5000,
            });
            this.logger.debug('Nango whoami warmup executed', {
                providerConfigKey,
                connectionId: '***',
            });
        }
        catch (error) {
            this.logger.warn('Nango whoami warmup failed (non-critical)', {
                providerConfigKey,
                error: error.message,
                connectionId: '***',
            });
            throw error;
        }
    }
    async warmupGoogle(connectionId, providerConfigKey = 'google') {
        await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
    }
    async warmupGoogleCalendar(connectionId, providerConfigKey = 'google-calendar') {
        await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
    }
    async warmupOutlook(connectionId, providerConfigKey = 'outlook') {
        await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
    }
    async warmupSalesforce(connectionId, providerConfigKey = 'salesforce') {
        await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
    }
    async warmupNotion(connectionId, providerConfigKey = 'notion') {
        await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
    }
    async warmupSlack(connectionId, providerConfigKey = 'slack') {
        await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
    }
}
exports.NangoService = NangoService;
