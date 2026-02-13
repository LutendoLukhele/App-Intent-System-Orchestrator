# 1.1 Interfaces First

> Define what you need before you build what you have.

---

## The Problem

You're building an orchestration system. You need:
- An LLM to parse intent
- A way to get tool definitions
- A way to filter tools by user capability
- Connections to external services (Gmail, Salesforce, etc.)

The naive approach:

```typescript
// ❌ Coupled to specific implementations
import Groq from 'groq-sdk';
import { NangoService } from './NangoService';

class PlannerService {
  private groq: Groq;
  private nango: NangoService;
  
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.nango = new NangoService();
  }
}
```

Problems:
- Can't swap Groq for OpenAI without rewriting PlannerService
- Can't test without real API keys
- Can't run offline
- Every change to Nango SDK requires changes here

---

## The Solution: Interfaces

Define what you *need*, not what you *have*:

```typescript
// ✅ Depend on abstractions
interface ILLMClient {
  chat(options: ChatOptions): Promise<ChatResponse>;
  chatStream(options: ChatOptions): AsyncIterable<ChatChunk>;
}

class PlannerService {
  constructor(private llmClient: ILLMClient) {}
}
```

Now PlannerService works with *any* LLM that implements `ILLMClient`.

---

## The Core Interfaces

### ILLMClient — Abstract LLM Interactions

```typescript
// packages/interfaces/src/ILLMClient.ts

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: { type: 'json_object' | 'text' };
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCallRequest[] | null;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ILLMClient {
  readonly defaultModel: string;
  readonly providerName: string;
  
  chat(options: ChatOptions): Promise<ChatResponse>;
  chatStream(options: ChatOptions): AsyncIterable<ChatChunk>;
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
}
```

**Key insight:** The interface captures *what we need from an LLM*, not how any specific LLM works.

---

### IToolProvider — Tool Definition Source

```typescript
// packages/interfaces/src/IToolProvider.ts

export interface ToolConfig {
  name: string;                    // 'send_email', 'fetch_contacts'
  description: string;             // For LLM context
  category: string;                // 'Email', 'CRM', 'Calendar'
  display_name?: string;           // Human-friendly name
  providerConfigKey?: string;      // 'google-mail', 'salesforce-ybzg'
  parameters?: ToolInputSchema;    // JSON Schema for arguments
  source?: 'cache' | 'action';     // Read vs write operation
  cache_model?: string;            // For cache reads, which model to query
}

export interface IToolProvider {
  getAllTools(): ToolConfig[];
  getToolByName(name: string): ToolConfig | undefined;
  getToolsByCategory(category: string): ToolConfig[];
  getToolsByCategories(categories: string[]): ToolConfig[];
  getToolsByProvider(providerKey: string): ToolConfig[];
  getCategories(): string[];
  getProviders(): string[];
  formatToolsForLLM(tools: ToolConfig[]): any[];
  reload?(): Promise<void>;
}
```

**Key insight:** Tools are *data*, not code. The provider gives us definitions; execution is separate.

---

### IToolFilter — Capability Filtering

```typescript
// packages/interfaces/src/IToolFilter.ts

export interface ToolAvailability {
  tool: ToolConfig;
  available: boolean;
  reason?: string;  // "Provider 'salesforce' not connected"
}

export interface FilterContext {
  userId: string;
  sessionId?: string;
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  featureFlags?: Record<string, boolean>;
}

export interface IToolFilter {
  getAvailableToolsForUser(userId: string): Promise<ToolConfig[]>;
  getToolsByCategoriesForUser(userId: string, categories: string[]): Promise<ToolConfig[]>;
  isToolAvailable(userId: string, toolName: string): Promise<ToolAvailability>;
  getAllToolsWithAvailability(userId: string): Promise<ToolAvailability[]>;
  getConnectedProviders(userId: string): Promise<Set<string>>;
  invalidateCache(userId: string): Promise<void>;
}
```

**Key insight:** Don't plan actions the user can't execute. Filter early.

---

### IProviderAdapter — External Service Abstraction

```typescript
// packages/interfaces/src/IProviderAdapter.ts

export interface ConnectionInfo {
  connected: boolean;
  lastSynced?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface FetchOptions {
  model: string;           // 'GmailThread', 'SalesforceContact'
  limit?: number;
  cursor?: string;
  filter?: Record<string, any>;
  modifiedAfter?: Date;
}

export interface FetchResult<T = any> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  syncedAt: Date;
}

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface IProviderAdapter {
  readonly providerKey: string;
  readonly displayName: string;
  readonly adapterType: string;
  
  warmConnection(connectionId: string): Promise<boolean>;
  getConnectionStatus(connectionId: string): Promise<ConnectionInfo>;
  fetchFromCache<T>(connectionId: string, options: FetchOptions): Promise<FetchResult<T>>;
  triggerAction<T>(connectionId: string, action: string, payload: Record<string, any>): Promise<ActionResult<T>>;
  healthCheck(): Promise<boolean>;
}
```

---

## Using Interfaces for Dependency Injection

```typescript
// In your application setup
import { PlannerService } from '@aso/intent-engine';
import { GroqLLMClient } from './adapters/GroqLLMClient';
import { ToolConfigManager } from './services/ToolConfigManager';
import { ProviderAwareToolFilter } from './services/ProviderAwareToolFilter';

// Create implementations
const llmClient = new GroqLLMClient(process.env.GROQ_API_KEY);
const toolProvider = new ToolConfigManager('./config/tool-config.json');
const toolFilter = new ProviderAwareToolFilter(toolProvider, db);

// Inject into PlannerService
const planner = new PlannerService({
  llmClient,      // ILLMClient
  toolProvider,   // IToolProvider
  toolFilter,     // IToolFilter
  maxTokens: 4096
});
```

Now you can:
- Swap `GroqLLMClient` for `OpenAILLMClient` without touching PlannerService
- Use `MockLLMClient` in tests
- Create `TieredLLMClient` that routes through classifiers first (the offline vision!)

---

## Implementing an Interface

Here's how `GroqLLMClient` implements `ILLMClient`:

```typescript
// src/adapters/GroqLLMClient.ts
import Groq from 'groq-sdk';
import { ILLMClient, ChatOptions, ChatResponse } from '@aso/interfaces';

export class GroqLLMClient implements ILLMClient {
  private groq: Groq;
  
  readonly defaultModel = 'llama-3.3-70b-versatile';
  readonly providerName = 'groq';
  
  constructor(apiKey: string) {
    this.groq = new Groq({ apiKey });
  }
  
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.groq.chat.completions.create({
      model: options.model || this.defaultModel,
      messages: options.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.1,
      tools: options.tools,
      response_format: options.responseFormat
    });
    
    const choice = response.choices[0];
    return {
      content: choice?.message?.content || null,
      toolCalls: choice?.message?.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })) || null,
      finishReason: choice?.finish_reason as any,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined
    };
  }
  
  async *chatStream(options: ChatOptions): AsyncIterable<ChatChunk> {
    const stream = await this.groq.chat.completions.create({
      ...this.mapOptions(options),
      stream: true
    });
    
    for await (const chunk of stream) {
      yield {
        content: chunk.choices[0]?.delta?.content || null,
        done: !!chunk.choices[0]?.finish_reason
      };
    }
  }
  
  async healthCheck() {
    try {
      await this.chat({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1
      });
      return { healthy: true };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }
}
```

The implementation knows about Groq SDK details. The interface hides them.

---

## The Package Structure

```
packages/interfaces/
├── src/
│   ├── ILLMClient.ts         # LLM abstraction
│   ├── IToolProvider.ts      # Tool source abstraction
│   ├── IToolFilter.ts        # Capability filtering
│   ├── IProviderAdapter.ts   # External service adapter
│   ├── IProviderGateway.ts   # Multi-provider gateway
│   └── index.ts              # Exports everything
├── package.json
└── tsconfig.json
```

Other packages depend on `@aso/interfaces`:

```json
// packages/intent-engine/package.json
{
  "dependencies": {
    "@aso/interfaces": "workspace:*"
  }
}
```

---

## Exercise

1. Look at `packages/interfaces/src/ILLMClient.ts`
2. Create a mock implementation for testing:

```typescript
class MockLLMClient implements ILLMClient {
  readonly defaultModel = 'mock';
  readonly providerName = 'mock';
  
  private responses: Map<string, string> = new Map();
  
  setResponse(input: string, output: string) {
    this.responses.set(input, output);
  }
  
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const lastMessage = options.messages[options.messages.length - 1];
    const content = this.responses.get(lastMessage.content || '') || '{"plan": []}';
    return { content, toolCalls: null, finishReason: 'stop' };
  }
  
  async *chatStream(options: ChatOptions) {
    const response = await this.chat(options);
    yield { content: response.content, done: true };
  }
  
  async healthCheck() {
    return { healthy: true };
  }
}
```

3. Use it in a test — now your tests are deterministic and fast.

---

*Next: [1.2 The Tool System](./tool-system.md)*
