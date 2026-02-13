# Building ASO: A Course in Intent Orchestration

> From "AI chatbot" to offline-capable intent infrastructure — the journey and the thinking behind it.

---

## What This Is

This isn't just documentation. It's a guided journey through building an **intent orchestration system** — the kind of system that will outlast the current LLM hype cycle.

The goal: **Teach you to build systems that understand what needs to be done, regardless of how that intent is expressed.**

---

## The Philosophy (Start Here)

Before code, understand the thinking:

1. **[Why Not "AI Agent"?](./00-philosophy/why-not-agent.md)** — The framing problem
2. **[Intent is Universal](./00-philosophy/intent-is-universal.md)** — Conversation is just one modality
3. **[The LLM is a Compiler](./00-philosophy/llm-as-compiler.md)** — Not the product
4. **[The Offline Vision](./00-philosophy/offline-vision.md)** — Where this is going

---

## The Course

### Part 1: Foundations
Build the core abstractions that make everything else possible.

| Module | What You'll Build | Key Insight |
|--------|------------------|-------------|
| [1.1 Interfaces First](./01-foundations/interfaces-first.md) | `@aso/interfaces` | Depend on abstractions, not implementations |
| [1.2 The Tool System](./01-foundations/tool-system.md) | Tool definitions as data | Tools are capabilities, not code |
| [1.3 Provider Abstraction](./01-foundations/provider-abstraction.md) | `IProviderAdapter` | One interface to many services |
| [1.4 Nango Integration](./01-foundations/nango-integration.md) | OAuth + Syncs + Actions | The execution layer |
| [1.5 The Orchestrator](./01-foundations/orchestrator.md) | `ToolOrchestrator` | Plans → Execution |

### Part 2: The Planning Engine
Turn natural language into executable plans.

| Module | What You'll Build | Key Insight |
|--------|------------------|-------------|
| [2.1 Intent Analysis](./02-planning/intent-analysis.md) | `PlannerService` | Parse intent, don't parse commands |
| [2.2 Action Plans](./02-planning/action-plans.md) | `ActionStep[]` | Plans are data structures |
| [2.3 Dependency Resolution](./02-planning/dependencies.md) | Placeholder system | Steps can reference previous results |
| [2.4 Provider-Aware Filtering](./02-planning/provider-filtering.md) | `ProviderAwareToolFilter` | Only plan what user can execute |

### Part 3: Reactive Automation (Cortex)
Event-driven workflows from natural language.

| Module | What You'll Build | Key Insight |
|--------|------------------|-------------|
| [3.1 The Cortex Model](./03-cortex/model.md) | Units, Runs, Events | Automation as compiled rules |
| [3.2 Natural Language Compilation](./03-cortex/compiler.md) | `Compiler` | "When X happens, do Y" → executable |
| [3.3 Event Matching](./03-cortex/matcher.md) | `Matcher` | Which rules fire for this event? |
| [3.4 Runtime Execution](./03-cortex/runtime.md) | `Runtime` | Execute matched rules |
| [3.5 Webhook Integration](./03-cortex/webhooks.md) | `EventShaper` | External events → Cortex events |

### Part 4: Production Patterns
Making it real.

| Module | What You'll Build | Key Insight |
|--------|------------------|-------------|
| [4.1 Observability](./04-production/observability.md) | `@aso/observability` | You can't fix what you can't see |
| [4.2 Streaming](./04-production/streaming.md) | WebSocket patterns | Real-time feedback matters |
| [4.3 Caching Strategy](./04-production/caching.md) | Entity caching | Fast reads, fresh data |
| [4.4 Error Handling](./04-production/errors.md) | Circuit breakers | Graceful degradation |

### Part 5: The Frontier — Offline-First Intent
Where this is all going.

| Module | What You'll Build | Key Insight |
|--------|------------------|-------------|
| [5.1 The Offline Vision](./05-frontier/vision.md) | Architecture overview | LLMs are the bridge, not destination |
| [5.2 Intent Classification](./05-frontier/classifiers.md) | Small models | 90% of intents don't need GPT |
| [5.3 Lookup Tables](./05-frontier/lookup.md) | High-frequency patterns | Some intents are just mappings |
| [5.4 Tiered Routing](./05-frontier/routing.md) | Classifier → Lookup → LLM | Progressive fallback |
| [5.5 Local Inference](./05-frontier/local.md) | ONNX/GGML models | Run anywhere |

---

## How to Use This Course

**If you're learning:**
Start with Philosophy, then go through Parts 1-4 sequentially. Each module builds on the previous.

**If you're contributing:**
Read Philosophy + the Part relevant to what you're working on. The interfaces in Part 1 are the contracts everything else depends on.

**If you're adapting this for your own system:**
Part 1 (Interfaces) and Part 5 (Frontier) are the most transferable. The specific implementations in Parts 2-4 are ASO-specific but the patterns are universal.

---

## The Repo Structure

```
aso/
├── packages/           # Extracted, reusable bundles
│   ├── interfaces/     # @aso/interfaces — Type contracts
│   ├── intent-engine/  # @aso/intent-engine — Planning
│   ├── cortex/         # @aso/cortex — Reactive automation
│   └── observability/  # @aso/observability — Monitoring
├── apps/
│   └── backend/        # Main application
├── docs/
│   └── course/         # This course (you are here)
└── src/                # Legacy monolith (being extracted)
```

---

## A Note on the Journey

This system wasn't designed top-down. It emerged from:
- Hitting walls with "AI agent" framing
- Realizing LLMs are expensive and slow for simple intents
- Wanting automation that works offline
- Needing to support multiple input modalities

The course follows the *logical* structure, not the chronological one. The actual build was messier, with lots of backtracking. That's normal.

---

*Let's build something that lasts.*
