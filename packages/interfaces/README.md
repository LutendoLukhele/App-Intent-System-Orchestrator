# @aso/interfaces

> Shared interfaces and types for ASO (App-System-Orchestrator)

## Overview

This package contains the core interface definitions that enable ASO's pluggable architecture. By depending on interfaces rather than concrete implementations, services remain decoupled and testable.

## Interfaces

### LLM Layer
- **`ILLMClient`** - Abstract LLM interactions (Groq, OpenAI, local models)
- `ChatOptions`, `ChatResponse`, `ChatChunk` - Request/response types

### Tool Layer
- **`IToolProvider`** - Abstract tool definition source
- **`IToolFilter`** - Abstract user capability filtering
- `ToolConfig`, `ToolAvailability` - Tool configuration types

### Provider Layer
- **`IProviderAdapter`** - Abstract OAuth provider operations
- **`IProviderGateway`** - Unified gateway for all providers
- `ConnectionStatus`, `FetchOptions`, `ActionResult` - Operation types

## Installation

```bash
npm install @aso/interfaces
```

## Usage

```typescript
import { 
  ILLMClient, 
  IToolProvider, 
  IProviderGateway,
  ChatOptions,
  ToolConfig 
} from '@aso/interfaces';

// Implement interfaces for your use case
class MyLLMClient implements ILLMClient {
  // ...
}

// Inject into services
const planner = new PlannerService({
  llmClient: myLLMClient,
  toolProvider: myToolProvider
});
```

## Design Philosophy

ASO follows the Dependency Inversion Principle:

```
High-level modules (PlannerService, ConversationService)
         │
         │ depend on
         ▼
    Abstractions (ILLMClient, IToolProvider)
         │
         │ implemented by
         ▼
Low-level modules (GroqLLMClient, ToolConfigManager)
```

This enables:
- **Testability** - Mock interfaces in tests
- **Flexibility** - Swap implementations without changing consumers
- **Offline capability** - Replace cloud LLM with local model
- **Multi-vendor** - Support Groq, OpenAI, Anthropic simultaneously

## License

MIT
