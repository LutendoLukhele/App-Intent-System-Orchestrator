/**
 * GroqLLMClient - Groq implementation of ILLMClient
 * 
 * This adapter wraps the Groq SDK to conform to the ILLMClient interface,
 * enabling PlannerService and other services to be LLM-agnostic.
 * 
 * @package @aso/adapters
 */

import Groq from 'groq-sdk';
import {
  ILLMClient,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ChatMessage,
  ToolCallRequest,
  ToolDefinition,
} from '../../services/interfaces';

// ============================================================================
// Configuration
// ============================================================================

export interface GroqLLMClientConfig {
  apiKey: string;
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
}

// ============================================================================
// GroqLLMClient Implementation
// ============================================================================

export class GroqLLMClient implements ILLMClient {
  private client: Groq;
  private config: Required<GroqLLMClientConfig>;

  readonly providerName = 'groq';
  
  get defaultModel(): string {
    return this.config.defaultModel;
  }

  constructor(config: GroqLLMClientConfig) {
    // Validate API key
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('Groq API key is required');
    }
    if (!config.apiKey.startsWith('gsk_')) {
      throw new Error('Invalid Groq API key format - must start with gsk_');
    }

    this.config = {
      apiKey: config.apiKey.trim(),
      defaultModel: config.defaultModel || 'llama-3.3-70b-versatile',
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 60000,
    };

    this.client = new Groq({
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    });
  }

  // ==========================================================================
  // ILLMClient Implementation
  // ==========================================================================

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model || this.config.defaultModel,
      messages: this.convertMessages(options.messages),
      tools: options.tools ? this.convertTools(options.tools) : undefined,
      tool_choice: (options.toolChoice || options.tool_choice) as any,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stop: options.stop,
      response_format: options.responseFormat,
      stream: false,
    });

    const choice = response.choices[0];
    
    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls 
        ? this.convertToolCalls(choice.message.tool_calls)
        : null,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  async *chatStream(options: ChatOptions): AsyncIterable<ChatChunk> {
    const stream = await this.client.chat.completions.create({
      model: options.model || this.config.defaultModel,
      messages: this.convertMessages(options.messages),
      tools: options.tools ? this.convertTools(options.tools) : undefined,
      tool_choice: (options.toolChoice || options.tool_choice) as any,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stop: options.stop,
      stream: true,
    });

    let accumulatedToolCalls: Map<number, Partial<ToolCallRequest>> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const finishReason = chunk.choices[0]?.finish_reason;

      // Handle content delta
      if (delta?.content) {
        yield {
          content: delta.content,
          done: false,
        };
      }

      // Handle tool call deltas
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          
          if (!accumulatedToolCalls.has(index)) {
            accumulatedToolCalls.set(index, {
              id: toolCallDelta.id || '',
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: toolCallDelta.function?.arguments || '',
              },
            });
          } else {
            const existing = accumulatedToolCalls.get(index)!;
            if (toolCallDelta.function?.name) {
              existing.function!.name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              existing.function!.arguments += toolCallDelta.function.arguments;
            }
          }
        }

        yield {
          content: null,
          toolCalls: Array.from(accumulatedToolCalls.values()),
          done: false,
        };
      }

      // Handle finish
      if (finishReason) {
        yield {
          content: null,
          toolCalls: accumulatedToolCalls.size > 0 
            ? Array.from(accumulatedToolCalls.values()) as ToolCallRequest[]
            : undefined,
          finishReason: this.mapFinishReason(finishReason),
          done: true,
        };
      }
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Make a minimal API call to verify connectivity
      await this.client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { healthy: true };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private convertMessages(messages: ChatMessage[]): Groq.Chat.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content || '',
          tool_call_id: msg.tool_call_id!,
        };
      }

      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls.map((tc: ToolCallRequest) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content || '',
      };
    });
  }

  private convertTools(tools: ToolDefinition[]): Groq.Chat.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  private convertToolCalls(toolCalls: Groq.Chat.ChatCompletionMessageToolCall[]): ToolCallRequest[] {
    return toolCalls.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  }

  private mapFinishReason(reason: string | null): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGroqLLMClient(apiKey: string, model?: string): ILLMClient {
  return new GroqLLMClient({
    apiKey,
    defaultModel: model,
  });
}
