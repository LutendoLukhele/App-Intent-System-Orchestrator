/**
 * ILLMClient - Abstract interface for LLM interactions
 * 
 * This interface decouples the orchestration layer from specific LLM providers.
 * Implementations can include: Groq, OpenAI, Anthropic, local models (Ollama, llama.cpp)
 * 
 * @package @aso/interfaces
 */

// ============================================================================
// Chat Types
// ============================================================================

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
}

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** Optional: Override model for this request */
  model?: string;
  /** Response format (e.g., for JSON mode) */
  responseFormat?: { type: 'json_object' | 'text' };
  /** Tool choice shorthand */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCallRequest[] | null;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'function_call' | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// Streaming Types
// ============================================================================

export interface ChatChunk {
  /** Incremental content delta */
  content: string | null;
  /** Tool call deltas (accumulated) */
  toolCalls?: Partial<ToolCallRequest>[];
  /** Present on final chunk */
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'function_call' | null;
  /** Is this the final chunk? (optional for simpler implementations) */
  done?: boolean;
}

// ============================================================================
// ILLMClient Interface
// ============================================================================

/**
 * Abstract interface for LLM client implementations
 * 
 * @example
 * ```typescript
 * // Using with Groq
 * const llmClient: ILLMClient = new GroqLLMClient(apiKey);
 * 
 * // Using with local model
 * const llmClient: ILLMClient = new OllamaLLMClient('http://localhost:11434');
 * 
 * // Inject into PlannerService
 * const planner = new PlannerService({ llmClient, toolProvider, ... });
 * ```
 */
export interface ILLMClient {
  /**
   * The default model identifier used by this client
   */
  readonly defaultModel: string;

  /**
   * Perform a chat completion (non-streaming)
   * 
   * @param options - Chat options including messages, tools, temperature
   * @returns Promise resolving to the complete response
   */
  chat(options: ChatOptions): Promise<ChatResponse>;

  /**
   * Perform a streaming chat completion
   * 
   * @param options - Chat options including messages, tools, temperature
   * @returns AsyncIterable of chat chunks
   */
  chatStream(options: ChatOptions): AsyncIterable<ChatChunk>;

  /**
   * Check if the client is healthy/reachable
   * Useful for circuit breaker patterns
   * @returns Promise resolving to health status
   */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;

  /**
   * Get the name of this LLM provider (for logging/metrics)
   */
  readonly providerName: string;
}

// ============================================================================
// Factory Type (for DI containers)
// ============================================================================

export interface ILLMClientFactory {
  create(config: Record<string, any>): ILLMClient;
}
