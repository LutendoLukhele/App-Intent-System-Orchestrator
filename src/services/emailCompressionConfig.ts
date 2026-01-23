/**
 * UNIFIED EMAIL COMPRESSION CONFIGURATION
 * 
 * These settings apply consistently across all services (ConversationService, FollowUpService, etc)
 * to ensure aligned email data handling throughout the application.
 * 
 * The values are optimized for:
 * - Groq's rate limiting (12K TPM on free tier)
 * - Adequate context for AI analysis (not just snippets)
 * - Consistent behavior across multi-turn conversations
 */

export const EMAIL_COMPRESSION_CONFIG = {
  /** Maximum number of emails to include in compressed data (most recent) */
  MAX_EMAILS: 5,
  
  /** Maximum characters per email body (sufficient for meaningful context) */
  BODY_CHAR_LIMIT: 800,
} as const;

/**
 * Helper function to compress email data
 */
export function compressEmailData(
  resultData: any,
  maxEmails: number = EMAIL_COMPRESSION_CONFIG.MAX_EMAILS,
  bodyCharLimit: number = EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT
): {
  compressed: any;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string;
} {
  // Handle both array format and object format (with records array)
  let emailArray = Array.isArray(resultData) ? resultData :
    (resultData?.records && Array.isArray(resultData.records)) ? resultData.records :
    null;

  const originalSize = JSON.stringify(resultData).length;

  if (!emailArray || emailArray.length === 0) {
    return {
      compressed: resultData,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: '0%',
    };
  }

  const compressedEmails = emailArray.slice(0, maxEmails).map((email: any) => ({
    from: email.from,
    subject: email.subject,
    body_text: email.body_text ? email.body_text.substring(0, bodyCharLimit) : '',
    received: email.received || email.startDate || email.lastDate,
    isRead: email.isRead,
    hasAttachments: email.hasAttachments || false,
    id: email.id,
  }));

  const compressedSize = JSON.stringify(compressedEmails).length;
  const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1) + '%';

  return {
    compressed: compressedEmails,
    wasCompressed: true,
    originalSize,
    compressedSize,
    compressionRatio,
  };
}

/**
 * CRM Entity Compression - Keeps key fields for different entity types
 */
const CRM_FIELD_MAPPINGS: { [key: string]: string[] } = {
  Lead: ['Id', 'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'Status', 'Rating'],
  Contact: ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Title', 'AccountId'],
  Account: ['Id', 'Name', 'Industry', 'Phone', 'Website'],
  Case: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority'],
  Opportunity: ['Id', 'Name', 'StageName', 'Amount', 'CloseDate', 'Probability'],
};

export function compressCRMData(
  resultData: any,
  maxRecords: number = EMAIL_COMPRESSION_CONFIG.MAX_EMAILS
): {
  compressed: any;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string;
  entityType?: string;
} {
  let recordArray = Array.isArray(resultData) ? resultData :
    (resultData?.records && Array.isArray(resultData.records)) ? resultData.records :
    null;

  const originalSize = JSON.stringify(resultData).length;

  if (!recordArray || recordArray.length === 0) {
    return {
      compressed: resultData,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: '0%',
    };
  }

  // Detect entity type from first record (Nango: entityType, Direct: attributes.type)
  const firstRecord = recordArray[0];
  const entityType = firstRecord?.entityType || firstRecord?.data?.attributes?.type || firstRecord?.attributes?.type || 'Unknown';
  const relevantFields = CRM_FIELD_MAPPINGS[entityType] || ['Id', 'Name'];

  const compressedRecords = recordArray.slice(0, maxRecords).map((record: any) => {
    const compressed: any = {};
    // For Nango SalesforceEntity, fields are in record.data, else directly on record
    const source = record.data || record;
    for (const field of relevantFields) {
      if (field in source) {
        compressed[field] = source[field];
      }
    }
    return compressed;
  });

  const compressedResult = {
    records: compressedRecords,
    total: recordArray.length,
    _compression: {
      kept: compressedRecords.length,
      entityType,
      fields: relevantFields,
    },
  };

  const compressedSize = JSON.stringify(compressedResult).length;
  const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1) + '%';

  return {
    compressed: compressedResult,
    wasCompressed: true,
    originalSize,
    compressedSize,
    compressionRatio,
    entityType,
  };
}
