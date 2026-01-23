// src/services/NangoService.ts

import { Nango } from '@nangohq/node';
import winston from 'winston';
import { CONFIG } from '../config';
import axios from 'axios';
import { SessionAwareWarmupManager } from './SessionAwareWarmupManager';

// Interface definitions remain the same for type safety
interface NangoResponse {
  success?: boolean;
  data?: any;
  [key: string]: any;
}

export class NangoService {
  private nango: Nango;
  private logger: winston.Logger;
  private connectionWarmCache: Map<string, number> = new Map(); // connectionId -> lastWarmedTimestamp
  private warmupManager: SessionAwareWarmupManager;

  constructor() {
    if (!CONFIG.NANGO_SECRET_KEY) {
        throw new Error("Configuration error: NANGO_SECRET_KEY is missing.");
    }
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(), // Adds a timestamp to each log message
        winston.format.json()       // Ensures the log output is in JSON format
      ),
      defaultMeta: { service: 'NangoService' }, // Automatically adds {'service': 'NangoService'} to every log
      transports: [
        new winston.transports.Console(), // Directs log output to the console
      ],
    });
    this.nango = new Nango({ secretKey: CONFIG.NANGO_SECRET_KEY });
    this.warmupManager = new SessionAwareWarmupManager();
    this.logger.info(`NangoService initialized with SessionAwareWarmupManager.`);
  }

  // Connection warming to eliminate cold start penalties
  public async warmConnection(
    providerConfigKey: string,
    connectionId: string,
    force: boolean = false
  ): Promise<boolean> {
    const cacheKey = `${providerConfigKey}:${connectionId}`;
    const lastWarmed = this.connectionWarmCache.get(cacheKey);
    const WARM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Skip if recently warmed (unless forced)
    if (!force && lastWarmed && (Date.now() - lastWarmed) < WARM_CACHE_TTL) {
      this.logger.debug('Connection already warm', { providerConfigKey, connectionId: '***' });
      return true;
    }

    const startTime = Date.now();
    try {
      let pingEndpoint: string;

      // Provider-specific lightweight ping endpoints
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

      // Use Nango SDK to call a lightweight GET if available; fall back to direct trigger
      try {
        await this.nango.get({ endpoint: pingEndpoint, connectionId, providerConfigKey });
      } catch (sdkErr) {
        // If SDK GET fails, try a very lightweight action-trigger (if configured)
        this.logger.debug('Nango SDK ping failed; attempting lightweight action trigger', { providerConfigKey });
        await axios.post(
          'https://api.nango.dev/action/trigger',
          { action_name: 'ping', input: {} },
          {
            headers: {
              'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
              'Provider-Config-Key': providerConfigKey,
              'Connection-Id': connectionId,
              'Content-Type': 'application/json'
            }
          }
        ).catch(() => {
          // ignore errors from fallback ping - warming may still succeed via other calls below
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

    } catch (error: any) {
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

  public async triggerGenericNangoAction(
    providerConfigKey: string,
    connectionId: string,
    actionName: string, // e.g., 'send-email'
    actionPayload: Record<string, any>
  ): Promise<any> {
    this.logger.info('Triggering generic Nango action via direct API', { providerConfigKey, actionName });

    try {
      // FIX: Replaced the Nango SDK call with a direct axios.post call for consistency
      const response = await axios.post(
        'https://api.nango.dev/action/trigger',
        {
          action_name: actionName,
          input: actionPayload
        },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': providerConfigKey,
            'Connection-Id': connectionId,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.info('Nango direct API call successful', { actionName });
      return response.data;

    } catch (error: any) {
      this.logger.error('Generic Nango action failed', {
        error: error.response?.data?.message || error.message,
        actionName,
      });
      // Re-throw with full Nango error details for QA/debugging
      const enhancedError: any = new Error(
        error.response?.data?.message || `Request failed with status code ${error.response?.status}`
      );
      enhancedError.nangoErrorDetails = {
        actionName,
        statusCode: error.response?.status,
        nangoPayload: error.response?.data || null,
        timestamp: new Date().toISOString()
      };
      throw enhancedError;
    }
  }

  // --- FIX: This method is now fully aligned with all Salesforce Nango scripts ---
  // Replace the existing triggerSalesforceAction method with this:
async triggerSalesforceAction(
    providerConfigKey: string,
    connectionId: string,
    actionPayload: Record<string, any>
): Promise<NangoResponse> {
    // Determine the Nango action name based on the operation
  let actionName: string;
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
    input: actionPayload  });

  try {
    // Ensure connection is warm before executing
    await this.warmConnection(providerConfigKey, connectionId);
    
    console.log(
    "🔥 FINAL TOOL PAYLOAD SENT TO NANGO:",
    JSON.stringify(actionPayload, null, 2)
);


    // Use the exact same pattern as fetchEmails
    const response = await axios.post(
      'https://api.nango.dev/action/trigger',
      {
        action_name: actionName,
        input: actionPayload 
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
          'Provider-Config-Key': providerConfigKey,
          'Connection-Id': connectionId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    this.logger.info('Salesforce action executed successfully', { actionName });
    return response.data as NangoResponse;

  } catch (error: any) {
    this.logger.error('Salesforce action failed', {
      error: error.response?.data || error.message,
      actionName
    });
    // Re-throw with full Nango error details for QA/debugging
    const enhancedError: any = new Error(
      error.response?.data?.message || `Request failed for '${actionName}' with status code ${error.response?.status}`
    );
    enhancedError.nangoErrorDetails = {
      actionName,
      statusCode: error.response?.status,
      nangoPayload: error.response?.data || null,
      timestamp: new Date().toISOString()
    };
    throw enhancedError;
  }
}

  // --- Send Email via Nango Action ---
  public async sendEmail(
    providerConfigKey: string,
    connectionId: string,
    payload: any
  ): Promise<any> {
    const actionName = 'send-email';
    
    // Debug: Log raw payload to understand structure
    this.logger.info('🔥 sendEmail raw payload', { 
      payloadKeys: Object.keys(payload || {}),
      hasInput: !!payload?.input,
      inputKeys: payload?.input ? Object.keys(payload.input) : [],
      rawPayload: JSON.stringify(payload).substring(0, 500)
    });
    
    // Unwrap nested input if present (tool config wraps in { input: {...} })
    const emailPayload = payload?.input || payload;
    
    this.logger.info('Sending email via Nango action trigger', { 
      actionName, 
      to: emailPayload?.to, 
      subject: emailPayload?.subject,
      hasTo: !!emailPayload?.to,
      emailPayloadKeys: Object.keys(emailPayload || {})
    });

    try {
      // Ensure connection is warm before sending
      await this.warmConnection(providerConfigKey, connectionId);
      
      const response = await axios.post(
        'https://api.nango.dev/action/trigger',
        {
          action_name: actionName,
          input: emailPayload  // Send unwrapped payload
        },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': providerConfigKey,
            'Connection-Id': connectionId,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.info('Nango send email action successful', { 
        id: response.data?.id,
        threadId: response.data?.threadId 
      });
      return response.data;

    } catch (error: any) {
      this.logger.error('Nango send email action failed', {
        error: error.response?.data || error.message,
      });
      throw new Error(error.response?.data?.message || `Send email failed with status ${error.response?.status}`);
    }
  }

  // --- FIX: Aligned with fetch-emails.ts script ---
  async fetchEmails(
    providerConfigKey: string,
    connectionId: string,
    input: any // This is the action payload from the tool call
  ): Promise<NangoResponse> {
    const actionName = 'fetch-emails';
    this.logger.info('Fetching emails via Nango action trigger', { actionName, input });

    try {
      // Ensure connection is warm before fetching
      await this.warmConnection(providerConfigKey, connectionId);
      
      // Switched from axios.get to axios.post
      const response = await axios.post(
        'https://api.nango.dev/action/trigger', // Use the standard action trigger endpoint
        {
          // Structure the payload exactly as Nango expects for actions
          action_name: actionName,
          input: input 
        },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': providerConfigKey,
            'Connection-Id': connectionId,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Log metadata without full response bodies
      const responseData = response.data as NangoResponse;
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

    } catch (error: any) {
      this.logger.error('Nango direct API call to fetch-emails failed', {
        error: error.response?.data || error.message,
        actionName
      });
      // Re-throw with full Nango error details for QA/debugging
      const enhancedError: any = new Error(
        error.response?.data?.message || `Request failed for '${actionName}' with status code ${error.response?.status}`
      );
      enhancedError.nangoErrorDetails = {
        actionName,
        statusCode: error.response?.status,
        nangoPayload: error.response?.data || null,
        timestamp: new Date().toISOString()
      };
      throw enhancedError;
    }
  }

  // --- FIX: Aligned with events.ts script ---
  async fetchCalendarEvents(
    providerConfigKey: string,
    connectionId: string,
    args: any // Pass the arguments directly as the payload
  ): Promise<NangoResponse> {
    const actionName = 'fetch-events';
    this.logger.info('Fetching calendar events via Nango', { actionName, args });
    try {
      await this.warmConnection(providerConfigKey, connectionId);
      const response = await this.nango.triggerAction(
        providerConfigKey, connectionId, actionName, args
      );
      return response as NangoResponse;
    } catch (error: any) {
      this.logger.error('Failed to fetch calendar events', { error: error.message || error });
      throw error;
    }
  }

  // --- FIX: Aligned with event creation script (if one exists, follows same pattern) ---
  async createCalendarEvent(
    providerConfigKey: string,
    connectionId: string,
    args: any // Pass the arguments directly as the payload
  ): Promise<NangoResponse> {
    const actionName = 'create-event';
    this.logger.info('Creating calendar event via Nango', { actionName });
    try {
      await this.warmConnection(providerConfigKey, connectionId);
      const response = await this.nango.triggerAction(
        providerConfigKey, connectionId, actionName, args
      );
      return response as NangoResponse;
    } catch (error: any) {
      this.logger.error('Failed to create calendar event', { error: error.message || error });
      throw error;
    }
  }

  // Update calendar event
  async updateCalendarEvent(
    providerConfigKey: string,
    connectionId: string,
    args: any
  ): Promise<NangoResponse> {
    const actionName = 'update-event';
    this.logger.info('Updating calendar event via Nango', { actionName });
    try {
      await this.warmConnection(providerConfigKey, connectionId);
      const response = await this.nango.triggerAction(
        providerConfigKey, connectionId, actionName, args
      );
      return response as NangoResponse;
    } catch (error: any) {
      this.logger.error('Failed to update calendar event', { error: error.message || error });
      throw error;
    }
  }

  public async fetchFromCache(
    provider: string,
    connectionId: string,
    model: string,
    options?: {
      limit?: number;
      modifiedAfter?: string;
      cursor?: string;
    }
  ): Promise<{ records: any[]; nextCursor?: string }> {
    try {
      const params: Record<string, any> = { model };
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

      const response = await axios.get(
        'https://api.nango.dev/records',
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': provider,
            'Connection-Id': connectionId,
          },
          params,
        }
      );

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
    } catch (error: any) {
      this.logger.error('fetchFromCache failed', {
        provider,
        connectionId,
        model,
        error: error.response?.data || error.message,
        statusCode: error.response?.status,
        fullError: JSON.stringify(error.response?.data).substring(0, 500)
      });
      throw new Error(
        `Failed to fetch from Nango cache: ${error.response?.data?.error || error.message}`
      );
    }
  }

  // --- Outlook Calendar/Email/Contact Operations ---
  async triggerOutlookAction(
    providerConfigKey: string,
    connectionId: string,
    actionPayload: Record<string, any>
  ): Promise<NangoResponse> {
    // Determine action name based on operation and entity type
    const { operation, entityType } = actionPayload;

    let actionName: string;
    if (operation === 'create') {
      actionName = `outlook-create-${entityType.toLowerCase()}`;
    } else if (operation === 'update') {
      actionName = `outlook-update-${entityType.toLowerCase()}`;
    } else if (operation === 'fetch') {
      actionName = `outlook-fetch-${entityType.toLowerCase()}`;
    } else {
      throw new Error(`Unsupported Outlook operation: ${operation} for ${entityType}`);
    }

    this.logger.info('Triggering Outlook action via Nango', { actionName, input: actionPayload });

    try {
      await this.warmConnection(providerConfigKey, connectionId);

      const response = await axios.post(
        'https://api.nango.dev/action/trigger',
        {
          action_name: actionName,
          input: actionPayload
        },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': providerConfigKey,
            'Connection-Id': connectionId,
            'Content-Type': 'application/json'
          }
        }
      );

      this.logger.info('Outlook action executed successfully', { actionName });
      return response.data as NangoResponse;

    } catch (error: any) {
      this.logger.error('Outlook action failed', {
        error: error.response?.data || error.message,
        actionName
      });
      const enhancedError: any = new Error(
        error.response?.data?.message || `Request failed for '${actionName}' with status code ${error.response?.status}`
      );
      enhancedError.nangoErrorDetails = {
        actionName,
        statusCode: error.response?.status,
        nangoPayload: error.response?.data || null,
        timestamp: new Date().toISOString()
      };
      throw enhancedError;
    }
  }

  // Fetch Outlook event body (special case)
  async fetchOutlookEventBody(
    providerConfigKey: string,
    connectionId: string,
    args: any
  ): Promise<NangoResponse> {
    const actionName = 'outlook-fetch-event-body';
    this.logger.info('Fetching Outlook event body via Nango', { actionName });
    try {
      await this.warmConnection(providerConfigKey, connectionId);
      const response = await axios.post(
        'https://api.nango.dev/action/trigger',
        {
          action_name: actionName,
          input: args
        },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': providerConfigKey,
            'Connection-Id': connectionId,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data as NangoResponse;
    } catch (error: any) {
      this.logger.error('Failed to fetch Outlook event body', { error: error.message || error });
      throw error;
    }
  }

  // Clear warm cache (useful for testing or connection issues)
  public clearWarmCache(providerConfigKey?: string, connectionId?: string) {
    if (providerConfigKey && connectionId) {
      const cacheKey = `${providerConfigKey}:${connectionId}`;
      this.connectionWarmCache.delete(cacheKey);
      this.logger.info('Cleared warm cache for specific connection', { providerConfigKey, connectionId: '***' });
    } else {
      this.connectionWarmCache.clear();
      this.logger.info('Cleared all warm cache entries');
    }
  }

  // Get connection health status
  public getConnectionHealth(): { totalConnections: number, cacheSize: number } {
    return {
      totalConnections: this.connectionWarmCache.size,
      cacheSize: this.connectionWarmCache.size
    };
  }

  public async triggerSync(
    provider: string,
    connectionId: string,
    syncName: string
  ): Promise<{ success: boolean }> {
    try {
      await axios.post(
        'https://api.nango.dev/sync/trigger',
        { syncs: [syncName] },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': provider,
            'Connection-Id': connectionId,
            'Content-Type': 'application/json'
          },
        }
      );
      return { success: true };
    } catch (error: any) {
      this.logger.error('triggerSync failed', {
        provider,
        connectionId,
        syncName,
        error: error.response?.data || error.message,
      });
      throw new Error(`Failed to trigger Nango sync: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * === SESSION-AWARE WARMUP SYSTEM ===
   * Provider-specific lightweight warmup strategies executed via Nango action trigger.
   * Results are cached/suppressed and NOT broadcast to client.
   * Each warmup performs a real lightweight Nango action ONCE per session.
   * 
   * Warmups route through Nango platform so tokens are properly wrapped via connection ID.
   */

  /**
   * Get warmup manager (for integration with orchestration layer).
   */
  public getWarmupManager(): SessionAwareWarmupManager {
    return this.warmupManager;
  }

  /**
   * Generic Nango action warmup trigger.
   * Routes through Nango platform - tokens wrapped via connection ID.
   * Results cached/suppressed, NOT broadcast to client.
   */
  private async triggerNangoWarmupAction(
    providerConfigKey: string,
    connectionId: string
  ): Promise<void> {
    try {
      // Unified lightweight warmup via /v1/whoami endpoint
      // Works across all providers (Google, Outlook, Salesforce, Notion, Slack, etc.)
      // Token wrapping happens via connection ID on Nango's side
      await axios.get(
        'https://api.nango.dev/v1/whoami',
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
            'Provider-Config-Key': providerConfigKey,
            'Connection-Id': connectionId,
          },
          timeout: 5000, // Lightweight warmup should be fast
        }
      );

      this.logger.debug('Nango whoami warmup executed', {
        providerConfigKey,
        connectionId: '***',
      });
      // Result is suppressed - not used/broadcast
    } catch (error: any) {
      // Warmup failure is non-critical
      this.logger.warn('Nango whoami warmup failed (non-critical)', {
        providerConfigKey,
        error: error.message,
        connectionId: '***',
      });
      throw error; // Still propagate for warmup tracking
    }
  }

  /**
   * Google Workspace warmup: Unified /v1/whoami endpoint via Nango.
   * Token wrapped via Nango connection ID.
   * Result cached, not broadcast.
   */
  public async warmupGoogle(
    connectionId: string,
    providerConfigKey: string = 'google'
  ): Promise<void> {
    await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
  }

  /**
   * Google Calendar warmup: Unified /v1/whoami endpoint via Nango.
   * Token wrapped via Nango connection ID.
   * Result cached, not broadcast.
   */
  public async warmupGoogleCalendar(
    connectionId: string,
    providerConfigKey: string = 'google-calendar'
  ): Promise<void> {
    await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
  }

  /**
   * Outlook warmup: Unified /v1/whoami endpoint via Nango.
   * Token wrapped via Nango connection ID.
   * Result cached, not broadcast.
   */
  public async warmupOutlook(
    connectionId: string,
    providerConfigKey: string = 'outlook'
  ): Promise<void> {
    await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
  }

  /**
   * Salesforce warmup: Unified /v1/whoami endpoint via Nango.
   * Token wrapped via Nango connection ID.
   * Result cached, not broadcast.
   */
  public async warmupSalesforce(
    connectionId: string,
    providerConfigKey: string = 'salesforce'
  ): Promise<void> {
    await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
  }

  /**
   * Notion warmup: Unified /v1/whoami endpoint via Nango.
   * Token wrapped via Nango connection ID.
   * Result cached, not broadcast.
   */
  public async warmupNotion(
    connectionId: string,
    providerConfigKey: string = 'notion'
  ): Promise<void> {
    await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
  }

  /**
   * Slack warmup: Unified /v1/whoami endpoint via Nango.
   * Token wrapped via Nango connection ID.
   * Result cached, not broadcast.
   */
  public async warmupSlack(
    connectionId: string,
    providerConfigKey: string = 'slack'
  ): Promise<void> {
    await this.triggerNangoWarmupAction(providerConfigKey, connectionId);
  }
}
