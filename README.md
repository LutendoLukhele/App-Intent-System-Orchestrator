# ASO — App-System-Orchestrator

> Intent orchestration infrastructure. Not an "AI agent"  Towards a system that understands what needs to be done.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

---

## What is ASO?

ASO is an **intent-to-action orchestration engine**. It takes requests from multiple sources — conversation, webhooks, schedules — and turns them into executable plans.

```
"Send an email to John about tomorrow's meeting"
                    ↓
          Intent Analysis (LLM)
                    ↓
    ActionPlan: [fetch_contacts, draft_email, send_email]
                    ↓
              Execution
```

**The key insight:** The LLM is a compiler, not the product. It translates ambiguous human intent into structured plans. This means:
- The orchestration logic is **LLM-agnostic**
- You can progressively replace LLM calls with classifiers
- The system can work **offline** for common intents

## Quick Start

```bash
# Clone
git clone https://github.com/LutendoLukhele/aso.git
cd aso

# Install
npm install

# Build all packages
npm run build

# Run (needs .env with GROQ_API_KEY, DATABASE_URL, etc.)
npm run dev -w @aso/backend
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      INTENT LAYER                           │
│   Conversation │ Webhooks (Cortex) │ Scheduled │ API        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    PLANNING LAYER                           │
│              PlannerService → ActionPlan[]                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   EXECUTION LAYER                           │
│         ToolOrchestrator → Provider Adapters                │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  INTEGRATION LAYER                          │
│          Gmail │ Salesforce │ Calendar │ Slack │ ...        │
└─────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@aso/interfaces` | Core type contracts — depend on these |
| `@aso/intent-engine` | Natural language → ActionPlan compilation |
| `@aso/cortex` | Event-driven automation ("when X, do Y") |
| `@aso/observability` | Telemetry, metrics, health checks |

## The Course

Want to understand how this works and build your own?

**[→ Start the Course](docs/course/README.md)**

The course walks through:
1. **Philosophy** — Why "intent orchestration" not "AI agent"
2. **Foundations** — Interfaces, tools, providers
3. **Planning** — How intent becomes action plans
4. **Cortex** — Reactive automation from natural language
5. **Frontier** — Offline-first, LLM-free intent resolution

## The Vision


```
Today                          Tomorrow
─────────────────────────────────────────────
Cloud LLM (100%)    →    Classifier + Lookup + LLM fallback
Online-only         →    Offline-first with sync
Single model        →    Tiered routing by intent complexity
```

The goal is **universal intent infrastructure** — systems that understand what needs to be done regardless of:
- How the request was expressed (voice, text, event, schedule)
- Whether you're online or offline
- Which specific AI model is available

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Key principle: **Interfaces first.** If you're adding a new capability, define the interface in `@aso/interfaces` before implementing.

## License

MIT — See [LICENSE.md](LICENSE.md)

---

*Built by [Lutendo Lukhele](https://github.com/YOUR_USERNAME) as an exploration of what comes after "AI agents".*
