/**
 * ASO Interfaces - Barrel Export
 * 
 * This module exports all interfaces for the App-System-Orchestrator.
 * These interfaces enable decoupling of services for bundle extraction.
 * 
 * @package @aso/interfaces
 * @version 1.0.0
 */

// ============================================================================
// LLM Client Interface
// ============================================================================

export {
  // Types
  ChatRole,
  ChatMessage,
  ToolCallRequest,
  ToolDefinition,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  // Interface
  ILLMClient,
  ILLMClientFactory,
} from './ILLMClient';

// ============================================================================
// Tool Provider Interface
// ============================================================================

export {
  // Types
  ToolParameterProperty,
  ToolInputSchema,
  ToolConfig,
  ToolCategory,
  ToolValidationResult,
  // Interfaces
  IToolProvider,
  IToolValidator,
} from './IToolProvider';

// ============================================================================
// Tool Filter Interface
// ============================================================================

export {
  // Types
  FilterContext,
  ToolAvailability,
  // Interfaces
  IToolFilter,
  IConnectionDatabase,
  IToolFilterCache,
} from './IToolFilter';

// ============================================================================
// Provider Adapter Interface
// ============================================================================

export {
  // Types
  ConnectionStatus,
  ConnectionInfo,
  FetchOptions,
  FetchResult,
  ActionResult,
  ProviderConfig,
  // Interfaces
  IProviderAdapter,
  IProviderAdapterFactory,
} from './IProviderAdapter';

// ============================================================================
// Provider Gateway Interface
// ============================================================================

export {
  // Types
  GatewayEventType,
  GatewayEvent,
  GatewayEventListener,
  ProviderStats,
  GatewayStats,
  GatewayConfig,
  // Interface
  IProviderGateway,
} from './IProviderGateway';

// ============================================================================
// Re-export common types for convenience
// ============================================================================

/**
 * Common result type for async operations
 */
export interface AsyncResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  cursor?: string;
  offset?: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

/**
 * Logger interface (minimal, for DI)
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}
