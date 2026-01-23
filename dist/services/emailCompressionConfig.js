"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_COMPRESSION_CONFIG = void 0;
exports.compressEmailData = compressEmailData;
exports.compressCRMData = compressCRMData;
exports.EMAIL_COMPRESSION_CONFIG = {
    MAX_EMAILS: 5,
    BODY_CHAR_LIMIT: 800,
};
function compressEmailData(resultData, maxEmails = exports.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS, bodyCharLimit = exports.EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT) {
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
    const compressedEmails = emailArray.slice(0, maxEmails).map((email) => ({
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
const CRM_FIELD_MAPPINGS = {
    Lead: ['Id', 'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'Status', 'Rating'],
    Contact: ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Title', 'AccountId'],
    Account: ['Id', 'Name', 'Industry', 'Phone', 'Website'],
    Case: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority'],
    Opportunity: ['Id', 'Name', 'StageName', 'Amount', 'CloseDate', 'Probability'],
};
function compressCRMData(resultData, maxRecords = exports.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS) {
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
    const firstRecord = recordArray[0];
    const entityType = firstRecord?.entityType || firstRecord?.data?.attributes?.type || firstRecord?.attributes?.type || 'Unknown';
    const relevantFields = CRM_FIELD_MAPPINGS[entityType] || ['Id', 'Name'];
    const compressedRecords = recordArray.slice(0, maxRecords).map((record) => {
        const compressed = {};
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
