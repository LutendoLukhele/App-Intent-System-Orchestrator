/**
 * salesforce-create-entity.ts
 *
 * Create Salesforce records - NO ZOD DEPENDENCY
 * - Pure JavaScript validation
 * - Accepts 'fields' input key
 * - Salesforce REST API v58.0
 */

type NangoAction = any;

const API_VERSION = "58.0";

// ============================================================
// FIELD WHITELISTS - Allowed fields per entity
// ============================================================

const FIELD_WHITELIST: Record<string, string[]> = {
  Contact: [
    "FirstName",
    "LastName",
    "Email",
    "Phone",
    "MobilePhone",
    "Title",
    "Description",
    "Fax",
    "AccountId",
    "MailingStreet",
    "MailingCity",
    "MailingState",
    "MailingPostalCode",
    "MailingCountry",
  ],
  Lead: [
    "FirstName",
    "LastName",
    "Company",
    "Email",
    "Phone",
    "Status",
    "Rating",
    "LeadSource",
    "Industry",
    "Description",
  ],
  Opportunity: [
    "Name",
    "Amount",
    "StageName",
    "CloseDate",
    "AccountId",
    "Description",
    "Probability",
    "NextStep",
  ],
  Case: [
    "Subject",
    "Status",
    "Priority",
    "Description",
    "AccountId",
    "ContactId",
  ],
  Account: [
    "Name",
    "Website",
    "Phone",
    "Industry",
    "NumberOfEmployees",
    "AnnualRevenue",
    "Description",
    "BillingStreet",
    "BillingCity",
    "BillingState",
    "BillingPostalCode",
    "BillingCountry",
  ],
};

// ============================================================
// VALIDATION & SANITIZATION
// ============================================================

function validateInput(input: any): {
  valid: boolean;
  errors: string[];
  data?: {
    entityType: string;
    fields: Record<string, any>;
    parentId?: string;
  };
} {
  const errors: string[] = [];

  // Check required fields
  if (!input) {
    return { valid: false, errors: ["Input is required"] };
  }

  if (!input.entityType) {
    errors.push("entityType is required");
  }

  const validEntities = ["Contact", "Lead", "Opportunity", "Case", "Account"];
  if (!validEntities.includes(input.entityType)) {
    errors.push(
      `entityType must be one of: ${validEntities.join(", ")}. Got: ${input.entityType}`
    );
  }

  // Get data from 'fields' (or 'record' for backward compatibility)
  const data = input.fields || input.record;
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    errors.push("Must provide 'fields' with at least one field");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      entityType: input.entityType,
      fields: data || {},
      parentId: input.parentId,
    },
  };
}

function sanitizeRecord(entityType: string, record: Record<string, any>): {
  record: Record<string, any>;
  warnings: string[];
} {
  const allowed = FIELD_WHITELIST[entityType] || [];
  const out: Record<string, any> = {};
  const warnings: string[] = [];
  const invalid: string[] = [];

  for (const [key, value] of Object.entries(record || {})) {
    if (!allowed.includes(key)) {
      invalid.push(key);
      continue;
    }
    if (value !== null && value !== undefined) {
      out[key] = value;
    }
  }

  if (invalid.length > 0) {
    warnings.push(`Skipped invalid fields: ${invalid.join(", ")}. Allowed: [${allowed.join(", ")}]`);
  }

  return { record: out, warnings };
}

// ============================================================
// MAIN EXPORT
// ============================================================

export default async function createEntity(nango: NangoAction, rawInput: any): Promise<any> {
  const actionId = `act_${Date.now().toString(36)}`;

  try {
    // BATCH SUPPORT: Check if creating multiple records
    const isBatch = Array.isArray(rawInput.records);
    
    if (isBatch) {
      return await createBatch(nango, rawInput, actionId);
    }

    // Step 1: Validate input
    const validation = validateInput(rawInput);
    if (!validation.valid) {
      return {
        id: actionId,
        success: false,
        errors: validation.errors,
        data: {},
      };
    }

    const { entityType, fields, parentId } = validation.data!;

    // Step 2: Sanitize fields
    const { record: sanitized, warnings } = sanitizeRecord(entityType, fields);

    if (Object.keys(sanitized).length === 0) {
      return {
        id: actionId,
        success: false,
        errors: [
          `No valid fields provided for ${entityType}. ${warnings[0] || "Check field names."}`,
        ],
        data: {},
      };
    }

    // Step 3: Build request
    let endpoint = "";
    const payload: Record<string, any> = { ...sanitized };

    switch (entityType) {
      case "Contact":
        endpoint = `/services/data/v${API_VERSION}/sobjects/Contact`;
        break;
      case "Lead":
        endpoint = `/services/data/v${API_VERSION}/sobjects/Lead`;
        break;
      case "Opportunity":
        endpoint = `/services/data/v${API_VERSION}/sobjects/Opportunity`;
        break;
      case "Case":
        endpoint = `/services/data/v${API_VERSION}/sobjects/Case`;
        break;
      case "Account":
        endpoint = `/services/data/v${API_VERSION}/sobjects/Account`;
        break;
      default:
        return {
          id: actionId,
          success: false,
          errors: [`Unknown entity type: ${entityType}`],
          data: {},
        };
    }

    // Step 4: Make API call
    const response = await nango.post({
      endpoint,
      data: payload,
    });

    const createdId = response?.data?.id || null;

    if (!createdId) {
      return {
        id: actionId,
        success: false,
        errors: ["Failed to create record - no ID returned"],
        data: {},
      };
    }

    // Step 5: Refetch the created record to return full details
    // This enables FollowUpService to generate conversational summaries
    let createdRecord: any = { Id: createdId };
    try {
      const fetchResponse = await nango.get({
        endpoint: `/services/data/v${API_VERSION}/sobjects/${entityType}/${createdId}`,
      });
      createdRecord = fetchResponse.data || { Id: createdId };
    } catch (fetchErr) {
      // If refetch fails, return basic success with ID only
      warnings.push("Record created but could not retrieve full details");
    }

    return {
      id: actionId,
      success: true,
      errors: null,
      data: {
        ...createdRecord,
        _metadata: {
          created: true,
          createdFields: Object.keys(sanitized),
          warnings: warnings.length > 0 ? warnings : null,
        },
      },
    };
  } catch (err: any) {
    const errors: string[] = [];

    if (err?.response?.data) {
      const data = err.response.data;
      if (Array.isArray(data)) {
        errors.push(...data.map((e: any) => e.message || JSON.stringify(e)));
      } else if (data.message) {
        errors.push(String(data.message));
      } else {
        errors.push(JSON.stringify(data));
      }
    } else if (err.message) {
      errors.push(String(err.message));
    } else {
      errors.push(String(err));
    }

    return {
      id: actionId,
      success: false,
      errors,
      data: {},
    };
  }
}

// ============================================================
// BATCH CREATION
// ============================================================

async function createBatch(nango: NangoAction, input: any, actionId: string): Promise<any> {
  const { entityType, records } = input;
  
  if (!entityType) {
    return {
      id: actionId,
      success: false,
      errors: ["entityType is required for batch creation"],
      data: { created: [], failed: [] },
    };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return {
      id: actionId,
      success: false,
      errors: ["records array is required and must not be empty"],
      data: { created: [], failed: [] },
    };
  }

  const results: any[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Process each record sequentially (Salesforce doesn't have efficient batch create in REST API)
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    try {
      // Sanitize fields
      const { record: sanitized, warnings: recordWarnings } = sanitizeRecord(entityType, record);
      
      if (Object.keys(sanitized).length === 0) {
        errors.push(`Record ${i + 1}: No valid fields provided`);
        results.push({ index: i, success: false, error: "No valid fields" });
        continue;
      }

      // Create record
      const endpoint = `/services/data/v${API_VERSION}/sobjects/${entityType}`;
      const response = await nango.post({ endpoint, data: sanitized });
      const createdId = response?.data?.id;

      if (!createdId) {
        errors.push(`Record ${i + 1}: Failed to create - no ID returned`);
        results.push({ index: i, success: false, error: "No ID returned" });
        continue;
      }

      // Refetch full record
      let createdRecord: any = { Id: createdId };
      try {
        const fetchResponse = await nango.get({
          endpoint: `/services/data/v${API_VERSION}/sobjects/${entityType}/${createdId}`,
        });
        createdRecord = fetchResponse.data || { Id: createdId };
      } catch (fetchErr) {
        warnings.push(`Record ${i + 1}: Created but could not retrieve full details`);
      }

      results.push({
        index: i,
        success: true,
        data: createdRecord,
        createdFields: Object.keys(sanitized),
      });

      warnings.push(...recordWarnings);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.[0]?.message || err.message || "Unknown error";
      errors.push(`Record ${i + 1}: ${errorMsg}`);
      results.push({ index: i, success: false, error: errorMsg });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.length - successCount;

  return {
    id: actionId,
    success: successCount > 0,
    errors: errors.length > 0 ? errors : null,
    data: {
      created: results.filter(r => r.success).map(r => r.data),
      failed: results.filter(r => !r.success),
      _metadata: {
        created: true,
        totalRecords: records.length,
        successCount,
        failedCount,
        warnings: warnings.length > 0 ? warnings : null,
      },
    },
  };
}
