/**
 * NangoProviderAdapter - Nango implementation of IProviderAdapter
 * 
 * This adapter wraps the Nango SDK to provide a unified interface for
 * interacting with external providers (Gmail, Salesforce, Slack, etc.)
 * 
 * Each provider gets its own adapter instance with provider-specific config.
 * 
 * @package @aso/adapters
 */

import { Nango } from '@nangohq/node';
import axios from 'axios';
import winston from 'winston';
import {
  IProviderAdapter,
  ProviderConfig,
  ConnectionStatus,
  ConnectionInfo,
  FetchOptions,
  FetchResult,
  ActionResult,
} from '../../services/interfaces';

// ============================================================================
// Configuration
// ============================================================================

export interface NangoProviderAdapterConfig {
  /** Nango secret key for API authentication */
  secretKey: string;
  
  /** Provider configuration from providers.json */
  providerConfig: ProviderConfig;
  
  /** Optional: Override Nango API base URL */
  apiBaseUrl?: string;
  
  /** Connection warm cache TTL in ms (default: 5 minutes) */
  warmCacheTTL?: number;
  
  /** Logger instance (optional) */
  logger?: winston.Logger;
}

// Extended provider config with Nango-specific fields
export interface NangoProviderConfig extends ProviderConfig {
  /** Nango provider config key (may differ from our key) */
  nangoProviderConfigKey?: string;
}

// ============================================================================
// NangoProviderAdapter Implementation
// ============================================================================

export class NangoProviderAdapter implements IProviderAdapter {
  private nango: Nango;
  private secretKey: string;
  private config: NangoProviderConfig;
  private apiBaseUrl: string;
  private warmCacheTTL: number;
  private logger: winston.Logger;
  
  // Connection warm cache: connectionId -> lastWarmedTimestamp
  private connectionWarmCache: Map<string, number> = new Map();

  // IProviderAdapter readonly properties
  readonly providerKey: string;
  readonly displayName: string;
  readonly adapterType = 'nango';

  constructor(config: NangoProviderAdapterConfig) {
    if (!config.secretKey) {
      throw new Error('Nango secret key is required');
    }
    if (!config.providerConfig) {
      throw new Error('Provider configuration is required');
    }

    this.secretKey = config.secretKey;
    this.config = config.providerConfig as NangoProviderConfig;
    this.apiBaseUrl = config.apiBaseUrl || 'https://api.nango.dev';
    this.warmCacheTTL = config.warmCacheTTL || 5 * 60 * 1000; // 5 minutes
    
    this.providerKey = this.config.key;
    this.displayName = this.config.displayName;

    // Initialize Nango SDK
    this.nango = new Nango({ secretKey: this.secretKey });

    // Initialize logger
    this.logger = config.logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { 
        service: 'NangoProviderAdapter',
        provider: this.providerKey 
      },
      transports: [new winston.transports.Console()],
    });

    this.logger.info('NangoProviderAdapter initialized', {
      providerKey: this.providerKey,
      nangoConfigKey: this.getNangoProviderConfigKey(),
      models: this.config.models,
      actions: this.config.actions
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get the Nango provider config key
   * This may differ from our internal provider key (e.g., 'google-mail-ynxw' vs 'gmail')
   */
  private getNangoProviderConfigKey(): string {
    return this.config.nangoProviderConfigKey || this.config.key;
  }

  /**
   * Build headers for direct Nango API calls
   */
  private buildNangoHeaders(connectionId: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.secretKey}`,
      'Provider-Config-Key': this.getNangoProviderConfigKey(),
      'Connection-Id': connectionId,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Check if connection was recently warmed
   */
  private isConnectionWarm(connectionId: string): boolean {
    const lastWarmed = this.connectionWarmCache.get(connectionId);
    if (!lastWarmed) return false;
    return (Date.now() - lastWarmed) < this.warmCacheTTL;
  }

  /**
   * Mark connection as warm
   */
  private markConnectionWarm(connectionId: string): void {
    this.connectionWarmCache.set(connectionId, Date.now());
  }

  // ==========================================================================
  // IProviderAdapter Implementation - Connection Management
  // ==========================================================================

  async warmConnection(connectionId: string): Promise<boolean> {
    // Skip if recently warmed
    if (this.isConnectionWarm(connectionId)) {
      this.logger.debug('Connection already warm', { 
        connectionId: connectionId.substring(0, 8) + '***'
      });
      return true;
    }

    const startTime = Date.now();
    const pingEndpoint = this.config.pingEndpoint || '/';
    const providerConfigKey = this.getNangoProviderConfigKey();

    try {
      // Try Nango SDK GET first
      try {
        await this.nango.get({ 
          endpoint: pingEndpoint, 
          connectionId, 
          providerConfigKey 
        });
      } catch (sdkErr) {
        // Fallback: Try action trigger ping
        this.logger.debug('SDK ping failed, trying action trigger', { 
          error: (sdkErr as Error).message 
        });
        
        await axios.post(
          `${this.apiBaseUrl}/action/trigger`,
          { action_name: 'ping', input: {} },
          { headers: this.buildNangoHeaders(connectionId) }
        ).catch(() => {
          // Ignore ping fallback errors - warming may still succeed
        });
      }

      const duration = Date.now() - startTime;
      this.markConnectionWarm(connectionId);

      this.logger.info('Connection warmed successfully', {
        connectionId: connectionId.substring(0, 8) + '***',
        duration
      });
      
      return true;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.warn('Connection warm failed', {
        connectionId: connectionId.substring(0, 8) + '***',
        duration,
        error: error.message
      });
      return false;
    }
  }

  async getConnectionStatus(connectionId: string): Promise<ConnectionInfo> {
    try {
      const connection = await this.nango.getConnection(
        this.getNangoProviderConfigKey(),
        connectionId
      );

      // Determine status based on Nango response
      let status: ConnectionStatus = 'unknown';
      if (connection) {
        // Check if token is valid (Nango returns connection data if valid)
        status = 'connected';
        
        // Check for token expiry if available
        const metadata = connection.credentials as any;
        if (metadata?.expires_at) {
          const expiresAt = new Date(metadata.expires_at);
          if (expiresAt < new Date()) {
            status = 'expired';
          }
        }
      }

      return {
        connectionId,
        providerKey: this.providerKey,
        status,
        userId: (connection as any)?.end_user_id || '',
        createdAt: (connection as any)?.created_at,
        lastUsedAt: (connection as any)?.updated_at,
        metadata: {
          nangoConnectionId: (connection as any)?.id
        }
      };

    } catch (error: any) {
      this.logger.error('Failed to get connection status', {
        connectionId: connectionId.substring(0, 8) + '***',
        error: error.message
      });

      // Return error status
      return {
        connectionId,
        providerKey: this.providerKey,
        status: error.message?.includes('not found') ? 'disconnected' : 'error',
        userId: '',
        metadata: { error: error.message }
      };
    }
  }

  async refreshConnection(connectionId: string): Promise<boolean> {
    try {
      // Nango handles token refresh automatically, but we can trigger it
      await this.nango.getConnection(
        this.getNangoProviderConfigKey(),
        connectionId,
        true // Force refresh
      );
      
      // Clear warm cache to force re-warm
      this.connectionWarmCache.delete(connectionId);
      
      this.logger.info('Connection refreshed', {
        connectionId: connectionId.substring(0, 8) + '***'
      });
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to refresh connection', {
        connectionId: connectionId.substring(0, 8) + '***',
        error: error.message
      });
      return false;
    }
  }

  // ==========================================================================
  // IProviderAdapter Implementation - Data Operations
  // ==========================================================================

  async fetchFromCache<T = any>(
    connectionId: string,
    options: FetchOptions
  ): Promise<FetchResult<T>> {
    const startTime = Date.now();
    
    // Ensure connection is warm
    await this.warmConnection(connectionId);

    // Map model to Nango action name
    const actionName = this.mapModelToFetchAction(options.model);

    this.logger.info('Fetching from cache', {
      connectionId: connectionId.substring(0, 8) + '***',
      model: options.model,
      actionName,
      limit: options.limit
    });

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/action/trigger`,
        {
          action_name: actionName,
          input: {
            model: options.model,
            filters: options.filters,
            limit: options.limit || 10,
            cursor: options.cursor,
            fields: options.fields
          }
        },
        { headers: this.buildNangoHeaders(connectionId) }
      );

      const duration = Date.now() - startTime;
      const data = response.data;

      this.logger.info('Cache fetch successful', {
        model: options.model,
        recordCount: Array.isArray(data?.data) ? data.data.length : 
                     Array.isArray(data) ? data.length : 1,
        duration
      });

      // Normalize response to FetchResult format
      return this.normalizeFetchResult<T>(data);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('Cache fetch failed', {
        model: options.model,
        duration,
        error: error.response?.data?.message || error.message
      });

      throw this.enhanceError(error, actionName);
    }
  }

  async triggerAction<T = any>(
    connectionId: string,
    action: string,
    payload: Record<string, any>
  ): Promise<ActionResult<T>> {
    const startTime = Date.now();

    // Validate action is supported
    if (!this.supportsAction(action)) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_ACTION',
          message: `Action '${action}' is not supported by ${this.displayName}`,
          details: { supportedActions: this.config.actions }
        }
      };
    }

    // Ensure connection is warm
    await this.warmConnection(connectionId);

    this.logger.info('Triggering action', {
      connectionId: connectionId.substring(0, 8) + '***',
      action,
      payloadKeys: Object.keys(payload)
    });

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/action/trigger`,
        {
          action_name: action,
          input: payload
        },
        { headers: this.buildNangoHeaders(connectionId) }
      );

      const duration = Date.now() - startTime;

      this.logger.info('Action triggered successfully', {
        action,
        duration
      });

      return {
        success: true,
        data: response.data as T,
        metadata: {
          duration,
          requestId: response.headers['x-request-id']
        }
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const enhancedError = this.enhanceError(error, action);

      this.logger.error('Action trigger failed', {
        action,
        duration,
        error: enhancedError.message
      });

      return {
        success: false,
        error: {
          code: error.response?.status === 429 ? 'RATE_LIMITED' : 'ACTION_FAILED',
          message: enhancedError.message,
          details: (enhancedError as any).nangoErrorDetails
        },
        metadata: { duration }
      };
    }
  }

  // ==========================================================================
  // IProviderAdapter Implementation - Metadata
  // ==========================================================================

  getConfig(): ProviderConfig {
    return this.config;
  }

  supportsModel(model: string): boolean {
    return this.config.models.includes(model);
  }

  supportsAction(action: string): boolean {
    return this.config.actions.includes(action);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple check: Verify Nango API is reachable
      await axios.get(`${this.apiBaseUrl}/health`, {
        headers: { 'Authorization': `Bearer ${this.secretKey}` },
        timeout: 5000
      });
      return true;
    } catch (error) {
      this.logger.warn('Health check failed', { 
        error: (error as Error).message 
      });
      return false;
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Map model name to Nango fetch action name
   */
  private mapModelToFetchAction(model: string): string {
    // Provider-specific mappings
    const mappings: Record<string, Record<string, string>> = {
      gmail: {
        'GmailThread': 'fetch-emails',
        'GmailMessage': 'fetch-emails'
      },
      'google-calendar': {
        'GoogleCalendarEvent': 'fetch-calendar-events',
        'GoogleCalendarList': 'fetch-calendar-list'
      },
      salesforce: {
        'SalesforceLead': 'salesforce-fetch-entity',
        'SalesforceOpportunity': 'salesforce-fetch-entity',
        'SalesforceAccount': 'salesforce-fetch-entity',
        'SalesforceContact': 'salesforce-fetch-entity',
        'SalesforceCase': 'salesforce-fetch-entity'
      },
      slack: {
        'SlackMessage': 'fetch-messages',
        'SlackChannel': 'fetch-channels'
      },
      notion: {
        'NotionPage': 'fetch-notion-page',
        'NotionDatabase': 'fetch-notion-database'
      },
      outlook: {
        'OutlookMessage': 'fetch-outlook-entity',
        'OutlookEvent': 'fetch-outlook-entity',
        'OutlookContact': 'fetch-outlook-entity'
      }
    };

    const providerMappings = mappings[this.providerKey];
    if (providerMappings && providerMappings[model]) {
      return providerMappings[model];
    }

    // Default: convert model name to action name
    // e.g., 'GmailThread' -> 'fetch-gmail-thread'
    return `fetch-${model.toLowerCase().replace(/([A-Z])/g, '-$1').substring(1)}`;
  }

  /**
   * Normalize various Nango response formats to FetchResult
   */
  private normalizeFetchResult<T>(response: any): FetchResult<T> {
    // Handle array response
    if (Array.isArray(response)) {
      return {
        data: response as T[],
        hasMore: false
      };
    }

    // Handle { data: [...] } response
    if (response?.data && Array.isArray(response.data)) {
      return {
        data: response.data as T[],
        cursor: response.cursor || response.nextCursor,
        hasMore: !!response.cursor || !!response.nextCursor || !!response.hasMore,
        totalCount: response.totalCount || response.total,
        metadata: response.metadata
      };
    }

    // Handle single object response
    if (response && typeof response === 'object') {
      return {
        data: [response] as T[],
        hasMore: false
      };
    }

    // Fallback
    return {
      data: [],
      hasMore: false
    };
  }

  /**
   * Enhance error with Nango-specific details
   */
  private enhanceError(error: any, actionName: string): Error {
    const enhancedError: any = new Error(
      error.response?.data?.message || 
      error.message || 
      `Request failed with status ${error.response?.status}`
    );
    
    enhancedError.nangoErrorDetails = {
      actionName,
      providerKey: this.providerKey,
      statusCode: error.response?.status,
      nangoPayload: error.response?.data || null,
      timestamp: new Date().toISOString()
    };
    
    return enhancedError;
  }
}

// ============================================================================
// Factory for creating adapters from provider config
// ============================================================================

export class NangoProviderAdapterFactory {
  constructor(private secretKey: string, private logger?: winston.Logger) {}

  create(providerConfig: ProviderConfig): NangoProviderAdapter {
    return new NangoProviderAdapter({
      secretKey: this.secretKey,
      providerConfig,
      logger: this.logger
    });
  }

  readonly adapterType = 'nango';
}
