/**
 * ProviderGateway - Unified entry point for all provider operations
 * 
 * The gateway manages multiple IProviderAdapter instances and routes
 * requests to the appropriate adapter based on provider key.
 * 
 * Features:
 * - Adapter registry with factory support
 * - Connection warming with caching
 * - Parallel operations for efficiency
 * - Event emission for observability
 * - Statistics tracking
 * 
 * @package @aso/adapters
 */

import winston from 'winston';
import {
  IProviderGateway,
  IProviderAdapter,
  IProviderAdapterFactory,
  ProviderConfig,
  ConnectionInfo,
  FetchOptions,
  FetchResult,
  ActionResult,
  GatewayEvent,
  GatewayEventType,
  GatewayEventListener,
  GatewayStats,
  ProviderStats,
  GatewayConfig,
} from '../services/interfaces';

// ============================================================================
// Internal Statistics Tracking
// ============================================================================

interface ProviderStatsInternal {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  lastRequestAt?: Date;
}

// ============================================================================
// ProviderGateway Implementation
// ============================================================================

export class ProviderGateway implements IProviderGateway {
  private adapters: Map<string, IProviderAdapter> = new Map();
  private factories: Map<string, IProviderAdapterFactory> = new Map();
  private eventListeners: Set<GatewayEventListener> = new Set();
  private stats: Map<string, ProviderStatsInternal> = new Map();
  private config: Required<GatewayConfig>;
  private logger: winston.Logger;
  private startTime: Date;

  // Connection warming cache: providerKey:connectionId -> timestamp
  private warmingCache: Map<string, number> = new Map();

  constructor(config?: GatewayConfig, logger?: winston.Logger) {
    this.startTime = new Date();
    
    // Apply defaults
    this.config = {
      enableWarmingCache: true,
      warmingCacheTtlMs: 5 * 60 * 1000, // 5 minutes
      enableMetrics: true,
      enableEvents: true,
      defaultTimeoutMs: 30000,
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
      },
      ...config,
    };

    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'ProviderGateway' },
      transports: [new winston.transports.Console()],
    });

    this.logger.info('ProviderGateway initialized', { config: this.config });
  }

  // ==========================================================================
  // Adapter Management
  // ==========================================================================

  registerAdapter(adapter: IProviderAdapter): void {
    if (this.adapters.has(adapter.providerKey)) {
      throw new Error(
        `Adapter for provider '${adapter.providerKey}' is already registered`
      );
    }

    this.adapters.set(adapter.providerKey, adapter);
    this.initProviderStats(adapter.providerKey);
    
    this.emitEvent('adapter_registered', adapter.providerKey, {
      displayName: adapter.displayName,
      adapterType: adapter.adapterType,
    });

    this.logger.info('Adapter registered', {
      providerKey: adapter.providerKey,
      displayName: adapter.displayName,
      adapterType: adapter.adapterType,
    });
  }

  removeAdapter(providerKey: string): boolean {
    const existed = this.adapters.delete(providerKey);
    
    if (existed) {
      this.emitEvent('adapter_removed', providerKey);
      this.logger.info('Adapter removed', { providerKey });
    }
    
    return existed;
  }

  getAdapter(providerKey: string): IProviderAdapter | undefined {
    // Try direct match
    let adapter = this.adapters.get(providerKey);
    
    if (!adapter) {
      // Try alias lookup
      for (const [key, adp] of this.adapters) {
        const config = adp.getConfig();
        if (config.aliases?.includes(providerKey)) {
          adapter = adp;
          break;
        }
      }
    }
    
    return adapter;
  }

  hasAdapter(providerKey: string): boolean {
    return this.getAdapter(providerKey) !== undefined;
  }

  getRegisteredProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  registerAdapterFactory(factory: IProviderAdapterFactory): void {
    this.factories.set(factory.adapterType, factory);
    this.logger.info('Adapter factory registered', { 
      adapterType: factory.adapterType 
    });
  }

  async initializeFromConfig(configs: ProviderConfig[]): Promise<void> {
    this.logger.info('Initializing adapters from config', { 
      count: configs.length 
    });

    for (const config of configs) {
      // Find appropriate factory (currently only 'nango' supported)
      const factory = this.factories.get('nango');
      
      if (!factory) {
        this.logger.warn('No factory available for provider config', {
          providerKey: config.key
        });
        continue;
      }

      try {
        const adapter = factory.create(config);
        this.registerAdapter(adapter);
      } catch (error) {
        this.logger.error('Failed to create adapter from config', {
          providerKey: config.key,
          error: (error as Error).message
        });
      }
    }
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  async warmConnection(
    providerKey: string,
    connectionId: string,
    force = false
  ): Promise<boolean> {
    const adapter = this.getAdapter(providerKey);
    if (!adapter) {
      this.logger.warn('No adapter for provider', { providerKey });
      return false;
    }

    // Check warming cache unless forced
    const cacheKey = `${providerKey}:${connectionId}`;
    if (!force && this.config.enableWarmingCache) {
      const lastWarmed = this.warmingCache.get(cacheKey);
      if (lastWarmed && (Date.now() - lastWarmed) < this.config.warmingCacheTtlMs) {
        this.logger.debug('Connection already warm (cached)', {
          providerKey,
          connectionId: connectionId.substring(0, 8) + '***'
        });
        return true;
      }
    }

    const startTime = Date.now();
    try {
      const result = await adapter.warmConnection(connectionId);
      const duration = Date.now() - startTime;

      if (result) {
        this.warmingCache.set(cacheKey, Date.now());
        this.emitEvent('connection_warmed', providerKey, { connectionId }, duration);
      } else {
        this.emitEvent('connection_failed', providerKey, { connectionId }, duration);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.emitEvent('connection_failed', providerKey, { 
        connectionId,
        error: (error as Error).message 
      }, duration, {
        code: 'CONNECTION_WARM_FAILED',
        message: (error as Error).message
      });
      return false;
    }
  }

  async warmConnections(
    connections: Array<{ providerKey: string; connectionId: string }>
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    // Warm all connections in parallel
    await Promise.all(
      connections.map(async ({ providerKey, connectionId }) => {
        const key = `${providerKey}:${connectionId}`;
        try {
          const result = await this.warmConnection(providerKey, connectionId);
          results.set(key, result);
        } catch {
          results.set(key, false);
        }
      })
    );

    return results;
  }

  async getConnectionStatus(
    providerKey: string,
    connectionId: string
  ): Promise<ConnectionInfo> {
    const adapter = this.getAdapter(providerKey);
    if (!adapter) {
      return {
        connectionId,
        providerKey,
        status: 'error',
        userId: '',
        metadata: { error: `No adapter registered for provider '${providerKey}'` }
      };
    }

    return adapter.getConnectionStatus(connectionId);
  }

  // ==========================================================================
  // Data Operations
  // ==========================================================================

  async fetchFromCache<T = any>(
    providerKey: string,
    connectionId: string,
    options: FetchOptions
  ): Promise<FetchResult<T>> {
    const adapter = this.getAdapter(providerKey);
    if (!adapter) {
      throw new Error(`No adapter registered for provider '${providerKey}'`);
    }

    const startTime = Date.now();
    this.emitEvent('fetch_started', providerKey, {
      connectionId,
      model: options.model
    });

    try {
      const result = await adapter.fetchFromCache<T>(connectionId, options);
      const duration = Date.now() - startTime;
      
      this.recordSuccess(providerKey, duration);
      this.emitEvent('fetch_completed', providerKey, {
        connectionId,
        model: options.model,
        recordCount: result.data.length
      }, duration);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordFailure(providerKey, duration);
      
      this.emitEvent('fetch_failed', providerKey, {
        connectionId,
        model: options.model
      }, duration, {
        code: 'FETCH_FAILED',
        message: (error as Error).message
      });

      throw error;
    }
  }

  async triggerAction<T = any>(
    providerKey: string,
    connectionId: string,
    action: string,
    payload: Record<string, any>
  ): Promise<ActionResult<T>> {
    const adapter = this.getAdapter(providerKey);
    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'NO_ADAPTER',
          message: `No adapter registered for provider '${providerKey}'`
        }
      };
    }

    const startTime = Date.now();
    this.emitEvent('action_started', providerKey, { connectionId, action });

    try {
      const result = await adapter.triggerAction<T>(connectionId, action, payload);
      const duration = Date.now() - startTime;

      if (result.success) {
        this.recordSuccess(providerKey, duration);
        this.emitEvent('action_completed', providerKey, { 
          connectionId, 
          action 
        }, duration);
      } else {
        this.recordFailure(providerKey, duration);
        this.emitEvent('action_failed', providerKey, { 
          connectionId, 
          action 
        }, duration, result.error);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordFailure(providerKey, duration);
      
      this.emitEvent('action_failed', providerKey, { 
        connectionId, 
        action 
      }, duration, {
        code: 'ACTION_EXCEPTION',
        message: (error as Error).message
      });

      return {
        success: false,
        error: {
          code: 'ACTION_EXCEPTION',
          message: (error as Error).message
        }
      };
    }
  }

  // ==========================================================================
  // Observability
  // ==========================================================================

  onEvent(listener: GatewayEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  getStats(): GatewayStats {
    const providers: ProviderStats[] = [];
    
    for (const [providerKey, internal] of this.stats) {
      providers.push({
        providerKey,
        totalRequests: internal.totalRequests,
        successfulRequests: internal.successfulRequests,
        failedRequests: internal.failedRequests,
        averageLatencyMs: internal.totalRequests > 0 
          ? Math.round(internal.totalLatencyMs / internal.totalRequests)
          : 0,
        lastRequestAt: internal.lastRequestAt?.toISOString()
      });
    }

    return {
      totalAdapters: this.adapters.size,
      providers,
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.all(
      Array.from(this.adapters.entries()).map(async ([key, adapter]) => {
        try {
          const healthy = await adapter.healthCheck();
          results.set(key, healthy);
        } catch {
          results.set(key, false);
        }
      })
    );

    return results;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down ProviderGateway', {
      adapterCount: this.adapters.size
    });

    // Clear caches
    this.warmingCache.clear();
    this.eventListeners.clear();
    
    // Clear adapters
    this.adapters.clear();
    this.factories.clear();

    this.logger.info('ProviderGateway shutdown complete');
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private initProviderStats(providerKey: string): void {
    if (!this.stats.has(providerKey)) {
      this.stats.set(providerKey, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalLatencyMs: 0
      });
    }
  }

  private recordSuccess(providerKey: string, durationMs: number): void {
    if (!this.config.enableMetrics) return;
    
    const stats = this.stats.get(providerKey);
    if (stats) {
      stats.totalRequests++;
      stats.successfulRequests++;
      stats.totalLatencyMs += durationMs;
      stats.lastRequestAt = new Date();
    }
  }

  private recordFailure(providerKey: string, durationMs: number): void {
    if (!this.config.enableMetrics) return;
    
    const stats = this.stats.get(providerKey);
    if (stats) {
      stats.totalRequests++;
      stats.failedRequests++;
      stats.totalLatencyMs += durationMs;
      stats.lastRequestAt = new Date();
    }
  }

  private emitEvent(
    type: GatewayEventType,
    providerKey: string,
    metadata?: Record<string, any>,
    duration?: number,
    error?: { code: string; message: string }
  ): void {
    if (!this.config.enableEvents) return;

    const event: GatewayEvent = {
      type,
      providerKey,
      timestamp: new Date().toISOString(),
      duration,
      metadata,
      error
    };

    // Mask connectionId in metadata if present
    if (metadata?.connectionId && typeof metadata.connectionId === 'string') {
      event.metadata = {
        ...metadata,
        connectionId: metadata.connectionId.substring(0, 8) + '***'
      };
    }

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.error('Event listener error', { 
          error: (err as Error).message 
        });
      }
    }
  }
}
