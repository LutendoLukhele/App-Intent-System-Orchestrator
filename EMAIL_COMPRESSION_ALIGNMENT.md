# Email Compression Configuration - Unified Pattern

## Overview
Email compression is now **unified and aligned** across all services using a single configuration source: `src/services/emailCompressionConfig.ts`

## Current Settings
```typescript
EMAIL_COMPRESSION_CONFIG = {
  MAX_EMAILS: 5,           // Keep 5 most recent emails
  BODY_CHAR_LIMIT: 800,    // 800 chars per email body
}
```

## Why 800 Characters?

### Ratio Analysis
- **Full Email**: ~2,000-3,000 chars (often 8,000+ with nested content)
- **800 chars**: ~25-30% of full email = **sufficient context without excess tokens**
- **Compression**: 96%+ reduction compared to full data (107KB → 1.3KB)

### Use Cases
| Scenario | Benefit |
|----------|---------|
| **Rate-Limited Plan** | 800 chars × 5 = 4,000 chars = ~1K tokens (safe margin) |
| **Non-Limited Plan** | Still generous context while avoiding token bloat |
| **Multi-turn conversations** | Consistent performance across first and follow-up messages |

## Services Using This Config

### 1. ConversationService
- **File**: `src/services/conversation/ConversationService.ts`
- **Location**: Redis hydration logic (lines 919-920)
- **Purpose**: Compress full email cache on retrieval for LLM context

### 2. FollowUpService  
- **File**: `src/services/FollowUpService.ts`
- **Location**: Result compression before follow-up generation (lines 77-90)
- **Purpose**: Compress previous step results for next-step analysis

### 3. Helper Function
- **File**: `src/services/emailCompressionConfig.ts`
- **Function**: `compressEmailData()`
- **Returns**: Compression metrics (ratio, sizes, wasCompressed flag)

## Implementation Pattern

All services follow this pattern:

```typescript
import { EMAIL_COMPRESSION_CONFIG, compressEmailData } from './emailCompressionConfig';

// Option 1: Manual compression
const emailArray = resultData?.records || resultData;
if (emailArray && emailArray.length > 0) {
  const emailsToAnalyze = emailArray.slice(0, EMAIL_COMPRESSION_CONFIG.MAX_EMAILS)
    .map(email => ({
      // ... fields ...
      body_text: email.body_text?.substring(0, EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT) || ''
    }));
}

// Option 2: Helper function (recommended)
const { compressed, compressionRatio } = compressEmailData(resultData);
```

## Verification Checklist
- ✅ Both services import from same source
- ✅ Both services use same MAX_EMAILS (5)
- ✅ Both services use same BODY_CHAR_LIMIT (800 chars)
- ✅ TypeScript compilation: No errors
- ✅ First message compression: Works (summary mode)
- ✅ Follow-up message compression: Works (now always applied)

## Future Adjustments
If you need to adjust limits:
1. Edit `src/services/emailCompressionConfig.ts`
2. All services automatically use new values
3. No service-specific changes needed

---
**Date Updated**: 2026-01-16  
**Change Reason**: Unified email compression to ensure consistent multi-turn conversation handling and rate-limit resilience
