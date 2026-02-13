/**
 * IToolFilter - Abstract interface for filtering tools by user capability
 * 
 * This interface allows filtering available tools based on:
 * - User's connected providers (OAuth connections)
 * - User's subscription tier
 * - Feature flags
 * - Any other capability-based filtering
 * 
 * @package @aso/interfaces
 */

import { ToolConfig } from './IToolProvider';

// ============================================================================
// Filter Context Types
// ============================================================================

/**
 * Context for filtering decisions
 * Extensible for future filtering criteria
 */
export interface FilterContext {
  /** User identifier */
  userId: string;
  
  /** Session identifier (optional) */
  sessionId?: string;
  
  /** User's subscription tier (optional) */
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  
  /** Feature flags (optional) */
  featureFlags?: Record<string, boolean>;
  
  /** Additional context (extensible) */
  metadata?: Record<string, any>;
}

/**
 * Result of tool availability check
 */
export interface ToolAvailability {
  tool: ToolConfig;
  available: boolean;
  reason?: string; // Why unavailable (e.g., "Provider not connected", "Requires pro tier")
}

// ============================================================================
// IToolFilter Interface
// ============================================================================

/**
 * Abstract interface for filtering tools based on user capabilities
 * 
 * @example
 * ```typescript
 * // Provider-based filtering
 * const toolFilter: IToolFilter = new ProviderAwareToolFilter(db, cache);
 * 
 * // Get tools user can actually execute
 * const availableTools = await toolFilter.getAvailableToolsForUser(userId);
 * 
 * // Inject into PlannerService
 * const planner = new PlannerService({ llmClient, toolProvider, toolFilter, ... });
 * ```
 */
export interface IToolFilter {
  /**
   * Get tools that the user can actually execute
   * 
   * This filters based on:
   * - Connected providers (OAuth connections)
   * - Subscription tier
   * - Feature flags
   * 
   * @param userId - User identifier
   * @returns Promise resolving to array of available tools
   */
  getAvailableToolsForUser(userId: string): Promise<ToolConfig[]>;

  /**
   * Get tools filtered by categories AND user capabilities
   * 
   * @param userId - User identifier
   * @param categories - Categories to filter by
   * @returns Promise resolving to filtered tools
   */
  getToolsByCategoriesForUser(
    userId: string,
    categories: string[]
  ): Promise<ToolConfig[]>;

  /**
   * Check if a specific tool is available for a user
   * 
   * @param userId - User identifier
   * @param toolName - Tool name to check
   * @returns Promise resolving to availability info
   */
  isToolAvailable(
    userId: string,
    toolName: string
  ): Promise<ToolAvailability>;

  /**
   * Get all tools with availability status for a user
   * Useful for UI to show which tools are available/unavailable
   * 
   * @param userId - User identifier
   * @returns Promise resolving to all tools with availability
   */
  getAllToolsWithAvailability(userId: string): Promise<ToolAvailability[]>;

  /**
   * Get the providers a user has connected
   * 
   * @param userId - User identifier
   * @returns Promise resolving to set of connected provider keys
   */
  getConnectedProviders(userId: string): Promise<Set<string>>;

  /**
   * Invalidate cached availability for a user
   * Call this when user connects/disconnects a provider
   * 
   * @param userId - User identifier
   */
  invalidateCache(userId: string): Promise<void>;

  /**
   * Advanced: Filter with full context
   * 
   * @param context - Full filter context
   * @param tools - Tools to filter (optional, defaults to all)
   * @returns Promise resolving to filtered tools
   */
  filterWithContext?(
    context: FilterContext,
    tools?: ToolConfig[]
  ): Promise<ToolConfig[]>;
}

// ============================================================================
// Database Interface (for concrete implementations)
// ============================================================================

/**
 * Minimal database interface for connection queries
 * Allows ProviderAwareToolFilter to work with any DB
 */
export interface IConnectionDatabase {
  /**
   * Get providers connected by a user
   * 
   * @param userId - User identifier
   * @returns Promise resolving to array of provider records
   */
  getConnectionsForUser(userId: string): Promise<Array<{ provider: string }>>;
}

// ============================================================================
// Cache Interface (for implementations with caching)
// ============================================================================

/**
 * Optional cache interface for tool availability
 */
export interface IToolFilterCache {
  get(userId: string): Promise<ToolConfig[] | null>;
  set(userId: string, tools: ToolConfig[], ttlSeconds?: number): Promise<void>;
  invalidate(userId: string): Promise<void>;
}
