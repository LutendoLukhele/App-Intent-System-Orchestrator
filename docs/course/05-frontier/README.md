# Part 5: The Frontier — Offline-First Intent

> Moving beyond the LLM bottleneck.

---

## The Vision

ASO today uses LLMs for everything:
- Intent analysis → LLM call
- Plan generation → LLM call
- Semantic conditions → LLM call

This has problems:
- **Latency**: 500ms-2s per LLM call
- **Cost**: $0.001-0.01 per request adds up
- **Dependency**: No LLM = no function
- **Privacy**: User intents sent to third parties

**The Frontier**: Reduce LLM dependency to near-zero for common operations.

---

## Modules

1. **[The Opportunity](./vision.md)** — Why and how we can go offline
2. **[Small Classifiers](./classifiers.md)** — ONNX models for intent detection
3. **[Pattern Lookup](./lookup.md)** — Intent → Plan mapping tables
4. **[Tiered Routing](./routing.md)** — Classifier → Lookup → LLM fallback

---

## The Architecture

### Current (Online)

```
User: "Find John's email"
           │
           ▼
     ┌───────────┐
     │   LLM     │  ← 800ms, $0.002
     │  (Cloud)  │
     └─────┬─────┘
           │
           ▼
    ActionPlan JSON
           │
           ▼
      Execution
```

### Future (Offline-First)

```
User: "Find John's email"
           │
           ▼
    ┌─────────────┐
    │  Classifier │  ← 5ms, local ONNX
    │   (Local)   │
    └──────┬──────┘
           │
    intent: "search_contact"
           │
           ▼
    ┌─────────────┐
    │   Lookup    │  ← 1ms, hash map
    │   Table     │
    └──────┬──────┘
           │
    ActionPlan (template)
           │
           ▼
    ┌─────────────┐
    │   Resolver  │  ← 2ms, extraction
    │  "John" →   │
    │  parameters │
    └──────┬──────┘
           │
      Execution
```

---

## The Opportunity

### Pattern 1: Repeated Intents

Users repeat the same patterns:
- "Find [name]'s email" — 100x/week
- "Schedule meeting with [person]" — 50x/week  
- "Send email to [person] about [topic]" — 200x/week

Why call an LLM each time?

### Pattern 2: Small Intent Space

Business users have ~50 common intents:
- Search contacts/leads/opportunities
- Schedule meetings
- Send emails/messages
- Create tasks
- Update records

This is classifiable by small models.

### Pattern 3: Deterministic Plans

Most intents map to predictable plans:
- "Find X's email" → always: search contact, extract email
- "Schedule meeting" → always: find availability, create event

No LLM creativity needed.

---

## The Components

### 1. Intent Classifier
A small neural network (1-5MB) that maps utterances to intent labels.

Input: "Find John's email"
Output: `{ intent: "contact_search", confidence: 0.94 }`

### 2. Entity Extractor
Small model to extract parameters from utterances.

Input: "Find John's email"
Output: `{ name: "John", field: "email" }`

### 3. Plan Lookup
Hash map from intent → ActionPlan template.

```javascript
{
  "contact_search": {
    "steps": [
      { "tool": "search_contacts", "args": { "query": "{{name}}" } },
      { "tool": "extract_field", "args": { "field": "{{field}}" } }
    ]
  }
}
```

### 4. Template Resolver
Fill in the template with extracted entities.

```javascript
resolve(template, { name: "John", field: "email" })
// → { steps: [{ tool: "search_contacts", args: { query: "John" } }, ...] }
```

---

## When to Fall Back

The LLM remains for:
- **Novel intents**: Things we've never seen
- **Complex reasoning**: Multi-step logic
- **Ambiguity**: Can't determine intent with confidence
- **Creative tasks**: Draft email, summarize

```
Confidence > 0.9  → Use lookup
Confidence 0.7-0.9 → Maybe use LLM to verify
Confidence < 0.7  → Always use LLM
```

---

## Expected Impact

| Metric | Current | Offline-First |
|--------|---------|---------------|
| p50 Latency | 800ms | 15ms |
| p99 Latency | 2500ms | 100ms |
| Cost per request | $0.002 | $0.0001 |
| Works offline | No | Yes |
| Private | No | Yes |

---

## The Journey

1. **Data Collection** (Now)
   - Log all intents with LLM responses
   - Build training dataset

2. **Model Training** (Soon)
   - Train classifier on logged intents
   - Validate accuracy

3. **Lookup Tables** (Soon)
   - Build intent → plan mappings
   - Cover 80% of traffic

4. **Hybrid Routing** (Later)
   - Classifier first, LLM fallback
   - Measure coverage

5. **Full Offline** (Eventually)
   - Edge deployment
   - Zero LLM for common ops

---

*Start: [5.1 The Opportunity](./vision.md)*
