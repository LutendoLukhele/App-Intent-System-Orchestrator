# The Offline Vision

> LLMs are the bridge, not the destination.

---

## The Problem with Cloud LLMs

Every time someone says something to your system:
1. Request goes to cloud (latency)
2. Cloud processes (cost)
3. Response comes back (more latency)
4. If cloud is down, you're down

For complex queries, this is fine. But most intents are simple:

- "Send email to John" → `send_email(to: john)`
- "Show my calendar" → `fetch_calendar()`
- "Create a meeting tomorrow at 3pm" → `create_event(date: tomorrow, time: 3pm)`

Do you really need GPT-4 to figure out "send email to John" means send an email to John?

---

## The Distribution of Intent Complexity

```
Frequency
    │
    │  ████████████████  Simple (lookup table)
    │  ██████████        Medium (classifier)
    │  ████              Complex (small LLM)
    │  ██                Very complex (large LLM)
    │  █                 Ambiguous (needs clarification)
    └─────────────────────────────────────────
                      Complexity
```

Most intents are simple. A minority need real reasoning.

**Why use a 70B parameter model for everything?**

---

## Tiered Resolution

The vision for ASO:

```
Intent arrives
      │
      ▼
┌─────────────────┐
│  Lookup Table   │  ← Instant, no model
│  (high-freq)    │     "send email" → send_email
└────────┬────────┘
         │ miss
         ▼
┌─────────────────┐
│   Classifier    │  ← Fast, tiny model (<100MB)
│   (patterns)    │     Categorize into known intents
└────────┬────────┘
         │ low confidence
         ▼
┌─────────────────┐
│   Small LLM     │  ← Local, medium model
│   (reasoning)   │     Handle novel combinations
└────────┬────────┘
         │ needs clarification
         ▼
┌─────────────────┐
│   Large LLM     │  ← Cloud, last resort
│   (complex)     │     Truly ambiguous cases
└─────────────────┘
```

As you go down: more latency, more cost, but more capability.

**90% of requests should resolve in the top two layers.**

---

## Building the Lookup Table

Over time, you observe patterns:

```typescript
// What users say → What they mean
const intentPatterns = {
  'send email to {person}': { tool: 'send_email', args: { to: '{person}' } },
  'email {person}': { tool: 'send_email', args: { to: '{person}' } },
  'show my calendar': { tool: 'fetch_calendar' },
  'what\'s on my calendar': { tool: 'fetch_calendar' },
  'create meeting with {person}': { tool: 'create_event', args: { attendees: ['{person}'] } },
  // ... hundreds more
};
```

No model needed. Pattern matching + slot filling.

---

## Training the Classifier

For intents that don't match patterns exactly:

1. **Collect data**: Log all (input, resolved_intent) pairs
2. **Train classifier**: Small model that predicts intent category
3. **Deploy locally**: ONNX runtime, ~50ms inference

```python
# Training data (from production logs)
[
  ("please send a message to John about the project", "send_email"),
  ("can you shoot an email over to the team", "send_email"),
  ("what meetings do I have", "fetch_calendar"),
  ("schedule a call with Sarah", "create_event"),
]

# Classifier output
model.predict("fire off an email to Mike") → "send_email" (confidence: 0.94)
```

High confidence? Skip the LLM entirely.

---

## The Offline Capability

With lookup tables and local classifiers:

```
┌─────────────────────────────────────────┐
│              OFFLINE MODE               │
│                                         │
│  ✓ Lookup table resolution              │
│  ✓ Classifier-based intent detection    │
│  ✓ Local action execution (if possible) │
│  ✓ Queue for sync when online           │
│                                         │
│  ✗ Complex reasoning                    │
│  ✗ Ambiguous intent resolution          │
│  ✗ Actions requiring cloud APIs         │
└─────────────────────────────────────────┘
```

You can handle most requests without any network.

---

## The Privacy Benefit

With local resolution:
- User intent never leaves device
- No cloud provider sees your queries
- Audit-friendly for enterprises
- Compliance-friendly for regulated industries

---

## The Path There

We're not there yet. Current ASO uses cloud LLMs for everything. But the architecture is ready:

1. **ILLMClient interface** — Swappable LLM backend
2. **ActionPlan as data** — Plans are portable
3. **Tools as configuration** — Capability is declarative
4. **Cortex compilation** — Rules are static once compiled

To add tiered resolution:
1. Add lookup table layer (no model)
2. Train intent classifier on production data
3. Create `TieredLLMClient` that routes through layers
4. Swap it in via `ILLMClient`

The orchestration doesn't change. Only the "compiler" does.

---

## The Research Invitation

Open questions:
- What's the minimum classifier size for 90% accuracy?
- How do you handle slot filling locally?
- What's the right confidence threshold for LLM fallback?
- How do you sync offline actions when reconnected?

This is where the exploration continues. If you're interested in this frontier, this is where to contribute.

---

## The Endgame

```
2024: Cloud LLM for everything
2025: Cloud LLM + local classifier
2026: Local-first, cloud fallback
2027: Fully offline for common workflows
2028: ???
```

**The goal isn't "no LLMs." The goal is "LLMs where needed."**

Most of what we do is predictable. Let's only use expensive, slow, cloud-dependent AI for the parts that actually need it.

---

*Next: [Part 1 - Foundations](../01-foundations/README.md)*
