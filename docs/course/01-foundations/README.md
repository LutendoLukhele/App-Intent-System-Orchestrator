# Part 1: Foundations

> Build the abstractions that make everything else possible.

The first rule of maintainable systems: **depend on abstractions, not implementations.**

Before writing any orchestration logic, we define the contracts. These interfaces are the foundation everything else builds on.

---

## Modules

1. **[Interfaces First](./interfaces-first.md)** — Why we start with types
2. **[The Tool System](./tool-system.md)** — Capabilities as data
3. **[Provider Abstraction](./provider-abstraction.md)** — One interface, many services
4. **[Nango Integration](./nango-integration.md)** — OAuth, syncs, and actions
5. **[The Orchestrator](./orchestrator.md)** — From plan to execution

---

## What You'll Build

By the end of Part 1, you'll have:

```
packages/interfaces/
├── src/
│   ├── ILLMClient.ts        # Abstract LLM interactions
│   ├── IToolProvider.ts     # Tool definition source
│   ├── IToolFilter.ts       # Capability filtering
│   ├── IProviderAdapter.ts  # External service adapter
│   └── IProviderGateway.ts  # Multi-provider gateway

src/services/
├── ToolConfigManager.ts     # Load tools from JSON
├── ToolOrchestrator.ts      # Execute tools against providers
└── NangoService.ts          # Nango SDK wrapper
```

These enable:
- Swapping LLM providers without changing orchestration code
- Loading tools from JSON, database, or API
- Filtering tools by user's connected providers
- Adding new integrations without touching core logic
- Executing tools against real external APIs

---

## The Full Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Request                              │
│              "Send email to John about the meeting"              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PlannerService                              │
│  ILLMClient + IToolProvider + IToolFilter                        │
│  → Generates ActionPlan with steps                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ToolOrchestrator                             │
│  Takes each ActionStep and executes it                           │
│  → Resolves placeholders                                         │
│  → Routes to correct provider                                    │
│  → Handles cache vs action                                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NangoService                                │
│  → OAuth token management                                        │
│  → Sync scripts (fetch from external APIs → cache)               │
│  → Action scripts (execute mutations)                            │
│  → Proxy requests (direct API calls)                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External APIs                                 │
│  Gmail • Salesforce • Google Calendar • Slack • Notion           │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Dependency Rule

```
┌─────────────────────────────────────────┐
│           High-Level Policy            │
│     (PlannerService, Runtime, etc.)    │
│                  │                      │
│                  │ depends on           │
│                  ▼                      │
│            Interfaces                   │
│   (ILLMClient, IToolProvider, etc.)    │
│                  ▲                      │
│                  │ implements           │
│                  │                      │
│          Low-Level Details             │
│ (GroqLLMClient, NangoService, etc.)    │
└─────────────────────────────────────────┘
```

High-level policy (orchestration) depends on interfaces.
Low-level details (specific providers) implement interfaces.

**The interfaces are owned by the high-level layer.** This is the Dependency Inversion Principle.

---

*Start: [1.1 Interfaces First](./interfaces-first.md)*
