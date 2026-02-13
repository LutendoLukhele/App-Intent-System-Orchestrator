# ASO: App-System-Orchestrator

> **Beyond "AI Agents" — Toward Intent Orchestration Infrastructure**

---

## Preface: Why This Document Exists

This document articulates what this system *is* as a technical achievement—not marketing, not positioning, but the philosophical and architectural truth of what has been built. The purpose is threefold:

1. **Build Trust** — For open-source contributors who need to understand the system's bones
2. **Frame the Future** — Position LLMs as a stepping stone, not the destination
3. **Invite Experimentation** — Define the abstraction boundaries for iteration

The framing of "AI agent" is deliberately set aside. What follows is the reality of an **intent-to-action orchestration engine**.

---

## Part I: Conceptual Foundation

### 1.1 The Core Insight

**Conversation is a single modality. Intent is universal.**

The system accepts intent from:
- Human conversation (WebSocket)
- External system events (webhooks)  
- Scheduled triggers (cron)
- Direct API calls

All routes converge on the same truth: **something needs to be done**. The mechanism for expressing that intent is incidental.

### 1.2 The LLM's True Role

The LLM is a **compiler**, not the product.

| What People Think | What Actually Happens |
|-------------------|----------------------|
| "AI chatbot" | Intent resolution layer |
| "LLM-powered app" | Translation from natural language → structured plan |
| "AI agent" | Orchestration engine with pluggable intent parser |

The LLM translates ambiguous human expression into executable structure. This is the same role as:
- A compiler translating C → machine code
- A query planner translating SQL → execution plan
- A voice assistant translating speech → commands

**The LLM is replaceable.** The orchestration is not.

### 1.3 The Progressive Path

```
Current State                    Near-Term                      Future State
─────────────────────────────────────────────────────────────────────────────
Cloud LLM (Groq)         →      Private GPU + Open Models  →   Specialized Intent Infrastructure
                                                                    │
                                                                    ├── CPU-based intent classifiers
                                                                    ├── Lookup-table routing
                                                                    ├── Smaller fine-tuned models
                                                                    └── Offline-capable inference
```

The goal is **offline-capable, automated, reactive, truly universal orchestration**. LLMs are the bridge, not the destination.

---

## Part II: System Taxonomy

### 2.1 The Orchestration Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTENT LAYER                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Conversation   │  │    Cortex       │  │  Interpretive   │              │
│  │    Service      │  │   (Reactive)    │  │    Search       │              │
│  │                 │  │                 │  │                 │              │
│  │  Real-time      │  │  Event-driven   │  │  Document/      │              │
│  │  WebSocket      │  │  Automation     │  │  Analysis       │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                ▼                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           PLANNING LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      PlannerService                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │    │
│  │  │   Intent    │  │ Dependency  │  │   Step      │                  │    │
│  │  │  Analysis   │→ │  Resolution │→ │ Sequencing  │                  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                          EXECUTION LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ActionLauncherService  │  ToolOrchestrator  │  Cortex Runtime      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                         INTEGRATION LAYER                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Gmail    │  │ Salesforce │  │   Slack    │  │  Calendar  │  ...       │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
│                                                                              │
│                    NangoService (Unified Provider Interface)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Service Inventory

#### Tier 1: Core Orchestration (The Heart)

| Service | Location | Purpose | Naming Convention |
|---------|----------|---------|-------------------|
| `PlannerService` | [src/services/PlannerService.ts](src/services/PlannerService.ts) | Intent → ActionPlan compilation | `*Service` for stateful orchestrators |
| `ActionLauncherService` | [src/action-launcher.service.ts](src/action-launcher.service.ts) | Plan step execution coordinator | |
| `PlanExecutorService` | [src/services/PlanExecutorService.ts](src/services/PlanExecutorService.ts) | Sequential plan execution with dependency resolution | |
| `ToolOrchestrator` | [src/services/tool/ToolOrchestrator.ts](src/services/tool/ToolOrchestrator.ts) | Tool dispatch and result normalization | `*Orchestrator` for multi-tool coordination |

#### Tier 2: Intent Modalities (The Inputs)

| Service | Location | Purpose | Modality |
|---------|----------|---------|----------|
| `ConversationService` | [src/services/conversation/ConversationService.ts](src/services/conversation/ConversationService.ts) | Real-time human dialogue | Interactive |
| `Cortex Compiler` | [src/cortex/compiler.ts](src/cortex/compiler.ts) | NL → structured automation rules | Declarative |
| `Cortex Matcher` | [src/cortex/matcher.ts](src/cortex/matcher.ts) | Event → matching Unit discovery | Reactive |
| `Cortex Runtime` | [src/cortex/runtime.ts](src/cortex/runtime.ts) | Execute matched automation | Reactive |
| `RouterService` | [src/services/router.service.ts](src/services/router.service.ts) | Search mode detection | Interpretive |

#### Tier 3: Tool Management (The Capabilities)

| Service | Location | Purpose |
|---------|----------|---------|
| `ToolConfigManager` | [src/services/tool/ToolConfigManager.ts](src/services/tool/ToolConfigManager.ts) | Tool definitions as data (JSON config) |
| `ProviderAwareToolFilter` | [src/services/tool/ProviderAwareToolFilter.ts](src/services/tool/ProviderAwareToolFilter.ts) | Dynamic tool filtering by user's connected providers |
| `UserToolCacheService` | [src/services/tool/UserToolCacheService.ts](src/services/tool/UserToolCacheService.ts) | Cache available tools per user session |
| `RunManager` | [src/services/tool/RunManager.ts](src/services/tool/RunManager.ts) | Track multi-step execution state |

#### Tier 4: Data Layer (The Memory)

| Service | Location | Purpose |
|---------|----------|---------|
| `DataDependencyService` | [src/services/data/DataDependencyService.ts](src/services/data/DataDependencyService.ts) | Declare data requirements between steps |
| `Resolver` | [src/services/data/Resolver.ts](src/services/data/Resolver.ts) | Resolve `{{step1.result.field}}` placeholders |
| `CRMEntityCacheService` | [src/services/data/CRMEntityCacheService.ts](src/services/data/CRMEntityCacheService.ts) | Entity caching for CRM data |
| `HistoryService` | [src/services/HistoryService.ts](src/services/HistoryService.ts) | Artifact and session history |

#### Tier 5: Stream & Session (The Transport)

| Service | Location | Purpose |
|---------|----------|---------|
| `StreamManager` | [src/services/stream/StreamManager.ts](src/services/stream/StreamManager.ts) | WebSocket chunk streaming |
| `SessionRegistry` | [src/services/SessionRegistry.ts](src/services/SessionRegistry.ts) | Multi-device session tracking |
| `SessionAwareWarmupManager` | [src/services/SessionAwareWarmupManager.ts](src/services/SessionAwareWarmupManager.ts) | Pre-warm connections on session start |

#### Tier 6: Integration (The Hands)

| Service | Location | Purpose |
|---------|----------|---------|
| `NangoService` | [src/services/NangoService.ts](src/services/NangoService.ts) | Unified OAuth + API gateway to external providers |
| Provider Configs | [src/integrations/nango/](src/integrations/nango/) | Provider-specific configurations |

#### Tier 7: Observability (The Nervous System)

| Component | Location | Purpose |
|-----------|----------|---------|
| `telemetry` | [src/monitoring/telemetry.ts](src/monitoring/telemetry.ts) | OpenTelemetry tracing |
| `metrics` | [src/monitoring/metrics.ts](src/monitoring/metrics.ts) | Prometheus metrics |
| `health` | [src/monitoring/health.ts](src/monitoring/health.ts) | Liveness/readiness probes |
| `error-handling` | [src/monitoring/error-handling.ts](src/monitoring/error-handling.ts) | Circuit breakers, retry logic |
| `security` | [src/monitoring/security.ts](src/monitoring/security.ts) | Rate limiting, CORS, headers |

---

## Part III: Naming Conventions

### 3.1 Service Naming

| Suffix | Meaning | Examples |
|--------|---------|----------|
| `*Service` | Stateful orchestrator or domain logic | `PlannerService`, `ConversationService` |
| `*Orchestrator` | Coordinates multiple tools/services | `ToolOrchestrator` |
| `*Manager` | Manages lifecycle or state | `StreamManager`, `RunManager` |
| `*Filter` | Transforms or filters data/capabilities | `ProviderAwareToolFilter` |
| `*Resolver` | Resolves references or dependencies | `Resolver` |
| `*Store` | Persistence layer | `HybridStore`, `RunStore` |
| `*Executor` | Executes a specific type of operation | `CortexToolExecutor` |

### 3.2 Current State Audit

#### ✅ Already Aligned
| Class | Location | Convention |
|-------|----------|------------|
| `PlannerService` | [src/services/PlannerService.ts](src/services/PlannerService.ts) | `*Service` ✓ |
| `ConversationService` | [src/services/conversation/ConversationService.ts](src/services/conversation/ConversationService.ts) | `*Service` ✓ |
| `NangoService` | [src/services/NangoService.ts](src/services/NangoService.ts) | `*Service` ✓ |
| `ToolOrchestrator` | [src/services/tool/ToolOrchestrator.ts](src/services/tool/ToolOrchestrator.ts) | `*Orchestrator` ✓ |
| `StreamManager` | [src/services/stream/StreamManager.ts](src/services/stream/StreamManager.ts) | `*Manager` ✓ |
| `RunManager` | [src/services/tool/RunManager.ts](src/services/tool/RunManager.ts) | `*Manager` ✓ |
| `ToolConfigManager` | [src/services/tool/ToolConfigManager.ts](src/services/tool/ToolConfigManager.ts) | `*Manager` ✓ |
| `ProviderAwareToolFilter` | [src/services/tool/ProviderAwareToolFilter.ts](src/services/tool/ProviderAwareToolFilter.ts) | `*Filter` ✓ |
| `HybridStore` | [src/cortex/store.ts](src/cortex/store.ts) | `*Store` ✓ |
| `CortexToolExecutor` | [src/cortex/tools.ts](src/cortex/tools.ts) | `*Executor` ✓ |

#### ⚠️ Needs Alignment (Future Refactor)
| Current | Proposed | Reason |
|---------|----------|--------|
| `Matcher` | `CortexMatcher` | Namespace for clarity when extracted |
| `Runtime` | `CortexRuntime` | Namespace for clarity when extracted |
| `Resolver` | `PlaceholderResolver` | More descriptive of function |
| `BeatEngine` | `BeatEngineService` | Consistency with `*Service` pattern |
| `groqService` (instance) | `groqService` | Keep as lowercase instance export ✓ |

#### 📁 File Naming Conventions
| Pattern | Current | Standard |
|---------|---------|----------|
| Service files | `*.service.ts` or `*Service.ts` | Standardize to `*Service.ts` |
| Type files | `types.ts` or `*.types.ts` | Keep `types.ts` per module |
| Route files | `*.ts` | Keep simple, e.g., `interpret.ts` |

### 3.3 Cortex Naming (Automation Subsystem)

| Term | Definition |
|------|------------|
| `Unit` | A compiled automation rule (when/if/then) |
| `Run` | A single execution of a Unit |
| `Event` | External trigger from provider webhook |
| `Trigger` | When condition (event or schedule) |
| `Condition` | If filter (eval or semantic) |
| `Action` | Then execution (tool, llm, notify, wait) |

### 3.4 Type Naming Conventions

| Category | Convention | Examples |
|----------|------------|----------|
| Domain entities | PascalCase, noun | `Unit`, `Run`, `Event`, `ActionStep` |
| Request/Response | `*Request`, `*Response` | `InterpretiveResponse` |
| Configuration | `*Config`, `*Settings` | `ToolConfig`, `SearchSettings` |
| Status enums | `*Status` | `RunStatus`, `MessageType` |
| Callbacks | `*Callbacks` | `StreamCallbacks` |

### 3.5 File Structure Convention

```
src/
├── index.ts                    # Application entry, wiring
├── config/                     # Environment configuration
├── cortex/                     # Reactive automation subsystem
│   ├── compiler.ts             # NL → Unit
│   ├── matcher.ts              # Event → Unit matching
│   ├── runtime.ts              # Run execution
│   ├── store.ts                # Persistence
│   ├── tools.ts                # Tool execution for Cortex
│   ├── event-shaper.ts         # Webhook → Event normalization
│   └── types.ts                # Type definitions
├── services/                   # Business logic
│   ├── conversation/           # Interactive modality
│   │   ├── ConversationService.ts
│   │   ├── prompts/            # Prompt templates
│   │   └── types.ts
│   ├── tool/                   # Tool management
│   │   ├── ToolOrchestrator.ts
│   │   ├── ToolConfigManager.ts
│   │   ├── ProviderAwareToolFilter.ts
│   │   ├── RunManager.ts
│   │   └── types.ts
│   ├── data/                   # Data layer
│   │   ├── DataDependencyService.ts
│   │   ├── Resolver.ts
│   │   └── CRMEntityCacheService.ts
│   ├── stream/                 # Transport
│   │   ├── StreamManager.ts
│   │   └── types.ts
│   └── *.ts                    # Domain services
├── routes/                     # HTTP API endpoints
├── monitoring/                 # Observability
├── middleware/                 # Express middleware
└── integrations/               # External provider configs
```

---

## Part IV: Bundling Opportunities

> **Context**: With Docker containerization complete, these bundles represent natural extraction points for modularization, open-source release, or independent deployment.

### 4.0 Pre-Extraction: Decoupling Plan

Before we can extract bundles, we need to address coupling in key services. This is the **critical path** to monorepo structure.

#### 4.0.1 PlannerService Decoupling

**Current State**: Tightly coupled to concrete implementations.

```typescript
// Current: Direct dependency on concrete classes
import { ToolConfigManager } from './tool/ToolConfigManager';
import { ProviderAwareToolFilter } from './tool/ProviderAwareToolFilter';

export class PlannerService extends EventEmitter {
  private toolConfigManager: ToolConfigManager;           // ❌ Concrete
  private providerAwareFilter?: ProviderAwareToolFilter;  // ❌ Concrete
  private groqClient: Groq;                               // ❌ Vendor-specific
}
```

**Target State**: Depend on interfaces, inject implementations.

```typescript
// Target: Interface-based dependencies
import { IToolProvider, IToolFilter, ILLMClient } from '@aso/intent-engine/types';

export interface PlannerConfig {
  llmClient: ILLMClient;          // ✅ Interface (Groq, OpenAI, local)
  toolProvider: IToolProvider;     // ✅ Interface (provides tool definitions)
  toolFilter?: IToolFilter;        // ✅ Interface (filters by user capability)
  maxTokens: number;
  promptTemplate?: string;         // ✅ Injectable prompt
}

export class PlannerService extends EventEmitter {
  constructor(config: PlannerConfig) { /* ... */ }
}
```

**Interfaces to Define** ([src/services/interfaces/](src/services/interfaces/) - new directory):

```typescript
// ILLMClient - Abstract LLM interaction
interface ILLMClient {
  chat(options: ChatOptions): Promise<ChatResponse>;
  chatStream(options: ChatOptions): AsyncIterable<ChatChunk>;
}

// IToolProvider - Abstract tool definition source
interface IToolProvider {
  getAllTools(): ToolConfig[];
  getToolByName(name: string): ToolConfig | undefined;
  getToolsByCategory(category: string): ToolConfig[];
}

// IToolFilter - Abstract user capability filtering
interface IToolFilter {
  getAvailableToolsForUser(userId: string): Promise<ToolConfig[]>;
  getToolsByCategoriesForUser(userId: string, categories: string[]): Promise<ToolConfig[]>;
}
```

**Extraction Steps**:
1. [ ] Create `src/services/interfaces/` directory
2. [ ] Define `ILLMClient`, `IToolProvider`, `IToolFilter` interfaces
3. [ ] Create `GroqLLMClient` implementing `ILLMClient`
4. [ ] Refactor `ToolConfigManager` to implement `IToolProvider`
5. [ ] Refactor `ProviderAwareToolFilter` to implement `IToolFilter`
6. [ ] Update `PlannerService` constructor to accept interfaces
7. [ ] Update `index.ts` to inject concrete implementations

---

#### 4.0.2 NangoService Decoupling

**Current State**: Hardcoded to Nango API, provider-specific logic embedded.

```typescript
// Current: Vendor lock-in
import { Nango } from '@nangohq/node';

export class NangoService {
  private nango: Nango;  // ❌ Vendor-specific SDK
  
  // ❌ Provider switch statements embedded
  switch (providerConfigKey) {
    case 'gmail':
    case 'google-mail':
      pingEndpoint = '/gmail/v1/users/me/profile';
      break;
    case 'salesforce':
      pingEndpoint = '/services/data/v60.0/sobjects';
      break;
  }
}
```

**Target State**: Provider registry with pluggable adapters.

```typescript
// Target: Pluggable provider architecture
interface IProviderAdapter {
  readonly providerKey: string;
  readonly displayName: string;
  
  // Connection management
  warmConnection(connectionId: string): Promise<boolean>;
  getConnectionStatus(connectionId: string): Promise<ConnectionStatus>;
  
  // Data operations
  fetchFromCache(connectionId: string, model: string, options?: FetchOptions): Promise<any>;
  triggerAction(connectionId: string, action: string, payload: any): Promise<any>;
}

interface IProviderGateway {
  registerAdapter(adapter: IProviderAdapter): void;
  getAdapter(providerKey: string): IProviderAdapter | undefined;
  
  // Unified operations (delegate to adapters)
  warmConnection(providerKey: string, connectionId: string): Promise<boolean>;
  fetchFromCache(providerKey: string, connectionId: string, model: string): Promise<any>;
  triggerAction(providerKey: string, connectionId: string, action: string, payload: any): Promise<any>;
}

// Concrete Nango adapter
class NangoProviderAdapter implements IProviderAdapter {
  constructor(
    private nango: Nango,
    readonly providerKey: string,
    private config: ProviderConfig
  ) {}
}

// Concrete gateway
class ProviderGateway implements IProviderGateway {
  private adapters = new Map<string, IProviderAdapter>();
}
```

**Provider Configuration** (move from code to config):

```json
// config/providers.json
{
  "providers": {
    "gmail": {
      "adapter": "nango",
      "displayName": "Gmail",
      "pingEndpoint": "/gmail/v1/users/me/profile",
      "models": ["GmailThread", "GmailMessage"],
      "actions": ["send-email", "reply-email"]
    },
    "salesforce": {
      "adapter": "nango", 
      "displayName": "Salesforce",
      "pingEndpoint": "/services/data/v60.0/sobjects",
      "models": ["SalesforceLead", "SalesforceOpportunity"],
      "actions": ["create-lead", "update-opportunity"]
    }
  }
}
```

**Extraction Steps**:
1. [ ] Define `IProviderAdapter` and `IProviderGateway` interfaces
2. [ ] Create `config/providers.json` with provider metadata
3. [ ] Create `NangoProviderAdapter` implementing `IProviderAdapter`
4. [ ] Create `ProviderGateway` implementing `IProviderGateway`
5. [ ] Refactor `NangoService` to use `ProviderGateway` internally
6. [ ] Remove hardcoded provider switch statements
7. [ ] Update tool configs to reference provider keys (already done ✓)

---

#### 4.0.3 Dependency Graph (Current → Target)

```
CURRENT STATE (Coupled)
─────────────────────────
index.ts
    └── PlannerService
            ├── ToolConfigManager (concrete)
            ├── ProviderAwareToolFilter (concrete)
            │       └── NeonQueryFunction (DB-specific)
            └── Groq (vendor SDK)
    
    └── NangoService
            └── Nango SDK (vendor)
            └── Provider logic (hardcoded)


TARGET STATE (Decoupled)
────────────────────────
index.ts
    └── PlannerService
            ├── IToolProvider ←── ToolConfigManager
            ├── IToolFilter ←── ProviderAwareToolFilter
            │                       └── IDatabase ←── NeonDatabase
            └── ILLMClient ←── GroqLLMClient
                              ←── OpenAILLMClient (future)
                              ←── LocalLLMClient (future)
    
    └── IProviderGateway ←── ProviderGateway
            └── IProviderAdapter[] ←── NangoProviderAdapter (gmail)
                                   ←── NangoProviderAdapter (salesforce)
                                   ←── DirectAPIAdapter (future)
```

---

#### 4.0.4 Implementation Order

| Phase | Task | Effort | Status |
|-------|------|--------|--------|
| **Phase 1** | Create interface definitions | 2-3 hours | ✅ COMPLETE |
| **Phase 2** | Wrap Groq in `ILLMClient` | 2 hours | ✅ COMPLETE |
| **Phase 3** | Add `IToolProvider` to ToolConfigManager | 1 hour | ✅ COMPLETE |
| **Phase 4** | Add `IToolFilter` to ProviderAwareToolFilter | 1 hour | ✅ COMPLETE |
| **Phase 5** | Refactor PlannerService constructor | 2 hours | ✅ COMPLETE |
| **Phase 6** | Create provider config JSON | 1 hour | ✅ COMPLETE |
| **Phase 7** | Create `IProviderAdapter` interface | 1 hour | ✅ COMPLETE |
| **Phase 8** | Create `NangoProviderAdapter` | 3 hours | ✅ COMPLETE |
| **Phase 9** | Create `ProviderGateway` | 2 hours | ✅ COMPLETE |
| **Phase 10** | Refactor NangoService | 3 hours | ✅ COMPLETE |ervice | 3 hours | ⏳ Blocked by 9 |

**Completed Files**:
- `src/services/interfaces/` - All interface definitions (ILLMClient, IToolProvider, IToolFilter, IProviderAdapter, IProviderGateway)
- `src/adapters/llm/GroqLLMClient.ts` - ILLMClient implementation
- `src/adapters/providers/NangoProviderAdapter.ts` - IProviderAdapter implementation
- `src/adapters/ProviderGateway.ts` - IProviderGateway implementation
- `config/providers.json` - Provider configuration
- `src/services/tool/ToolConfigManager.ts` - Now implements IToolProvider
- `src/services/tool/ProviderAwareToolFilter.ts` - Now implements IToolFilter
- `src/services/PlannerService.ts` - Refactored with interface-based DI + backward-compatible legacy constructor
- `src/services/NangoService.ts` - **Refactored to use ProviderGateway internally**

**DECOUPLING COMPLETE** ✅ — Ready for monorepo extraction!

---

### 4.1 Core Bundles (For Open Source)

#### Bundle A: Intent Resolution Engine
**Purpose**: The heart of intent → plan compilation. Portable, framework-agnostic.

```
@aso/intent-engine/
├── src/
│   ├── PlannerService.ts           ← Core planning logic
│   ├── ConversationService.ts       ← Interactive intent parsing
│   ├── ToolConfigManager.ts         ← Tool definitions as data
│   ├── ProviderAwareToolFilter.ts   ← Dynamic capability filtering
│   └── types.ts                     ← ActionStep, ActionPlan
├── package.json
└── README.md
```

**Dependencies**: Groq SDK (swappable), Redis (optional caching)
**Value**: Any app can use this to parse natural language → executable plan

---

#### Bundle B: Reactive Automation (Cortex)
**Purpose**: Complete NL → automation system. Standalone library.

```
@aso/cortex/
├── src/
│   ├── compiler.ts      ← NL → Unit compilation
│   ├── matcher.ts       ← Event → Unit matching
│   ├── runtime.ts       ← Run execution engine
│   ├── store.ts         ← Hybrid Redis/Postgres persistence
│   ├── event-shaper.ts  ← Webhook normalization
│   ├── tools.ts         ← Tool execution adapter
│   └── types.ts         ← Unit, Run, Event, Action types
├── package.json
└── README.md
```

**Dependencies**: Redis, Postgres, LLM client (swappable)
**Value**: Add event-driven automation to any application

---

#### Bundle C: Provider Abstraction
**Purpose**: Unified interface to external systems. OAuth handling, caching, action dispatch.

```
@aso/provider-bridge/
├── src/
│   ├── NangoService.ts          ← Unified API gateway
│   ├── ToolOrchestrator.ts      ← Tool dispatch + result normalization
│   ├── providers/
│   │   ├── gmail.ts
│   │   ├── salesforce.ts
│   │   ├── slack.ts
│   │   └── calendar.ts
│   └── types.ts
├── package.json
└── README.md
```

**Dependencies**: Nango SDK
**Value**: Connect to multiple SaaS providers through single interface

---

#### Bundle D: Observability Stack
**Purpose**: Production-ready observability. Drop-in for any Express app.

```
@aso/observability/
├── src/
│   ├── telemetry.ts           ← OpenTelemetry setup
│   ├── metrics.ts             ← Prometheus metrics
│   ├── health.ts              ← Liveness/readiness
│   ├── logging.ts             ← Structured logging
│   ├── error-handling.ts      ← Circuit breakers, retry
│   └── security.ts            ← Rate limiting, CORS, headers
├── package.json
└── README.md
```

**Dependencies**: OpenTelemetry, Prometheus, Winston
**Value**: Instant production observability for any Node.js service

---

### 4.2 Extraction Matrix

| Component | Extractable? | Dependencies | Effort | Value |
|-----------|--------------|--------------|--------|-------|
| **Cortex** | ✅ Ready | Redis, Postgres, LLM | Medium | High |
| **Observability** | ✅ Ready | None (pure Express) | Low | High |
| **PlannerService** | ⚠️ Needs work | ToolConfigManager, Filter | Medium | High |
| **NangoService** | ⚠️ Coupled | Nango API contract | High | Medium |
| **StreamManager** | ✅ Ready | None (pure WebSocket) | Low | Medium |
| **Resolver** | ✅ Ready | None | Low | Medium |

### 4.3 Extraction Checklist

For each bundle extraction:

- [ ] **Decouple**: Remove imports to other bundles
- [ ] **Abstract**: Replace concrete deps with interfaces
- [ ] **Configure**: Move hardcoded values to config
- [ ] **Type**: Export all public types
- [ ] **Document**: README with usage examples
- [ ] **Test**: Unit tests independent of main app
- [ ] **Package**: Separate package.json with peer deps

### 4.4 Monorepo Structure (Target)

```
aso/
├── packages/
│   ├── core/                    # Main backend (current src/)
│   ├── intent-engine/           # Bundle A
│   ├── cortex/                  # Bundle B
│   ├── provider-bridge/         # Bundle C
│   └── observability/           # Bundle D
├── apps/
│   ├── backend/                 # Express app (uses packages)
│   └── frontend/                # Future: Reference frontend
├── docker-compose.yml
├── package.json                 # Workspace root
└── turbo.json                   # Build orchestration
```

### 4.5 Future Bundle: Offline Intent Core

For the path toward offline/CPU-based intent matching:

```
@aso/intent-core-offline/
├── src/
│   ├── classifiers/           # Trained intent classifiers (ONNX)
│   ├── lookup/                # High-frequency intent → action mappings
│   ├── models/                # Small quantized models (GGML)
│   ├── router.ts              # Route: classifier → lookup → LLM fallback
│   └── types.ts
├── models/                    # Pre-trained model weights
│   ├── intent-classifier.onnx
│   └── slot-filler.onnx
├── package.json
└── README.md
```

**Progressive Migration Path**:
```
Cloud LLM (100%)
     ↓
Classifier + LLM fallback (70% / 30%)
     ↓
Classifier + Lookup + LLM (50% / 40% / 10%)
     ↓
Offline-first + Cloud sync (90% / 10%)
```

### 4.6 Docker Compose Services (Current)

```yaml
services:
  backend:           # Main ASO backend
    build: .
    depends_on:
      - redis
      - postgres
    
  redis:             # Session, cache, pub/sub
    image: redis:alpine
    
  postgres:          # Cortex units, runs, history
    image: postgres:15
```

**Future additions**:
```yaml
  intent-classifier: # Offline intent classification
    build: ./packages/intent-core-offline
    
  vector-db:         # Semantic search (Qdrant/Milvus)
    image: qdrant/qdrant
```

### 4.7 Extraction Roadmap

```
                           ASO EXTRACTION ROADMAP
═══════════════════════════════════════════════════════════════════════════════

PHASE 0: PREPARATION ✅ COMPLETE
────────────────────────────────
   ✅ Docker containerization complete
   ✅ ASO Philosophy documented
   ✅ Interface definitions (Part 4.0.1-4.0.4)

PHASE 1: INTERFACE LAYER ✅ COMPLETE
────────────────────────────────────
   src/services/interfaces/
   ├── ILLMClient.ts           ✅ Abstract LLM
   ├── IToolProvider.ts        ✅ Abstract tool source
   ├── IToolFilter.ts          ✅ Abstract capability filter
   ├── IProviderAdapter.ts     ✅ Abstract provider
   ├── IProviderGateway.ts     ✅ Abstract gateway
   └── index.ts                ✅ Barrel export
   
   config/
   └── providers.json          ✅ Provider configuration

PHASE 2: ADAPTER IMPLEMENTATIONS ✅ COMPLETE
────────────────────────────────────────────
   src/adapters/
   ├── llm/
   │   ├── GroqLLMClient.ts         ✅ ILLMClient
   │   └── index.ts                 ✅
   ├── providers/
   │   ├── NangoProviderAdapter.ts  ✅ IProviderAdapter
   │   └── index.ts                 ✅
   ├── ProviderGateway.ts           ✅ IProviderGateway
   └── index.ts                     ✅

PHASE 3: SERVICE REFACTOR ✅ COMPLETE
────────────────────────────────────
   ✅ PlannerService accepts interfaces (dual constructor)
   ✅ NangoService uses ProviderGateway internally
   ✅ ToolConfigManager implements IToolProvider
   ✅ ProviderAwareToolFilter implements IToolFilter

PHASE 4: MONOREPO STRUCTURE ✅ SCAFFOLDED
──────────────────────────────────────
   aso/
   ├── packages/
   │   ├── interfaces/        ✅ @aso/interfaces (extracted)
   │   ├── intent-engine/     ✅ @aso/intent-engine (scaffolded)
   │   ├── cortex/            ✅ @aso/cortex (scaffolded)
   │   └── observability/     ✅ @aso/observability (scaffolded)
   ├── turbo.json             ✅ Build orchestration
   └── package.workspace.json ✅ Workspace root

PHASE 5: OPEN SOURCE RELEASE (NEXT)
─────────────────────────────
   • GitHub repository setup
   • Package publishing (npm)
   • Documentation site
   • Contribution guidelines

═══════════════════════════════════════════════════════════════════════════════
```

---

## Part V: The Cortex Subsystem — A Case Study

### 5.1 What Makes Cortex Different

| Aspect | Traditional (Zapier/IFTTT) | Cortex |
|--------|---------------------------|--------|
| Rule Creation | Pick trigger → configure → pick action | "Notify me when deals close over $5k" |
| Structure | **Explicit** (user defines) | **Inferred** (LLM compiles) |
| Conditions | Predefined filters | **Semantic** ("sounds urgent?") |
| Ambiguity | Form validation | **Clarification dialogue** |

### 5.2 Cortex Type System

```typescript
// The Unit: A compiled automation rule
interface Unit {
  id: string;
  owner: string;
  name: string;
  
  // Original natural language
  raw: {
    when: string;  // "When I receive an email"
    if?: string;   // "If it sounds urgent"
    then: string;  // "Notify me on Slack"
  };
  
  // Compiled executable form
  when: Trigger;      // EventTrigger | ScheduleTrigger | CompoundTrigger
  if: Condition[];    // EvalCondition | SemanticCondition
  then: Action[];     // ToolAction | LLMAction | NotifyAction | ...
  
  status: 'active' | 'paused' | 'disabled';
}

// The Run: A single execution
interface Run {
  id: string;
  unit_id: string;
  event_id: string;
  user_id: string;
  status: 'pending' | 'running' | 'waiting' | 'success' | 'failed';
  step: number;
  context: Record<string, any>;  // Variables accumulated during execution
}
```

### 5.3 Event Types (Current Integrations)

```typescript
// Gmail
type GmailEventType = 
  | 'email_received' 
  | 'email_sent' 
  | 'email_reply_received';

// Google Calendar
type CalendarEventType = 
  | 'event_created' 
  | 'event_updated' 
  | 'event_deleted' 
  | 'event_starting' 
  | 'event_rsvp_changed';

// Salesforce
type SalesforceEventType = 
  | 'lead_created' 
  | 'lead_stage_changed' 
  | 'lead_converted' 
  | 'opportunity_created' 
  | 'opportunity_stage_changed' 
  | 'opportunity_amount_changed' 
  | 'opportunity_closed_won' 
  | 'opportunity_closed_lost';
```

### 5.4 Action Taxonomy

```typescript
type Action = 
  | LLMAction      // Invoke LLM for summarization, drafting, analysis
  | ToolAction     // Execute tool (slack.send, gmail.send, etc.)
  | NotifyAction   // Send notification to user
  | WaitAction     // Pause execution (24h, 48h, 7d)
  | CheckAction    // Conditional branch
  | FetchAction    // Retrieve data
  | LookupAction   // Search in collection
  | LogAction;     // Debug logging
```

---

## Part VI: The Plan Structure — Data Flow

### 6.1 ActionStep Definition

```typescript
interface ActionStep {
  id: string;           // Unique identifier
  intent: string;       // Human-readable description
  tool: string;         // Tool to execute
  arguments: any;       // Tool arguments (may contain placeholders)
  status: 'ready' | 'executing' | 'completed' | 'failed';
  stepNumber?: number;
  totalSteps?: number;
}
```

### 6.2 Placeholder Resolution

Arguments can reference previous step results:

```typescript
// Step 1: Fetch emails
{
  id: "step1",
  tool: "fetch_emails",
  arguments: { query: "from:john@example.com" }
}

// Step 2: Reply to sender (uses step1 result)
{
  id: "step2",
  tool: "send_email",
  arguments: {
    to: "{{step1.result.data[0].from.email}}",  // Resolved at runtime
    subject: "Re: {{step1.result.data[0].subject}}",
    body: "..."
  }
}
```

The `Resolver` service handles placeholder expansion before execution.

---

## Part VII: Integration Contracts

> **Goal**: Define the backend as a pluggable module. Any frontend or orchestrator can connect via these documented protocols.

### 7.1 WebSocket Protocol (Real-Time Conversation)

#### Connection
```
ws://{host}/ws?sessionId={sessionId}&token={firebaseToken}
```

#### Client → Server Messages

```typescript
// User sends a message
interface UserMessage {
  type: 'user_message';
  sessionId: string;
  content: string;
  messageId?: string;
}

// User confirms an action
interface ExecuteAction {
  type: 'execute_action';
  sessionId: string;
  actionId: string;
  payload?: any;
}

// User cancels current operation
interface Cancel {
  type: 'cancel';
  sessionId: string;
}

// Keep-alive
interface Ping {
  type: 'ping';
  sessionId: string;
}
```

#### Server → Client Messages (StreamChunk)

```typescript
interface StreamChunk {
  type: StreamChunkType;
  content?: any;
  messageId?: string;
  isFinal?: boolean;
  streamType?: string;
}

type StreamChunkType =
  // Content streaming
  | 'content'                        // Raw text content
  | 'conversational_text_segment'    // Parsed markdown segment
  | 'parsed_markdown_segment'        // With styling info
  
  // Planning
  | 'plan_generated'                 // ActionPlan overview
  | 'planner_status'                 // Planner progress update
  
  // Tool execution
  | 'tool_call'                      // Tool being invoked
  | 'tool_result'                    // Tool execution result
  | 'tool_status_update'             // Progress during execution
  | 'tool_status'                    // Final tool status
  
  // User interaction required
  | 'parameter_collection_required'  // Missing parameters
  | 'action_confirmation_required'   // Needs user approval
  | 'action_executed'                // Action completed
  
  // Interpretive search
  | 'interpret_event'                // Structured search event
  
  // System
  | 'error'                          // Error occurred
  | 'stream_end';                    // Stream complete
```

#### Plan Generated Payload
```typescript
interface PlanGeneratedChunk {
  type: 'plan_generated';
  messageId: string;
  content: {
    planOverview: Array<{
      id: string;
      intent: string;
      tool: string;
      status: 'ready' | 'conditional';
    }>;
    analysis?: string;
  };
}
```

### 7.2 HTTP REST API (Routes)

#### Authentication
All routes require Firebase JWT in `Authorization: Bearer {token}` header.

#### Interpret API (Search/Analysis)

```
POST /api/interpret
Content-Type: application/json

{
  "query": string,
  "documentIds"?: string[],
  "enableArtifacts"?: boolean,
  "searchSettings"?: SearchSettings
}

Response: InterpretiveResponse
```

```
GET /api/interpret/stream?query={query}&documentIds={json}&enableArtifacts={bool}
Accept: text/event-stream

SSE Stream of interpret events
```

#### Documents API

```
GET    /api/documents                    # List documents
POST   /api/documents                    # Upload document
GET    /api/documents/:id                # Get document
DELETE /api/documents/:id                # Delete document
```

#### Sessions API

```
GET    /api/sessions                     # List sessions
POST   /api/sessions                     # Create session
GET    /api/sessions/:id                 # Get session
DELETE /api/sessions/:id                 # Delete session
GET    /api/sessions/:id/messages        # Get session messages
```

#### Artifacts API

```
GET    /api/artifacts                    # List artifacts
GET    /api/artifacts/:id                # Get artifact
POST   /api/artifacts                    # Create artifact
DELETE /api/artifacts/:id                # Delete artifact
```

#### History API

```
GET    /api/history                      # Get history items
POST   /api/history                      # Add history item
DELETE /api/history/:id                  # Delete history item
```

#### Export API

```
POST   /api/export/pdf                   # Export to PDF
POST   /api/export/markdown              # Export to Markdown
```

### 7.3 Webhook Contract (Cortex Events)

#### Incoming Webhook Endpoint
```
POST /webhooks/cortex/:provider
Content-Type: application/json

Provider-specific payload (from Nango)
```

#### Response
```
202 Accepted
{ "status": "processing", "event_id": "{uuid}" }
```

#### Normalized Event (Internal)

```typescript
interface Event<T = any> {
  id: string;                    // UUID
  source: 'gmail' | 'google-calendar' | 'salesforce';
  event: EventType;              // e.g., 'email_received', 'opportunity_closed_won'
  timestamp: string;             // ISO 8601
  user_id: string;               // Owner of the connection
  payload: T;                    // Provider-specific data
  meta?: {
    dedupe_key?: string;         // For deduplication
  };
}
```

#### Supported Event Types

```typescript
// Gmail
type GmailEventType = 
  | 'email_received' 
  | 'email_sent' 
  | 'email_reply_received';

// Google Calendar
type CalendarEventType = 
  | 'event_created' 
  | 'event_updated' 
  | 'event_deleted' 
  | 'event_starting' 
  | 'event_rsvp_changed';

// Salesforce
type SalesforceEventType = 
  | 'lead_created' 
  | 'lead_stage_changed' 
  | 'lead_converted' 
  | 'opportunity_created' 
  | 'opportunity_stage_changed' 
  | 'opportunity_amount_changed' 
  | 'opportunity_closed_won' 
  | 'opportunity_closed_lost';
```

### 7.4 Tool Definition Schema

Tools are defined as JSON configuration, not code. This enables:
- Dynamic tool filtering per user
- Easy addition of new capabilities
- Clear contract for frontend display

```json
{
  "name": "fetch_entity",
  "description": "Fetch CRM entities by type and optional filters",
  "displayName": "Fetch CRM Entity",
  "category": "CRM",
  
  "source": "cache",              // 'cache' (fast read) | 'action' (write)
  "cache_model": "SalesforceLead",
  "providerConfigKey": "salesforce-ybzg",
  
  "parameters": {
    "type": "object",
    "properties": {
      "entity_type": {
        "type": "string",
        "enum": ["lead", "opportunity", "account", "contact", "case"],
        "description": "Type of CRM entity to fetch"
      },
      "filters": {
        "type": "object",
        "description": "Optional filters to apply"
      },
      "limit": {
        "type": "number",
        "default": 10,
        "description": "Maximum number of results"
      }
    },
    "required": ["entity_type"]
  }
}
```

### 7.5 Error Response Contract

All errors follow a consistent structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable code
    message: string;        // Human-readable message
    details?: any;          // Additional context
    requestId?: string;     // For tracing
  };
}

// Common error codes
type ErrorCode =
  | 'UNAUTHORIZED'           // 401 - Invalid/missing token
  | 'FORBIDDEN'              // 403 - Insufficient permissions
  | 'NOT_FOUND'              // 404 - Resource not found
  | 'VALIDATION_ERROR'       // 400 - Invalid request
  | 'RATE_LIMITED'           // 429 - Too many requests
  | 'PROVIDER_ERROR'         // 502 - External provider failed
  | 'INTERNAL_ERROR';        // 500 - Server error
```

### 7.6 Health & Metrics Endpoints

```
GET /health/live              # Kubernetes liveness probe
GET /health/ready             # Kubernetes readiness probe
GET /metrics                  # Prometheus metrics
```

### 7.7 Frontend Integration Checklist

For any frontend to integrate with this backend:

- [ ] **Authentication**: Implement Firebase Auth, pass JWT in headers
- [ ] **WebSocket**: Connect to `/ws` with sessionId and token
- [ ] **Handle StreamChunks**: Parse all `StreamChunkType` variants
- [ ] **Plan Display**: Render `plan_generated` as step overview
- [ ] **Tool Status**: Show progress via `tool_status_update`
- [ ] **Error Handling**: Parse `ErrorResponse` structure
- [ ] **Confirmation Flow**: Handle `action_confirmation_required`
- [ ] **SSE Option**: Use `/api/interpret/stream` for search if WS not available

---

## Part VIII: Future Directions

### 8.1 The Offline Vision

```
┌─────────────────────────────────────────────────────────────┐
│                    OFFLINE ASO                               │
│                                                              │
│  ┌─────────────┐                                            │
│  │   Intent    │                                            │
│  │  Classifier │  ← Small model (< 100MB)                   │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Lookup    │────▶│    Local    │────▶│   Offline   │   │
│  │    Table    │     │   Actions   │     │    Queue    │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                    │         │
│                                                    ▼         │
│                                           ┌─────────────┐   │
│                                           │  Sync when  │   │
│                                           │   online    │   │
│                                           └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Beyond LLM: Intent Infrastructure

| Current | Future |
|---------|--------|
| Groq LLM for all intent parsing | Tiered routing: classifier → lookup → LLM |
| Cloud-dependent | Offline-first with sync |
| Single model | Ensemble of specialized models |
| Semantic conditions via LLM | Trained classifiers for common patterns |

### 8.3 The Research Invitation

Open sourcing enables exploration of:

1. **Collection** — Data patterns from orchestration
2. **Curation** — Rule refinement based on outcomes
3. **Mystery** — Emergent behaviors beyond explicit automation

This is a **platform for orchestration research**, not just an app.

---

## Part IX: Open Source Considerations

### 9.1 What to Publish

| Include | Reason |
|---------|--------|
| Core orchestration (`src/services/`, `src/cortex/`) | The valuable abstraction |
| Monitoring stack (`src/monitoring/`) | Production-ready observability |
| Type definitions | Clear contracts |
| Documentation | This document, API specs |

### 9.2 What to Parameterize

| Extract to Config | Current Location |
|-------------------|------------------|
| Provider keys | Hardcoded in `ToolConfigManager` |
| Model names | Constants in services |
| API endpoints | Scattered |

### 9.3 License Considerations

| License | Implication |
|---------|-------------|
| MIT | Maximum adoption, no copyleft |
| Apache 2.0 | Enterprise-friendly, patent grant |
| AGPL | Requires derivative works to open source |

---

## Appendix A: Service Dependency Graph

```
                         ┌──────────────────┐
                         │     index.ts     │
                         │  (Application)   │
                         └────────┬─────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Conversation  │       │    Cortex       │       │   Interpretive  │
│   Service     │       │   Subsystem     │       │    Services     │
└───────┬───────┘       └────────┬────────┘       └────────┬────────┘
        │                        │                         │
        └────────────────────────┼─────────────────────────┘
                                 │
                                 ▼
                       ┌─────────────────┐
                       │  PlannerService │
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ ToolOrchestrator│
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  NangoService   │
                       └────────┬────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Gmail      │     │   Salesforce    │     │     Slack       │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **ASO** | App-System-Orchestrator — this system's identity |
| **Intent** | The understanding of what needs to be done, regardless of input modality |
| **Plan** | Ordered sequence of ActionSteps with dependencies |
| **Unit** | A Cortex automation rule (compiled from natural language) |
| **Run** | A single execution instance of a Unit |
| **Tool** | An atomic capability (send email, create lead, etc.) |
| **Provider** | An external system (Gmail, Salesforce, Slack) |
| **Modality** | A channel for expressing intent (conversation, webhook, schedule) |

---

*This document is the foundation for understanding ASO. It will evolve as the system does.*

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Status**: Living Document
