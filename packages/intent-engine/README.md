# @aso/intent-engine

> The heart of ASO: Intent → Plan compilation

## Overview

The Intent Engine translates natural language requests into executable action plans. It's the core "compiler" that makes ASO work.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Natural Lang   │────▶│  Intent Engine  │────▶│  ActionPlan     │
│  "Send email    │     │                 │     │  [fetch, draft, │
│   to John..."   │     │  PlannerService │     │   send]         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Key Components

### PlannerService
The main orchestrator that:
1. Analyzes intent from natural language
2. Resolves tool dependencies
3. Sequences steps into an executable plan

### ToolConfigManager
Tool definition management:
- Loads tools from JSON configuration
- Provides tools to PlannerService
- Implements `IToolProvider` interface

### ProviderAwareToolFilter
Dynamic capability filtering:
- Checks user's connected providers
- Filters tools by availability
- Implements `IToolFilter` interface

## Installation

```bash
npm install @aso/intent-engine
```

## Usage

```typescript
import { PlannerService } from '@aso/intent-engine';
import { GroqLLMClient } from '@aso/adapters';

// Create with interface-based DI
const planner = new PlannerService({
  llmClient: new GroqLLMClient(apiKey),
  toolProvider: toolConfigManager,
  toolFilter: providerAwareFilter,
  maxTokens: 4096
});

// Generate a plan
const plan = await planner.generatePlan(
  "Send an email to john@example.com about the meeting tomorrow"
);

// Stream plan generation
for await (const chunk of planner.streamPlanGeneration(messages)) {
  console.log(chunk);
}
```

## ActionPlan Structure

```typescript
interface ActionPlan {
  steps: ActionStep[];
  analysis?: string;
}

interface ActionStep {
  id: string;
  intent: string;        // Human-readable description
  tool: string;          // Tool to execute
  arguments: any;        // Tool arguments (may contain placeholders)
  status: 'ready' | 'executing' | 'completed' | 'failed';
}
```

## Placeholder Resolution

Steps can reference previous results:

```typescript
// Step 2 references Step 1's result
{
  id: "step2",
  tool: "send_email",
  arguments: {
    to: "{{step1.result.data[0].email}}",  // Resolved at runtime
    body: "..."
  }
}
```

## License

MIT
