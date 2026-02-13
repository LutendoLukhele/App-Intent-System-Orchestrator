# 5.2 Small Classifiers

> ONNX models for local intent detection.

---

## What We're Building

A lightweight neural network that runs locally:

```
Input: "Find John's email address"
           │
           ▼
    ┌─────────────┐
    │  Tokenizer  │  → [101, 2424, 2198, ...]
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ Transformer │  ← 5-20MB ONNX model
    │   (Small)   │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Softmax    │  → contact_search: 0.94
    │             │     lead_search: 0.03
    │             │     other: 0.03
    └─────────────┘
```

---

## Model Architecture

### Option A: MiniLM (Recommended)
```
Model: sentence-transformers/all-MiniLM-L6-v2
Layers: 6
Hidden: 384
Parameters: 22M
ONNX Size: ~23MB (quantized: ~6MB)
Latency: 15-25ms
```

### Option B: DistilBERT
```
Model: distilbert-base-uncased
Layers: 6
Hidden: 768
Parameters: 66M
ONNX Size: ~67MB (quantized: ~17MB)
Latency: 30-50ms
```

### Option C: TinyBERT
```
Model: huawei-noah/TinyBERT_General_4L_312D
Layers: 4
Hidden: 312
Parameters: 14.5M
ONNX Size: ~15MB (quantized: ~4MB)
Latency: 8-15ms
```

---

## Training Pipeline

### 1. Data Preparation

```python
# training/prepare_data.py

import json
from sklearn.model_selection import train_test_split

def load_training_data(log_path: str) -> list:
    """Load logged intents from production."""
    with open(log_path) as f:
        logs = [json.loads(line) for line in f]
    
    examples = []
    for log in logs:
        if log.get('execution_success'):  # Only successful executions
            examples.append({
                'text': log['raw_input'],
                'label': log['intent']
            })
    
    return examples

def prepare_dataset(examples: list, test_size: float = 0.2):
    """Split into train/test sets."""
    texts = [e['text'] for e in examples]
    labels = [e['label'] for e in examples]
    
    # Encode labels
    unique_labels = sorted(set(labels))
    label_to_id = {l: i for i, l in enumerate(unique_labels)}
    label_ids = [label_to_id[l] for l in labels]
    
    # Split
    train_texts, test_texts, train_labels, test_labels = train_test_split(
        texts, label_ids, test_size=test_size, stratify=label_ids
    )
    
    return {
        'train': {'texts': train_texts, 'labels': train_labels},
        'test': {'texts': test_texts, 'labels': test_labels},
        'label_map': unique_labels
    }
```

### 2. Fine-Tuning

```python
# training/train_classifier.py

from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    TrainingArguments,
    Trainer
)
from datasets import Dataset

def train_intent_classifier(
    data: dict,
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    output_dir: str = "./intent_classifier"
):
    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(data['label_map'])
    )
    
    # Create datasets
    train_dataset = Dataset.from_dict({
        'text': data['train']['texts'],
        'label': data['train']['labels']
    })
    test_dataset = Dataset.from_dict({
        'text': data['test']['texts'],
        'label': data['test']['labels']
    })
    
    # Tokenize
    def tokenize(examples):
        return tokenizer(
            examples['text'],
            truncation=True,
            padding='max_length',
            max_length=64
        )
    
    train_dataset = train_dataset.map(tokenize, batched=True)
    test_dataset = test_dataset.map(tokenize, batched=True)
    
    # Training arguments
    args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=3,
        per_device_train_batch_size=32,
        per_device_eval_batch_size=64,
        warmup_steps=100,
        weight_decay=0.01,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
    )
    
    # Train
    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_dataset,
        eval_dataset=test_dataset,
    )
    
    trainer.train()
    
    # Save
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    return model, tokenizer
```

### 3. Export to ONNX

```python
# training/export_onnx.py

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from optimum.onnxruntime import ORTModelForSequenceClassification

def export_to_onnx(
    model_path: str,
    output_path: str,
    quantize: bool = True
):
    """Export trained model to ONNX format."""
    
    # Load the model
    model = ORTModelForSequenceClassification.from_pretrained(
        model_path,
        export=True
    )
    
    # Optionally quantize (reduces size by 4x)
    if quantize:
        from optimum.onnxruntime import ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig
        
        quantizer = ORTQuantizer.from_pretrained(model)
        qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False)
        quantizer.quantize(save_dir=output_path, quantization_config=qconfig)
    else:
        model.save_pretrained(output_path)
    
    print(f"Model exported to {output_path}")
```

---

## Inference in Node.js

Using ONNX Runtime:

```typescript
// packages/intent-classifier/src/Classifier.ts

import * as ort from 'onnxruntime-node';

export class IntentClassifier {
  private session: ort.InferenceSession | null = null;
  private tokenizer: Tokenizer;
  private labels: string[];
  
  async load(modelPath: string, labelsPath: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelPath);
    this.labels = JSON.parse(await fs.readFile(labelsPath, 'utf-8'));
    this.tokenizer = new Tokenizer(/* vocab path */);
  }
  
  async classify(text: string): Promise<ClassificationResult> {
    if (!this.session) throw new Error('Model not loaded');
    
    // Tokenize
    const tokens = this.tokenizer.encode(text);
    
    // Create tensors
    const inputIds = new ort.Tensor('int64', BigInt64Array.from(tokens.inputIds.map(BigInt)), [1, tokens.inputIds.length]);
    const attentionMask = new ort.Tensor('int64', BigInt64Array.from(tokens.attentionMask.map(BigInt)), [1, tokens.attentionMask.length]);
    
    // Run inference
    const results = await this.session.run({
      input_ids: inputIds,
      attention_mask: attentionMask
    });
    
    // Process output
    const logits = results.logits.data as Float32Array;
    const probabilities = this.softmax(Array.from(logits));
    
    // Get top result
    const maxIdx = probabilities.indexOf(Math.max(...probabilities));
    
    return {
      intent: this.labels[maxIdx],
      confidence: probabilities[maxIdx],
      all: this.labels.map((label, i) => ({
        intent: label,
        confidence: probabilities[i]
      })).sort((a, b) => b.confidence - a.confidence)
    };
  }
  
  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sum = exps.reduce((a, b) => a + b);
    return exps.map(e => e / sum);
  }
}

interface ClassificationResult {
  intent: string;
  confidence: number;
  all: Array<{ intent: string; confidence: number }>;
}
```

---

## Inference in Browser

Using ONNX Runtime Web:

```typescript
// packages/intent-classifier/src/browser.ts

import * as ort from 'onnxruntime-web';

export class BrowserIntentClassifier {
  private session: ort.InferenceSession | null = null;
  
  async load(modelUrl: string): Promise<void> {
    // ONNX Runtime Web loads from URL
    this.session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgl'],  // Use GPU if available
      graphOptimizationLevel: 'all'
    });
  }
  
  async classify(text: string): Promise<ClassificationResult> {
    // Same logic as Node.js version
    // ...
  }
}
```

---

## Tokenization

For ONNX models, we need to match the tokenizer used in training:

```typescript
// packages/intent-classifier/src/Tokenizer.ts

import { BertTokenizer } from 'bert-tokenizer';

export class Tokenizer {
  private tokenizer: BertTokenizer;
  
  constructor(vocabPath: string) {
    this.tokenizer = new BertTokenizer(vocabPath);
  }
  
  encode(text: string, maxLength: number = 64): TokenizedInput {
    const tokens = this.tokenizer.tokenize(text);
    const inputIds = this.tokenizer.convertTokensToIds(tokens);
    
    // Truncate/pad to maxLength
    const paddedInputIds = this.padOrTruncate(inputIds, maxLength);
    const attentionMask = paddedInputIds.map(id => id !== 0 ? 1 : 0);
    
    return {
      inputIds: paddedInputIds,
      attentionMask
    };
  }
  
  private padOrTruncate(arr: number[], length: number): number[] {
    if (arr.length > length) {
      return arr.slice(0, length);
    }
    return [...arr, ...new Array(length - arr.length).fill(0)];
  }
}

interface TokenizedInput {
  inputIds: number[];
  attentionMask: number[];
}
```

---

## Confidence Calibration

Raw softmax probabilities are often overconfident. Calibrate with temperature scaling:

```typescript
classify(text: string, temperature: number = 1.5): ClassificationResult {
  // ... get logits ...
  
  // Apply temperature
  const scaledLogits = logits.map(l => l / temperature);
  const probabilities = this.softmax(scaledLogits);
  
  // ... rest of processing ...
}
```

Temperature > 1 = less confident (spread out)
Temperature < 1 = more confident (peaky)

Calibrate on held-out validation set to find optimal temperature.

---

## Performance Benchmarks

On M1 MacBook:

| Model | Size | Load Time | Inference |
|-------|------|-----------|-----------|
| MiniLM (quantized) | 6MB | 200ms | 12ms |
| TinyBERT (quantized) | 4MB | 150ms | 8ms |
| DistilBERT (quantized) | 17MB | 400ms | 25ms |

In browser (Chrome):

| Model | WebGL | WASM |
|-------|-------|------|
| MiniLM (quantized) | 25ms | 60ms |
| TinyBERT (quantized) | 18ms | 45ms |

---

## Exercise

1. Estimate your intent space:
   - How many distinct intents do you have?
   - What's the approximate training data per intent?

2. Choose a model:
   - What's your latency budget?
   - What's your size budget (for browser deployment)?

3. Design the training pipeline:
   - How will you collect training data?
   - How will you handle class imbalance?

---

*Next: [5.3 Pattern Lookup](./lookup.md)*
