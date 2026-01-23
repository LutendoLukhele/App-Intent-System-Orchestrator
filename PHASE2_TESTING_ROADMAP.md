## Phase 2 Testing Plan: Salesforce → Send Email Multi-Step Workflows

### Current Status ✅
- **Gmail compression**: 107KB → 1.3KB (98.7% ratio) - WORKING
- **Salesforce test**: Created and ready to run
- **Next**: Multi-step workflows (Salesforce + Send Email)

---

## Test Execution Order

### 1. Run Salesforce Test (Baseline)
```bash
# Run the new Salesforce compression test
npm test -- tests/headless-salesforce-test.ts

# Expected metrics:
# - Single contact: 40-50% compression
# - Multiple contacts: 45-55% compression
# - Large fields: 50-60% compression
# - Comparison to Gmail 98.7%: Lower (CRM data has more structured fields)
```

**Why lower than Gmail?**
```
Email compression (98.7%):
- 52 emails → 5 emails (90% reduction)
- 800 char body limit on text-heavy data
- Max savings on verbose content

Salesforce compression (expected 40-55%):
- Structured data: name, email, phone, industry, revenue
- Fields are shorter, less prose
- 500-800 char limit on description only
- Less redundancy to compress
```

---

### 2. Action Testing (Individual Tools)

**Test A: fetch_entity alone**
```bash
npm test -- tests/headless-salesforce-test.ts --grep "Single Entity Fetch"
```
Expected: 
- Clean fetch
- Compression ratio: 40-55%
- Token usage: ~150-200

**Test B: send_email alone**
Create test file: `tests/headless-send-email-test.ts`
```typescript
const response = await client.sendUserMessage(
  "Send me a test email to john@example.com",
  messageId,
  45000
);

// Monitor:
// - send_email tool execution
// - Response format
// - Token usage
```

---

### 3. Multi-Step Workflow Test (Gmail → Salesforce)

Create: `tests/headless-multi-step-gmail-salesforce-test.ts`

**Workflow 1: Email → Contact Creation**
```typescript
const query = "I received an email from john@acme.com. Create a Salesforce contact for them.";

// Steps:
// 1. fetch_emails (search for john@acme.com)
// 2. parse_email_details (extract name, company, etc)
// 3. create_entity (Salesforce contact)
```

**Workflow 2: Salesforce → Email Send**
```typescript
const query = "Get my top account and send them a follow-up email about Q1 roadmap.";

// Steps:
// 1. fetch_entity (get account details)
// 2. generate_email_draft (create message)
// 3. send_email (delivery)
```

---

## Compression Strategy for Multi-Step

**Key insight**: Each step gets compressed independently.

```
Step 1 (fetch_emails):
  Input:  107KB (52 emails)
  Output: 1.3KB (5 emails, compressed)
  Cost:   ~1,000 tokens

Step 2 (fetch_entity):
  Input:  ~8KB (full Salesforce contact)
  Output: ~3KB (compressed)
  Cost:   ~300 tokens

Total: ~1,300 tokens (vs ~36K without compression)
Savings: ~34,700 tokens = $0.35 cheaper per request
```

---

## Test Metrics to Track

### Per-Test Matrix

| Test | Original Size | Compressed | Ratio | Token Est. | Success |
|------|--------------|-----------|-------|-----------|---------|
| fetch_emails (5) | 107KB | 1.3KB | 98.7% | 1,000 | ✅ |
| fetch_entity (1) | 8KB | 3KB | 62.5% | 300 | TBD |
| send_email (1) | 2KB | 1.5KB | 25% | 100 | TBD |
| Gmail→Salesforce | 115KB | 4.3KB | 96.2% | 1,300 | TBD |
| Salesforce→Email | 8KB | 4.5KB | 43.8% | 400 | TBD |

---

## Edge Cases to Test

**1. Large Description → Truncation**
```typescript
// Salesforce contact with 5KB description field
// Should truncate to 500-800 chars
// Monitor: savedBytes, quality loss
```

**2. Sequential Requests (Memory Leak Check)**
```typescript
// 10 sequential requests
// Monitor: Heap size, Redis memory, response time drift
for (i = 0; i < 10; i++) {
  send_query()
  check_memory()
}
```

**3. Compression + Large Result Set**
```typescript
// fetch_emails + fetch_entity in same message
// Total: 115KB uncompressed → target: <10KB compressed
// Monitor: Parser stability, token usage accuracy
```

---

## Expected Compression Ratios Summary

```
Data Type          | Original | Compressed | Ratio | Notes
-------------------|----------|-----------|-------|------------------
Email (107KB, 52)  | 107KB    | 1.3KB     | 98.7% | 5 emails, 800 char limit
Contact (8KB, 1)   | 8KB      | 3KB       | 62.5% | Structured data
Account (12KB, 1)  | 12KB     | 4KB       | 66.7% | More fields
Email body only    | 50KB     | 4KB       | 92%   | 5 × 800 char
Description field  | 2KB      | 500B      | 75%   | Truncated to 500 chars
Multi-step (2 ops) | 115KB    | 4.3KB     | 96.2% | Combined compression
```

---

## Run Commands

```bash
# Test 1: Salesforce baseline
npm test -- tests/headless-salesforce-test.ts

# Test 2: Gmail baseline (already passing)
npm test -- tests/headless-e2e.test.ts --grep "Single read-only"

# Test 3: Action isolation (when created)
npm test -- tests/headless-send-email-test.ts

# Test 4: Multi-step workflows (when created)
npm test -- tests/headless-multi-step-gmail-salesforce-test.ts

# Test all together
npm test -- tests/headless-*.test.ts

# With detailed logging
TEST_LOG_LEVEL=debug npm test -- tests/headless-salesforce-test.ts
```

---

## Next Steps After Salesforce Test

1. **Run Salesforce test** → Get actual compression ratios
2. **Compare results** → Is it 40-55% or different?
3. **If good**: Create send_email test
4. **If issues**: Debug and adjust compression limits
5. **Then**: Multi-step workflow tests

---

## Notes for Implementation

- **Reuse compression config**: Import from `emailCompressionConfig.ts`
- **Same Redis hydration**: Both services use same approach
- **Token tracking**: Add OpenAI token counter for accuracy
- **Logging**: Winston logger at INFO level for production visibility
- **Timeouts**: 60s for multi-step, 45s for single operations
