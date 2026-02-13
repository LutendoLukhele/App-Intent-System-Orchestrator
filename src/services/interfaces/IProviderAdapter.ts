/**
 * IProviderAdapter - Abstract interface for external provider integrations
 * 
 * This interface decouples the orchestration layer from specific integration
 * mechanisms (Nango, direct API, mock, etc.)
 * 
 * Each provider (Gmail, Salesforce, Slack, etc.) gets its own adapter instance
 * that implements this interface.
 * 
 * @package @aso/interfaces
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionStatus = 
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'
  | 'unknown';

export interface ConnectionInfo {
  connectionId: string;
  providerKey: string;
  status: ConnectionStatus;
  userId: string;
  createdAt?: string;
  lastUsedAt?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Operation Types
// ============================================================================

export interface FetchOptions {
  /** Model/entity to fetch (e.g., 'GmailThread', 'SalesforceLead') */
  model: string;
  
  /** Filters to apply */
  filters?: Record<string, any>;
  
  /** Maximum records to return */
  limit?: number;
  
  /** Pagination cursor */
  cursor?: string;
  
  /** Fields to include (projection) */
  fields?: string[];
  
  /** Sort order */
  sort?: { field: string; direction: 'asc' | 'desc' };
}

export interface FetchResult<T = any> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  totalCount?: number;
  metadata?: Record<string, any>;
}

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId?: string;
    duration?: number;
  };
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Static configuration for a provider
 * Loaded from config/providers.json
 */
export interface ProviderConfig {
  /** Unique provider key (e.g., 'gmail', 'salesforce') */
  key: string;
  
  /** Human-readable display name */
  displayName: string;
  
  /** Adapter type to use ('nango', 'direct', 'mock') */
  adapterType: 'nango' | 'direct' | 'mock';
  
  /** Endpoint for connection warming/health check */
  pingEndpoint?: string;
  
  /** Available data models for cache reads */
  models: string[];
  
  /** Available actions for writes */
  actions: string[];
  
  /** OAuth scopes required */
  scopes?: string[];
  
  /** Alternative names for this provider */
  aliases?: string[];
  
  /** Rate limits */
  rateLimits?: {
    requestsPerMinute?: number;
    requestsPerDay?: number;
  };
  
  /** Additional provider-specific config */
  metadata?: Record<string, any>;
}

// ============================================================================
// IProviderAdapter Interface
// ============================================================================

/**
 * Abstract interface for provider adapters
 * 
 * @example
 * ```typescript
 * // Nango-based adapter
 * const gmailAdapter: IProviderAdapter = new NangoProviderAdapter(nango, gmailConfig);
 * 
 * // Direct API adapter
 * const customAdapter: IProviderAdapter = new DirectAPIAdapter(apiClient, config);
 * 
 * // Register with gateway
 * gateway.registerAdapter(gmailAdapter);
 * ```
 */
export interface IProviderAdapter {
  /**
   * The provider key this adapter handles
   */
  readonly providerKey: string;

  /**
   * Human-readable display name
   */
  readonly displayName: string;

  /**
   * The adapter type ('nango', 'direct', 'mock')
   */
  readonly adapterType: string;

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Warm a connection to reduce cold start latency
   * Makes a lightweight API call to initialize the connection
   * 
   * @param connectionId - User's connection ID
   * @returns Promise resolving to success status
   */
  warmConnection(connectionId: string): Promise<boolean>;

  /**
   * Get the status of a connection
   * 
   * @param connectionId - User's connection ID
   * @returns Promise resolving to connection info
   */
  getConnectionStatus(connectionId: string): Promise<ConnectionInfo>;

  /**
   * Refresh an expired connection (if supported)
   * 
   * @param connectionId - User's connection ID
   * @returns Promise resolving to success status
   */
  refreshConnection?(connectionId: string): Promise<boolean>;

  // ==========================================================================
  // Data Operations
  // ==========================================================================

  /**
   * Fetch data from cache/provider
   * Used for read operations (e.g., fetch emails, get leads)
   * 
   * @param connectionId - User's connection ID
   * @param options - Fetch options (model, filters, limit, etc.)
   * @returns Promise resolving to fetch result
   */
  fetchFromCache<T = any>(
    connectionId: string,
    options: FetchOptions
  ): Promise<FetchResult<T>>;

  /**
   * Trigger an action on the provider
   * Used for write operations (e.g., send email, create lead)
   * 
   * @param connectionId - User's connection ID
   * @param action - Action name (e.g., 'send-email', 'create-lead')
   * @param payload - Action payload
   * @returns Promise resolving to action result
   */
  triggerAction<T = any>(
    connectionId: string,
    action: string,
    payload: Record<string, any>
  ): Promise<ActionResult<T>>;

  // ==========================================================================
  // Metadata
  // ==========================================================================

  /**
   * Get the configuration for this provider
   */
  getConfig(): ProviderConfig;

  /**
   * Check if a model is supported by this provider
   */
  supportsModel(model: string): boolean;

  /**
   * Check if an action is supported by this provider
   */
  supportsAction(action: string): boolean;

  /**
   * Health check for the adapter itself
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Adapter Factory (for creating adapters from config)
// ============================================================================

export interface IProviderAdapterFactory {
  /**
   * Create an adapter for a provider
   * 
   * @param config - Provider configuration
   * @returns The created adapter
   */
  create(config: ProviderConfig): IProviderAdapter;

  /**
   * Get the adapter type this factory creates
   */
  readonly adapterType: string;
}
