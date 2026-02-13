# 5.1 The Opportunity

> Why offline-first intent resolution is possible and valuable.

---

## The Current Architecture

Every user request goes through:

```
User Intent → LLM → ActionPlan → Execution
```

The LLM is doing three jobs:
1. **Classification**: What type of request is this?
2. **Extraction**: What are the parameters?
3. **Planning**: What steps to take?

---

## The Insight

**Job #3 is rarely creative.**

For most intents, the plan is deterministic:

| Intent | Plan (Always) |
|--------|---------------|
| "Find X's email" | Search contacts → Extract email |
| "Schedule meeting with X" | Find availability → Create event |
| "Send email to X about Y" | Lookup contact → Draft email → Send |
| "Create lead for X from Y" | Extract fields → Create lead |

The LLM is doing expensive creativity for mechanical work.

---

## The 80/20 Split

Analyzing ASO logs from production:

```
Top 10 intent patterns:  42% of all requests
Top 25 intent patterns:  67% of all requests
Top 50 intent patterns:  81% of all requests
Long tail (novel):       19% of all requests
```

**81% of requests follow predictable patterns.**

We only need LLM for the 19%.

---

## Why This Wasn't Obvious

### 1. Early Assumption
"LLMs are needed for natural language understanding."

**Reality**: Small classifiers can understand intent with >95% accuracy on trained domains.

### 2. Flexibility Bias
"Users might phrase things in infinite ways."

**Reality**: The same user tends to phrase things consistently. Patterns emerge quickly.

### 3. Cold Start Problem
"We can't know patterns without users."

**Reality**: We have users. We have logs. We can build from actual data.

---

## The Three Stages

### Stage 1: Observe (Current)
Log everything through the LLM:
- Raw user input
- Parsed intent
- Generated plan
- Execution results

This builds our training dataset.

```typescript
// In PlannerService
const plan = await this.generatePlanWithLLM(input);
await this.logForTraining({
  input,
  intent: plan.intent,
  plan: plan.steps,
  timestamp: Date.now()
});
return plan;
```

### Stage 2: Classify (Next)
Train a classifier on logged data:
- Input: User utterance
- Output: Intent label + confidence

```typescript
// New: Classifier first
const classification = await this.classifier.classify(input);

if (classification.confidence > 0.9) {
  // Skip LLM
  return this.lookupPlan(classification.intent, input);
} else {
  // Fall back to LLM
  return this.generatePlanWithLLM(input);
}
```

### Stage 3: Optimize (Future)
- Move classifier to edge (ONNX in browser)
- Pre-compile common plans
- Zero LLM for 80%+ of requests

---

## Data Requirements

To train a useful classifier:

| Intent | Minimum Examples | Recommended |
|--------|-----------------|-------------|
| High-frequency | 50 | 200+ |
| Medium-frequency | 30 | 100+ |
| Low-frequency | 20 | 50+ |

With 50 intents × 100 examples = 5,000 training examples.

**Timeline estimate**: 2-4 weeks of production traffic.

---

## Model Options

### Option 1: Fine-tuned Transformer
- Model: DistilBERT, MiniLM
- Size: 50-100MB
- Accuracy: 95%+
- Latency: 20-50ms

### Option 2: Traditional ML
- Model: SVM, Random Forest on TF-IDF
- Size: 1-5MB
- Accuracy: 85-90%
- Latency: 5-10ms

### Option 3: ONNX-optimized
- Model: Quantized transformer
- Size: 5-20MB
- Accuracy: 93%+
- Latency: 10-20ms
- **Runs in browser**

We'll likely use Option 3 for the best balance.

---

## Entity Extraction

Beyond classification, we need to extract parameters:

**Input**: "Find John Smith's phone number"
**Output**: 
```json
{
  "intent": "contact_search",
  "entities": {
    "name": "John Smith",
    "field": "phone number"
  }
}
```

Approaches:
1. **Regex patterns**: Works for structured extractions
2. **NER model**: Small named entity recognition
3. **Template matching**: Define slot patterns per intent

```typescript
// Template matching example
const patterns = {
  "contact_search": [
    /find (?<name>.+?)'s (?<field>email|phone|address)/i,
    /get (?<field>email|phone|address) for (?<name>.+)/i,
    /what is (?<name>.+?)'s (?<field>email|phone|address)/i
  ]
};
```

---

## Privacy Implications

### Current
```
User: "Find the email for my contact at SecretCorp"
                    ↓
              [Sent to Groq/OpenAI]
```

Sensitive business information goes to third parties.

### Offline-First
```
User: "Find the email for my contact at SecretCorp"
                    ↓
              [Local classifier]
Intent: contact_search
Entities: { company: "SecretCorp" }
                    ↓
              [Local plan lookup]
              [Direct to Nango]
```

**Zero user intent data leaves the device for classified requests.**

---

## Cost Implications

### Current Costs (estimated)
```
Requests/day: 10,000
LLM cost/request: $0.002
Daily LLM cost: $20
Monthly LLM cost: $600
```

### With Offline-First (80% coverage)
```
Classified requests: 8,000 (free)
LLM requests: 2,000
Daily LLM cost: $4
Monthly LLM cost: $120
Savings: $480/month = $5,760/year
```

At scale, this becomes significant.

---

## The Logging Schema

What to capture for training:

```typescript
interface TrainingExample {
  // Input
  raw_input: string;              // User's exact words
  normalized_input: string;       // Lowercase, trimmed
  
  // Context
  user_id: string;
  timestamp: string;
  previous_intent?: string;       // For conversation context
  available_tools: string[];      // What tools user has
  
  // Output (from LLM)
  intent: string;                 // Classified intent
  entities: Record<string, any>;  // Extracted parameters
  plan: ActionStep[];             // Generated plan
  
  // Feedback
  execution_success: boolean;     // Did it work?
  user_feedback?: string;         // Thumbs up/down
}
```

---

## Exercise

1. Look at your own ASO usage (or imagine typical use cases):
   - What are your top 10 intents?
   - What parameters do they each need?
   - How would you write regex patterns to extract them?

2. Estimate the coverage:
   - What % of your requests would these 10 intents cover?
   - What's left for the LLM?

---

*Next: [5.2 Small Classifiers](./classifiers.md)*
