/**
 * IProviderGateway - Unified interface for all provider interactions
 * 
 * The gateway is the single entry point for all provider operations.
 * It manages multiple adapters and routes requests to the appropriate one.
 * 
 * This replaces direct NangoService usage throughout the codebase,
 * enabling provider-agnostic orchestration.
 * 
 * @package @aso/interfaces
 */

import {
  IProviderAdapter,
  IProviderAdapterFactory,
  ProviderConfig,
  ConnectionInfo,
  FetchOptions,
  FetchResult,
  ActionResult,
} from './IProviderAdapter';

// ============================================================================
// Gateway Events (for observability)
// ============================================================================

export type GatewayEventType =
  | 'adapter_registered'
  | 'adapter_removed'
  | 'connection_warmed'
  | 'connection_failed'
  | 'fetch_started'
  | 'fetch_completed'
  | 'fetch_failed'
  | 'action_started'
  | 'action_completed'
  | 'action_failed';

export interface GatewayEvent {
  type: GatewayEventType;
  providerKey: string;
  connectionId?: string;
  timestamp: string;
  duration?: number;
  metadata?: Record<string, any>;
  error?: {
    code: string;
    message: string;
  };
}

export type GatewayEventListener = (event: GatewayEvent) => void;

// ============================================================================
// Gateway Statistics
// ============================================================================

export interface ProviderStats {
  providerKey: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  lastRequestAt?: string;
}

export interface GatewayStats {
  totalAdapters: number;
  providers: ProviderStats[];
  uptime: number;
}

// ============================================================================
// IProviderGateway Interface
// ============================================================================

/**
 * Unified gateway for all provider interactions
 * 
 * @example
 * ```typescript
 * // Create gateway
 * const gateway: IProviderGateway = new ProviderGateway(logger);
 * 
 * // Register adapters
 * gateway.registerAdapter(gmailAdapter);
 * gateway.registerAdapter(salesforceAdapter);
 * 
 * // Use in services
 * const emails = await gateway.fetchFromCache('gmail', connectionId, { model: 'GmailThread' });
 * await gateway.triggerAction('salesforce', connectionId, 'create-lead', payload);
 * ```
 */
export interface IProviderGateway {
  // ==========================================================================
  // Adapter Management
  // ==========================================================================

  /**
   * Register a provider adapter
   * 
   * @param adapter - The adapter to register
   * @throws If an adapter for this provider is already registered
   */
  registerAdapter(adapter: IProviderAdapter): void;

  /**
   * Remove a provider adapter
   * 
   * @param providerKey - Provider key to remove
   * @returns True if removed, false if not found
   */
  removeAdapter(providerKey: string): boolean;

  /**
   * Get an adapter by provider key
   * 
   * @param providerKey - Provider key
   * @returns Adapter or undefined if not found
   */
  getAdapter(providerKey: string): IProviderAdapter | undefined;

  /**
   * Check if an adapter is registered for a provider
   * 
   * @param providerKey - Provider key
   * @returns True if registered
   */
  hasAdapter(providerKey: string): boolean;

  /**
   * Get all registered provider keys
   */
  getRegisteredProviders(): string[];

  /**
   * Register an adapter factory for a specific adapter type
   * Allows dynamic adapter creation from configuration
   * 
   * @param factory - The factory to register
   */
  registerAdapterFactory?(factory: IProviderAdapterFactory): void;

  /**
   * Create and register adapters from configuration
   * 
   * @param configs - Array of provider configurations
   */
  initializeFromConfig?(configs: ProviderConfig[]): Promise<void>;

  // ==========================================================================
  // Connection Management (delegated to adapters)
  // ==========================================================================

  /**
   * Warm a connection
   * 
   * @param providerKey - Provider key
   * @param connectionId - User's connection ID
   * @param force - Force warming even if recently warmed
   * @returns Promise resolving to success status
   */
  warmConnection(
    providerKey: string,
    connectionId: string,
    force?: boolean
  ): Promise<boolean>;

  /**
   * Warm multiple connections in parallel
   * 
   * @param connections - Array of { providerKey, connectionId }
   * @returns Promise resolving to results per connection
   */
  warmConnections(
    connections: Array<{ providerKey: string; connectionId: string }>
  ): Promise<Map<string, boolean>>;

  /**
   * Get connection status
   * 
   * @param providerKey - Provider key
   * @param connectionId - User's connection ID
   * @returns Promise resolving to connection info
   */
  getConnectionStatus(
    providerKey: string,
    connectionId: string
  ): Promise<ConnectionInfo>;

  // ==========================================================================
  // Data Operations (delegated to adapters)
  // ==========================================================================

  /**
   * Fetch data from a provider's cache
   * 
   * @param providerKey - Provider key
   * @param connectionId - User's connection ID
   * @param options - Fetch options
   * @returns Promise resolving to fetch result
   */
  fetchFromCache<T = any>(
    providerKey: string,
    connectionId: string,
    options: FetchOptions
  ): Promise<FetchResult<T>>;

  /**
   * Trigger an action on a provider
   * 
   * @param providerKey - Provider key
   * @param connectionId - User's connection ID
   * @param action - Action name
   * @param payload - Action payload
   * @returns Promise resolving to action result
   */
  triggerAction<T = any>(
    providerKey: string,
    connectionId: string,
    action: string,
    payload: Record<string, any>
  ): Promise<ActionResult<T>>;

  // ==========================================================================
  // Observability
  // ==========================================================================

  /**
   * Subscribe to gateway events
   * 
   * @param listener - Event listener function
   * @returns Unsubscribe function
   */
  onEvent(listener: GatewayEventListener): () => void;

  /**
   * Get gateway statistics
   */
  getStats(): GatewayStats;

  /**
   * Health check all registered adapters
   * 
   * @returns Map of provider key to health status
   */
  healthCheck(): Promise<Map<string, boolean>>;

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Graceful shutdown - close all connections
   */
  shutdown(): Promise<void>;
}

// ============================================================================
// Gateway Configuration
// ============================================================================

export interface GatewayConfig {
  /** Enable connection warming cache */
  enableWarmingCache?: boolean;
  
  /** Warming cache TTL in milliseconds */
  warmingCacheTtlMs?: number;
  
  /** Enable request metrics */
  enableMetrics?: boolean;
  
  /** Enable event emission */
  enableEvents?: boolean;
  
  /** Default timeout for operations (ms) */
  defaultTimeoutMs?: number;
  
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
}
