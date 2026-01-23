# Enhanced Filter Implementation Guide

## Overview

The backend now supports **comprehensive filtering, sorting, and pagination** for cached Salesforce entities. This document explains the architecture, newly implemented features, and how to use them effectively.

## Architecture

### Two-Tier Filtering System

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────────┐
│  Nango Cache    │────────▶│  ToolOrchestrator│────────▶│  Filtered Results  │
│  (Basic Query)  │         │  (Client-Side    │         │  (Returned to AI)  │
│                 │         │   Filtering)     │         │                    │
└─────────────────┘         └──────────────────┘         └────────────────────┘
     ↓                              ↓
   - limit                    - Complex logic
   - modifiedAfter            - All operators
   - cursor                   - Field projection
                              - Sorting
                              - Offset pagination
```

### Cache Level (Nango)
- **Limited**: Only `limit`, `modifiedAfter`, and `cursor` parameters
- **Purpose**: Bulk data retrieval from Nango platform
- **Files**: [`NangoService.ts`](src/services/NangoService.ts#L443-L492)

### Backend Level (ToolOrchestrator)
- **Comprehensive**: All filtering, sorting, pagination, and field projection
- **Purpose**: Apply complex business logic to cached data
- **Files**: [`ToolOrchestrator.ts`](src/services/tool/ToolOrchestrator.ts#L585-L900)

---

## Newly Implemented Features

### ✅ 1. Complex Logic Expressions

**Feature**: Support for AND/OR combinations with parentheses grouping

**Syntax**:
```json
{
  "logic": "1 AND (2 OR 3)",
  "conditions": [
    { "field": "Rating", "operator": "equals", "value": "Hot" },        // Condition 1
    { "field": "Status", "operator": "equals", "value": "Working" },    // Condition 2
    { "field": "Status", "operator": "equals", "value": "Qualified" }   // Condition 3
  ]
}
```

**Result**: Finds records where `Rating = Hot AND (Status = Working OR Status = Qualified)`

**Implementation**: [`evaluateLogicExpression()`](src/services/tool/ToolOrchestrator.ts#L820-L890)

**Examples**:

```javascript
// Example 1: California OR New York accounts
{
  logic: "1 OR 2",
  conditions: [
    { field: "BillingState", operator: "equals", value: "CA" },
    { field: "BillingState", operator: "equals", value: "NY" }
  ]
}

// Example 2: High-priority leads: (Hot rating AND Web source) OR (status = Qualified)
{
  logic: "(1 AND 2) OR 3",
  conditions: [
    { field: "Rating", operator: "equals", value: "Hot" },
    { field: "LeadSource", operator: "equals", value: "Web" },
    { field: "Status", operator: "equals", value: "Qualified" }
  ]
}

// Example 3: Deep nesting
{
  logic: "1 AND (2 OR (3 AND 4))",
  conditions: [
    { field: "Status", operator: "equals", value: "Open" },
    { field: "Rating", operator: "equals", value: "Hot" },
    { field: "LeadSource", operator: "equals", value: "Web" },
    { field: "Company", operator: "contains", value: "Tech" }
  ]
}
```

---

### ✅ 2. Offset Pagination

**Feature**: Skip N records before returning results (enables proper pagination UI)

**Syntax**:
```json
{
  "filters": {
    "offset": 20,   // Skip first 20 records
    "limit": 10     // Return next 10 records (21-30)
  }
}
```

**Use Case**: Building paginated tables or infinite scroll interfaces

**Implementation**: [`applyFilters()`](src/services/tool/ToolOrchestrator.ts#L766-L773)

**Examples**:

```javascript
// Page 1: Records 1-10
{ filters: { offset: 0, limit: 10 } }

// Page 2: Records 11-20
{ filters: { offset: 10, limit: 10 } }

// Page 3: Records 21-30
{ filters: { offset: 20, limit: 10 } }
```

---

### ✅ 3. Field Projection

**Feature**: Return only specified fields (`includeFields`) or exclude specific fields (`excludeFields`)

**Syntax**:
```json
// Option A: Include only specific fields
{
  "filters": {
    "includeFields": ["Id", "Name", "Email"]
  }
}

// Option B: Exclude specific fields
{
  "filters": {
    "excludeFields": ["Description", "CreatedBy", "LastModifiedBy"]
  }
}
```

**Benefits**:
- Reduce payload size (faster responses)
- Hide sensitive data
- Simplify AI prompts by removing unnecessary fields

**Implementation**: [`applyFilters()`](src/services/tool/ToolOrchestrator.ts#L747-L765)

**Examples**:

```javascript
// Minimal contact info for email list
{
  filters: {
    includeFields: ["Id", "Email", "FirstName", "LastName"]
  }
}

// Remove large text fields
{
  filters: {
    excludeFields: ["Description", "Notes", "History"]
  }
}
```

---

### ✅ 4. Between Operator (Already Implemented)

**Feature**: Range queries for numeric and date fields

**Syntax**:
```json
{
  "conditions": [
    {
      "field": "CreatedDate",
      "operator": "between",
      "values": ["2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z"]
    }
  ]
}
```

**Use Cases**:
- Date ranges (e.g., "created this month")
- Numeric ranges (e.g., "revenue between $100K and $500K")

**Examples**:

```javascript
// Opportunities closing this quarter
{
  conditions: [
    {
      field: "CloseDate",
      operator: "between",
      values: ["2026-01-01", "2026-03-31"]
    }
  ]
}

// Mid-sized accounts ($1M - $10M annual revenue)
{
  conditions: [
    {
      field: "AnnualRevenue",
      operator: "between",
      values: [1000000, 10000000]
    }
  ]
}
```

---

## Complete Operator Reference

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `{ field: "Status", operator: "equals", value: "Open" }` |
| `notEquals` | Not equal | `{ field: "Rating", operator: "notEquals", value: "Cold" }` |
| `greaterThan` | Greater than | `{ field: "Amount", operator: "greaterThan", value: 10000 }` |
| `lessThan` | Less than | `{ field: "Age", operator: "lessThan", value: 30 }` |
| `greaterOrEqual` | >= | `{ field: "Probability", operator: "greaterOrEqual", value: 50 }` |
| `lessOrEqual` | <= | `{ field: "Priority", operator: "lessOrEqual", value: 3 }` |
| `contains` | Substring match (case-insensitive) | `{ field: "Company", operator: "contains", value: "tech" }` |
| `notContains` | Doesn't contain | `{ field: "Email", operator: "notContains", value: "spam" }` |
| `startsWith` | Starts with (case-insensitive) | `{ field: "Name", operator: "startsWith", value: "John" }` |
| `endsWith` | Ends with (case-insensitive) | `{ field: "Email", operator: "endsWith", value: "@example.com" }` |
| `in` | Value in array | `{ field: "Status", operator: "in", values: ["Open", "Working"] }` |
| `notIn` | Value not in array | `{ field: "Rating", operator: "notIn", values: ["Cold", "Unqualified"] }` |
| `isNull` | Field is null/undefined | `{ field: "Phone", operator: "isNull" }` |
| `isNotNull` | Field has a value | `{ field: "Email", operator: "isNotNull" }` |
| `between` | Range (inclusive) | `{ field: "CreatedDate", operator: "between", values: ["2026-01-01", "2026-12-31"] }` |

---

## Full Query Examples

### Example 1: Hot Leads from Web or Referral

**User Query**: "Show me all hot leads from web or referral sources"

**Tool Call**:
```json
{
  "name": "fetch_entity",
  "arguments": {
    "input": {
      "operation": "fetch",
      "entityType": "Lead",
      "filters": {
        "logic": "1 AND (2 OR 3)",
        "conditions": [
          { "field": "Rating", "operator": "equals", "value": "Hot" },
          { "field": "LeadSource", "operator": "equals", "value": "Web" },
          { "field": "LeadSource", "operator": "equals", "value": "Referral" }
        ],
        "orderBy": [
          { "field": "CreatedDate", "direction": "DESC" }
        ],
        "limit": 50
      }
    }
  }
}
```

### Example 2: Paginated Contact List

**User Query**: "Show me contacts 21-40, sorted by last name"

**Tool Call**:
```json
{
  "name": "fetch_entity",
  "arguments": {
    "input": {
      "operation": "fetch",
      "entityType": "Contact",
      "filters": {
        "orderBy": [
          { "field": "LastName", "direction": "ASC" }
        ],
        "offset": 20,
        "limit": 20,
        "includeFields": ["Id", "FirstName", "LastName", "Email", "Phone"]
      }
    }
  }
}
```

### Example 3: Large Opportunities Closing This Quarter

**User Query**: "Find opportunities over $100K closing in Q1 2026"

**Tool Call**:
```json
{
  "name": "fetch_entity",
  "arguments": {
    "input": {
      "operation": "fetch",
      "entityType": "Deal",
      "filters": {
        "logic": "1 AND 2",
        "conditions": [
          { "field": "Amount", "operator": "greaterThan", "value": 100000 },
          { "field": "CloseDate", "operator": "between", "values": ["2026-01-01", "2026-03-31"] }
        ],
        "orderBy": [
          { "field": "Amount", "direction": "DESC" }
        ]
      }
    }
  }
}
```

---

## Performance Considerations

### Current Limitations

1. **Full Table Scans**: Cache queries fetch ALL records, then filter in-memory
2. **No Indexes**: Cannot leverage database indexes for WHERE clauses
3. **Memory Overhead**: Large datasets (1000+ records) may cause delays

### Optimization Strategies

#### 1. Increase Cache Fetch Limit
```typescript
// In ToolOrchestrator.executeCacheTool()
const cacheOptions = {
  limit: 1000,  // Increase from default 100 to reduce round-trips
  modifiedAfter: args.filters?.dateRange?.after
};
```

#### 2. Use Date-Based Filtering
```json
// Leverage modifiedAfter to reduce dataset at cache level
{
  "filters": {
    "dateRange": { "after": "2026-01-01T00:00:00Z" }
  }
}
```

#### 3. Field Projection Early
```json
// Reduce memory usage by excluding large text fields
{
  "filters": {
    "excludeFields": ["Description", "Notes", "History"]
  }
}
```

#### 4. Pagination for Large Result Sets
```json
// Process results in chunks to avoid memory spikes
{
  "filters": {
    "limit": 100,
    "offset": 0  // Increment by 100 for each page
  }
}
```

---

## Testing

### Run Test Suite

```bash
cd /Users/lutendolukhele/Desktop/backedn-main
npx ts-node tests/filter-logic-test.ts
```

### Expected Output

```
╔════════════════════════════════════════════════════════════╗
║     ENHANCED FILTER CAPABILITIES TEST SUITE                ║
╚════════════════════════════════════════════════════════════╝

=== TEST 1: Complex Logic Expression ===
Query: (Rating = Hot OR Rating = Warm) AND LeadSource = Web

Results: 3 leads found
  - John Doe (Rating: Hot, Source: Web)
  - Bob Johnson (Rating: Hot, Source: Web)
  - Charlie Brown (Rating: Warm, Source: Web)

Expected: John Doe (Hot, Web), Bob Johnson (Hot, Web), Charlie Brown (Warm, Web)
✓ Test PASSED

[... 5 more tests ...]

╔════════════════════════════════════════════════════════════╗
║     ALL TESTS COMPLETED                                    ║
╚════════════════════════════════════════════════════════════╝
```

---

## Integration with Tool Config

The [`tool-config.json`](src/config/tool-config.json) schema already defines these features. No changes needed:

```json
{
  "name": "fetch_entity",
  "parameters": {
    "input": {
      "filters": {
        "conditions": [...],        // ✅ Fully implemented
        "logic": "...",             // ✅ NEW: Implemented
        "orderBy": [...],           // ✅ Already worked
        "limit": 100,               // ✅ Already worked
        "offset": 0,                // ✅ NEW: Implemented
        "includeFields": [...],     // ✅ NEW: Implemented
        "excludeFields": [...]      // ✅ NEW: Implemented
      }
    }
  }
}
```

---

## Future Enhancements

### Short-Term (Can Implement Now)

1. **Time Frame Shortcuts**: Implement `timeFrame` parameter
   ```json
   { "timeFrame": "last7days" }  // Auto-converts to date range
   ```

2. **Case-Insensitive Sorting**: Add option to `orderBy`
   ```json
   { "field": "Name", "direction": "ASC", "caseInsensitive": true }
   ```

### Medium-Term (Requires Architecture Changes)

3. **Query Result Caching**: Cache filtered results to avoid re-processing
4. **Related Object Filtering**: Support dot notation (e.g., `Account.Name`)
5. **Aggregations**: Implement `groupBy` and `aggregate` functions

### Long-Term (Requires Nango Platform Updates)

6. **Database-Level Filtering**: Push WHERE clauses to Nango cache queries
7. **Indexed Lookups**: Enable index-based queries for common fields
8. **Real-Time Queries**: Direct Salesforce SOQL fallback for time-sensitive data

---

## Troubleshooting

### Issue: Logic expression returns empty results

**Cause**: Condition numbering is 1-indexed, not 0-indexed

**Solution**:
```json
// ❌ WRONG
{ "logic": "0 AND 1", "conditions": [...] }

// ✅ CORRECT
{ "logic": "1 AND 2", "conditions": [...] }
```

### Issue: Offset pagination returns wrong records

**Cause**: Missing `orderBy` - results are unordered

**Solution**:
```json
// ❌ WRONG (unpredictable order)
{ "offset": 10, "limit": 10 }

// ✅ CORRECT (deterministic order)
{ "orderBy": [{ "field": "Id", "direction": "ASC" }], "offset": 10, "limit": 10 }
```

### Issue: Field projection not working

**Cause**: Both `includeFields` and `excludeFields` specified (only one allowed)

**Solution**:
```json
// ❌ WRONG (conflicting)
{ "includeFields": ["Id", "Name"], "excludeFields": ["Email"] }

// ✅ CORRECT (pick one)
{ "includeFields": ["Id", "Name"] }
```

---

## Summary

| Feature | Status | File Reference |
|---------|--------|----------------|
| Complex logic expressions | ✅ **NEW** | [`ToolOrchestrator.ts:820-890`](src/services/tool/ToolOrchestrator.ts#L820-L890) |
| Offset pagination | ✅ **NEW** | [`ToolOrchestrator.ts:766-773`](src/services/tool/ToolOrchestrator.ts#L766-L773) |
| Field projection | ✅ **NEW** | [`ToolOrchestrator.ts:747-765`](src/services/tool/ToolOrchestrator.ts#L747-L765) |
| Between operator | ✅ Existing | [`ToolOrchestrator.ts:730-735`](src/services/tool/ToolOrchestrator.ts#L730-L735) |
| All 14 operators | ✅ Existing | [`ToolOrchestrator.ts:790-820`](src/services/tool/ToolOrchestrator.ts#L790-L820) |
| Multi-field sorting | ✅ Existing | [`ToolOrchestrator.ts:738-746`](src/services/tool/ToolOrchestrator.ts#L738-L746) |

---

## Additional Resources

- **Tool Configuration**: [`tool-config.json`](src/config/tool-config.json)
- **Nango Service**: [`NangoService.ts`](src/services/NangoService.ts)
- **Entity Sync**: [`entities.ts`](entities.ts)
- **Test Suite**: [`filter-logic-test.ts`](tests/filter-logic-test.ts)

---

*Last Updated: January 19, 2026*
