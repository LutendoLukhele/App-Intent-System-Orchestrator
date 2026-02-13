# 5.4 Tiered Routing

> Classifier → Lookup → LLM fallback.

---

## The Router

Combine classifier, lookup, and LLM into a single interface:

```typescript
// packages/intent-engine/src/HybridPlanner.ts

export class HybridPlanner {
  constructor(
    private classifier: IntentClassifier,
    private extractor: EntityExtractor,
    private registry: PlanRegistry,
    private resolver: TemplateResolver,
    private llmPlanner: PlannerService,
    private config: HybridConfig
  ) {}
  
  async plan(input: string, context: PlannerContext): Promise<PlanResult> {
    // Tier 1: Try classifier
    const classification = await this.classifier.classify(input);
    
    if (classification.confidence >= this.config.highConfidenceThreshold) {
      const result = await this.tryLookup(classification.intent, input, context);
      if (result) {
        return {
          ...result,
          source: 'lookup',
          confidence: classification.confidence
        };
      }
    }
    
    // Tier 2: Medium confidence - verify with LLM
    if (classification.confidence >= this.config.mediumConfidenceThreshold) {
      const verified = await this.verifyWithLLM(classification, input);
      if (verified) {
        const result = await this.tryLookup(classification.intent, input, context);
        if (result) {
          return {
            ...result,
            source: 'lookup-verified',
            confidence: classification.confidence
          };
        }
      }
    }
    
    // Tier 3: Fall back to full LLM planning
    const llmResult = await this.llmPlanner.generatePlan(input, context);
    
    // Log for future training
    await this.logForTraining({
      input,
      classifiedIntent: classification.intent,
      classifiedConfidence: classification.confidence,
      llmIntent: llmResult.intent,
      llmPlan: llmResult.steps,
      source: 'llm-fallback'
    });
    
    return {
      ...llmResult,
      source: 'llm',
      confidence: 1.0  // LLM is ground truth
    };
  }
}
```

---

## Configuration

```typescript
interface HybridConfig {
  // Above this → use lookup directly
  highConfidenceThreshold: number;  // e.g., 0.92
  
  // Between medium and high → verify with LLM
  mediumConfidenceThreshold: number;  // e.g., 0.75
  
  // Below medium → LLM fallback
  // (implicit: < mediumConfidenceThreshold)
  
  // Maximum latency before forcing LLM
  maxLookupLatencyMs: number;  // e.g., 100
  
  // Feature flags
  enableLookup: boolean;
  enableVerification: boolean;
  enableTrainingLogs: boolean;
}

const defaultConfig: HybridConfig = {
  highConfidenceThreshold: 0.92,
  mediumConfidenceThreshold: 0.75,
  maxLookupLatencyMs: 100,
  enableLookup: true,
  enableVerification: true,
  enableTrainingLogs: true
};
```

---

## Lookup Flow

```typescript
private async tryLookup(
  intent: string,
  input: string,
  context: PlannerContext
): Promise<ActionPlan | null> {
  // Check if we have a template
  const template = this.registry.get(intent);
  if (!template) {
    return null;
  }
  
  // Check provider requirements
  if (template.required_providers) {
    const hasProviders = template.required_providers.every(
      p => context.connectedProviders.includes(p)
    );
    if (!hasProviders) {
      return null;  // Can't execute without required providers
    }
  }
  
  // Extract entities
  const entities = this.extractor.extract(intent, input);
  
  // Check required entities
  const missingRequired = template.required_entities.filter(
    e => !entities[e]
  );
  if (missingRequired.length > 0) {
    // Could prompt user for missing entities, or fall back to LLM
    return null;
  }
  
  // Resolve template
  return this.resolver.resolve(template, entities);
}
```

---

## Verification Flow

For medium-confidence classifications, verify with LLM:

```typescript
private async verifyWithLLM(
  classification: ClassificationResult,
  input: string
): Promise<boolean> {
  const prompt = `
You are verifying an intent classification.

User input: "${input}"
Classified intent: ${classification.intent}
Confidence: ${(classification.confidence * 100).toFixed(1)}%

Is this classification correct? Reply with just YES or NO.
`;

  const response = await this.llm.complete(prompt, { maxTokens: 5 });
  return response.trim().toUpperCase() === 'YES';
}
```

This is much cheaper than full planning:
- Full planning: ~500 tokens = $0.002
- Verification: ~100 tokens = $0.0004

---

## Metrics Collection

Track performance of each tier:

```typescript
interface TierMetrics {
  requests: number;
  latencyP50: number;
  latencyP99: number;
  successRate: number;
}

class MetricsCollector {
  private metrics = {
    lookup: new TierMetrics(),
    'lookup-verified': new TierMetrics(),
    llm: new TierMetrics()
  };
  
  record(source: string, latencyMs: number, success: boolean): void {
    const tier = this.metrics[source];
    tier.requests++;
    tier.latencies.push(latencyMs);
    if (success) tier.successes++;
  }
  
  getReport(): TierReport {
    return {
      distribution: {
        lookup: this.metrics.lookup.requests / this.totalRequests(),
        'lookup-verified': this.metrics['lookup-verified'].requests / this.totalRequests(),
        llm: this.metrics.llm.requests / this.totalRequests()
      },
      latency: {
        lookup: this.calculateP50(this.metrics.lookup.latencies),
        'lookup-verified': this.calculateP50(this.metrics['lookup-verified'].latencies),
        llm: this.calculateP50(this.metrics.llm.latencies)
      },
      savings: this.calculateSavings()
    };
  }
  
  private calculateSavings(): number {
    // Requests that didn't need LLM
    const savedRequests = this.metrics.lookup.requests + this.metrics['lookup-verified'].requests;
    const costPerLLMRequest = 0.002;
    return savedRequests * costPerLLMRequest;
  }
}
```

---

## Gradual Rollout

Start with conservative thresholds, gradually increase:

```typescript
// Week 1: Very conservative
const week1Config = {
  highConfidenceThreshold: 0.98,
  mediumConfidenceThreshold: 0.95,
  enableVerification: true
};

// Week 2: If accuracy is good, relax
const week2Config = {
  highConfidenceThreshold: 0.95,
  mediumConfidenceThreshold: 0.85,
  enableVerification: true
};

// Week 4: Target state
const targetConfig = {
  highConfidenceThreshold: 0.90,
  mediumConfidenceThreshold: 0.75,
  enableVerification: true
};
```

---

## Feedback Loop

User feedback improves the system:

```typescript
async recordFeedback(
  requestId: string,
  feedback: 'positive' | 'negative' | 'correction',
  correction?: string
): Promise<void> {
  const request = await this.getRequest(requestId);
  
  if (feedback === 'negative' || feedback === 'correction') {
    // If lookup was wrong, this becomes training data
    if (request.source === 'lookup' || request.source === 'lookup-verified') {
      await this.flagForRetraining({
        input: request.input,
        incorrectIntent: request.classifiedIntent,
        correctIntent: correction,  // If provided
        timestamp: Date.now()
      });
    }
  }
  
  if (feedback === 'positive' && request.source === 'llm') {
    // Good LLM response → add to training data
    await this.addTrainingExample({
      input: request.input,
      intent: request.llmIntent,
      plan: request.llmPlan
    });
  }
}
```

---

## The Full Picture

```
User: "Find John's email"
           │
           ▼
    ┌─────────────┐
    │  Classifier │  ← 15ms
    │  (ONNX)     │
    └──────┬──────┘
           │
    intent: contact_search
    confidence: 0.94
           │
           ▼
    ┌─────────────┐
    │  Threshold  │  0.94 > 0.90 (high)
    │   Check     │
    └──────┬──────┘
           │ High confidence
           ▼
    ┌─────────────┐
    │  Template   │  ← 1ms
    │  Lookup     │
    └──────┬──────┘
           │
    template found
           │
           ▼
    ┌─────────────┐
    │  Entity     │  ← 2ms
    │  Extraction │
    └──────┬──────┘
           │
    entities: { name: "John", field: "email" }
           │
           ▼
    ┌─────────────┐
    │  Template   │  ← 1ms
    │  Resolution │
    └──────┬──────┘
           │
           ▼
    ActionPlan {
      steps: [{ tool: "search_contacts", args: { query: "John" } }],
      source: "lookup",
      confidence: 0.94
    }
    
    Total: ~20ms (vs 800ms with LLM)
```

---

## Exercise

1. Design threshold values for your use case:
   - What's your tolerance for lookup errors?
   - How much verification cost is acceptable?

2. Plan the rollout:
   - What metrics would make you confident to lower thresholds?
   - What would make you raise them?

3. Consider edge cases:
   - "Find John Smith's email" (works)
   - "Find the email for the guy I met yesterday" (probably fails)
   - How does each flow through the tiers?

---

## Conclusion

The Frontier represents ASO's evolution:
- **Phase 1** (Current): LLM-powered, always online
- **Phase 2** (Next): Hybrid, LLM for novel intents
- **Phase 3** (Future): Offline-first, LLM rarely needed

The architecture is ready. The training data is accumulating.
The frontier is closer than it seems.

---

*Back to: [Course Index](../README.md)*
