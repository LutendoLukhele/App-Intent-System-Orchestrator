"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createEntity;
const API_VERSION = "58.0";
const FIELD_WHITELIST = {
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
function validateInput(input) {
    const errors = [];
    if (!input) {
        return { valid: false, errors: ["Input is required"] };
    }
    if (!input.entityType) {
        errors.push("entityType is required");
    }
    const validEntities = ["Contact", "Lead", "Opportunity", "Case", "Account"];
    if (!validEntities.includes(input.entityType)) {
        errors.push(`entityType must be one of: ${validEntities.join(", ")}. Got: ${input.entityType}`);
    }
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
function sanitizeRecord(entityType, record) {
    const allowed = FIELD_WHITELIST[entityType] || [];
    const out = {};
    const warnings = [];
    const invalid = [];
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
async function createEntity(nango, rawInput) {
    const actionId = `act_${Date.now().toString(36)}`;
    try {
        const isBatch = Array.isArray(rawInput.records);
        if (isBatch) {
            return await createBatch(nango, rawInput, actionId);
        }
        const validation = validateInput(rawInput);
        if (!validation.valid) {
            return {
                id: actionId,
                success: false,
                errors: validation.errors,
                data: {},
            };
        }
        const { entityType, fields, parentId } = validation.data;
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
        let endpoint = "";
        const payload = { ...sanitized };
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
        let createdRecord = { Id: createdId };
        try {
            const fetchResponse = await nango.get({
                endpoint: `/services/data/v${API_VERSION}/sobjects/${entityType}/${createdId}`,
            });
            createdRecord = fetchResponse.data || { Id: createdId };
        }
        catch (fetchErr) {
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
    }
    catch (err) {
        const errors = [];
        if (err?.response?.data) {
            const data = err.response.data;
            if (Array.isArray(data)) {
                errors.push(...data.map((e) => e.message || JSON.stringify(e)));
            }
            else if (data.message) {
                errors.push(String(data.message));
            }
            else {
                errors.push(JSON.stringify(data));
            }
        }
        else if (err.message) {
            errors.push(String(err.message));
        }
        else {
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
async function createBatch(nango, input, actionId) {
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
    const results = [];
    const errors = [];
    const warnings = [];
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
            const { record: sanitized, warnings: recordWarnings } = sanitizeRecord(entityType, record);
            if (Object.keys(sanitized).length === 0) {
                errors.push(`Record ${i + 1}: No valid fields provided`);
                results.push({ index: i, success: false, error: "No valid fields" });
                continue;
            }
            const endpoint = `/services/data/v${API_VERSION}/sobjects/${entityType}`;
            const response = await nango.post({ endpoint, data: sanitized });
            const createdId = response?.data?.id;
            if (!createdId) {
                errors.push(`Record ${i + 1}: Failed to create - no ID returned`);
                results.push({ index: i, success: false, error: "No ID returned" });
                continue;
            }
            let createdRecord = { Id: createdId };
            try {
                const fetchResponse = await nango.get({
                    endpoint: `/services/data/v${API_VERSION}/sobjects/${entityType}/${createdId}`,
                });
                createdRecord = fetchResponse.data || { Id: createdId };
            }
            catch (fetchErr) {
                warnings.push(`Record ${i + 1}: Created but could not retrieve full details`);
            }
            results.push({
                index: i,
                success: true,
                data: createdRecord,
                createdFields: Object.keys(sanitized),
            });
            warnings.push(...recordWarnings);
        }
        catch (err) {
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
