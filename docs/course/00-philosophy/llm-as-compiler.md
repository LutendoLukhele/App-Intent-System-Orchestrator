# The LLM is a Compiler

> It translates. It doesn't orchestrate.

---

## What Compilers Do

A compiler:
1. Takes input in one language (source)
2. Produces output in another language (target)
3. The output is what actually runs

```
C code → Compiler → Machine code
               ↓
        (this runs)
```

The compiler is a *tool*. The program is what matters.

---

## What the LLM Does in ASO

```
"Send an email to John about the meeting tomorrow"
                    ↓
               LLM (translation)
                    ↓
{
  "plan": [
    {
      "id": "step_1",
      "intent": "Fetch John's contact information",
      "tool": "fetch_contacts",
      "arguments": { "query": "John" }
    },
    {
      "id": "step_2", 
      "intent": "Send the email",
      "tool": "send_email",
      "arguments": {
        "to": "{{step_1.result.email}}",
        "subject": "Meeting Tomorrow",
        "body": "Hi John, ..."
      }
    }
  ]
}
```

The LLM translated natural language → structured plan.

**The LLM doesn't send the email.** The orchestrator does.

---

## Why This Framing Matters

### For Architecture

If LLM = orchestrator:
- Every action goes through LLM
- LLM latency affects everything
- LLM cost scales with usage
- LLM unavailable = system down

If LLM = compiler:
- LLM only needed for translation step
- Orchestration is separate (fast, predictable)
- LLM can be bypassed for known patterns
- Offline operation becomes possible

### For Testing

If LLM = orchestrator:
- Tests are flaky (LLM outputs vary)
- Hard to test edge cases
- Mocking is complex

If LLM = compiler:
- Test the compiled plans directly
- Deterministic execution
- LLM is mocked at the translation boundary

### For Evolution

If LLM = orchestrator:
- Stuck with LLM forever
- Can't optimize for common cases
- Privacy concerns (everything goes to cloud)

If LLM = compiler:
- Can replace with smaller models
- Can use classifiers for common intents
- Can run locally

---

## The Compilation Boundary

In ASO, the boundary is clear:

```
┌─────────────────────────────────────────┐
│           TRANSLATION LAYER             │
│                                         │
│  Natural Language → PlannerService      │
│                         ↓               │
│                    ActionPlan[]         │
│                                         │
│  (This is where LLM lives)              │
└─────────────────┬───────────────────────┘
                  │
                  │ ActionPlan (data structure)
                  │
┌─────────────────▼───────────────────────┐
│           EXECUTION LAYER               │
│                                         │
│  ActionPlan → ToolOrchestrator → APIs   │
│                                         │
│  (No LLM here - just execution)         │
└─────────────────────────────────────────┘
```

Once you have an `ActionPlan`, you don't need the LLM anymore. Execution is mechanical.

---

## Swappable Compilers

Just like you can swap GCC for Clang:

```typescript
// Today: Cloud LLM
const planner = new PlannerService({
  llmClient: new GroqLLMClient(apiKey),
  ...
});

// Tomorrow: Local model
const planner = new PlannerService({
  llmClient: new OllamaLLMClient('http://localhost:11434'),
  ...
});

// Future: Hybrid
const planner = new PlannerService({
  llmClient: new TieredLLMClient({
    classifier: classifierModel,     // Fast, local
    lookup: intentLookupTable,       // Instant
    fallback: cloudLLMClient,        // When needed
  }),
  ...
});
```

The `PlannerService` doesn't care. It just needs something that implements `ILLMClient`.

---

## The Interface

```typescript
interface ILLMClient {
  chat(options: ChatOptions): Promise<ChatResponse>;
  chatStream(options: ChatOptions): AsyncIterable<ChatChunk>;
  healthCheck(): Promise<{ healthy: boolean }>;
  
  readonly defaultModel: string;
  readonly providerName: string;
}
```

Groq, OpenAI, Anthropic, Ollama, a lookup table — anything can implement this.

---

## Exercise

Look at where your system uses the LLM. For each usage:

1. Is it translation (input → structured output)?
2. Is it generation (creating content)?
3. Is it orchestration (deciding what to do next)?

For #1, you can probably replace with smaller/faster models.
For #2, you might need large models, but this isn't orchestration.
For #3, you should probably restructure.

The goal: Make the LLM a replaceable component, not the center of your architecture.

---

*Next: [The Offline Vision](offline-vision.md)*
