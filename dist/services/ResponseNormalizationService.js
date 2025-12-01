"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseNormalizationService = void 0;
const winston_1 = __importDefault(require("winston"));
class ResponseNormalizationService {
    constructor() {
        this.MAX_LLM_CONTEXT_SIZE = 50 * 1024;
        this.EMAIL_BODY_REMOVAL_THRESHOLD = 1024;
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: { service: 'ResponseNormalizationService' },
            transports: [new winston_1.default.transports.Console()],
        });
    }
    normalizeForLLM(toolName, response) {
        const originalSize = JSON.stringify(response).length;
        let normalizedResponse = JSON.parse(JSON.stringify(response));
        const fieldsRemoved = [];
        if (toolName === 'fetch_emails') {
            normalizedResponse = this.normalizeEmailResponse(normalizedResponse, fieldsRemoved);
        }
        else if (toolName === 'fetch_entity' ||
            toolName === 'fetch_entities' ||
            toolName === 'search_entities') {
            normalizedResponse = this.normalizeCRMResponse(normalizedResponse, fieldsRemoved);
        }
        else if (toolName.includes('calendar') || toolName.includes('event')) {
            normalizedResponse = this.normalizeCalendarResponse(normalizedResponse, fieldsRemoved);
        }
        const normalizedSize = JSON.stringify(normalizedResponse).length;
        const wasChanged = fieldsRemoved.length > 0;
        const truncationMetadata = {
            was_truncated: wasChanged,
            original_size_bytes: originalSize,
            normalized_size_bytes: normalizedSize,
            fields_removed: fieldsRemoved,
            reason: wasChanged
                ? `LLM optimization: cleaned and capped body text, removed HTML and footers`
                : 'No normalization needed',
        };
        if (wasChanged) {
            const reductionPercent = (((originalSize - normalizedSize) / originalSize) *
                100).toFixed(2);
            this.logger.info('Response normalized for LLM', {
                toolName,
                originalSize,
                normalizedSize,
                reductionPercent: `${reductionPercent}%`,
                fieldsRemoved,
            });
        }
        return {
            originalResponse: response,
            llmResponse: normalizedResponse,
            truncationMetadata,
        };
    }
    normalizeEmailResponse(response, fieldsRemoved) {
        if (!response)
            return response;
        if (Array.isArray(response)) {
            return response.map((email) => this.normalizeEmailObject(email, fieldsRemoved));
        }
        if (response.data && Array.isArray(response.data)) {
            response.data = response.data.map((email) => this.normalizeEmailObject(email, fieldsRemoved));
            return response;
        }
        return this.normalizeEmailObject(response, fieldsRemoved);
    }
    normalizeEmailObject(email, fieldsRemoved) {
        if (!email || typeof email !== 'object')
            return email;
        const normalized = { ...email };
        const MAX_BODY_LENGTH = 3000;
        if (normalized.body_html) {
            if (!fieldsRemoved.includes('body_html'))
                fieldsRemoved.push('body_html');
            delete normalized.body_html;
        }
        if (normalized.body_text && typeof normalized.body_text === 'string') {
            let cleanedBody = normalized.body_text
                .replace(/\r\n/g, '\n')
                .replace(/\n\n\n+/g, '\n\n')
                .replace(/[ \t]+/g, ' ')
                .trim();
            cleanedBody = this.stripEmailFooters(cleanedBody);
            if (cleanedBody.length > MAX_BODY_LENGTH) {
                const truncated = cleanedBody.substring(0, MAX_BODY_LENGTH);
                normalized.body_text = truncated + '\n\n[... Email body truncated for LLM context. Use fetch_full_email_body to retrieve full content.]';
                normalized._body_truncated = true;
                normalized._original_body_length = email.body_text.length;
                if (!fieldsRemoved.includes('body_text (truncated)'))
                    fieldsRemoved.push('body_text (truncated)');
            }
            else {
                normalized.body_text = cleanedBody;
            }
        }
        if (normalized.preview && typeof normalized.preview === 'string') {
            if (normalized.preview.length > 500) {
                normalized.preview = normalized.preview.substring(0, 500) + '...[truncated]';
            }
        }
        if (normalized.headers && typeof normalized.headers === 'object') {
            const headersSize = JSON.stringify(normalized.headers).length;
            if (headersSize > 5 * 1024) {
                if (!fieldsRemoved.includes('headers (summarized)'))
                    fieldsRemoved.push('headers (summarized)');
                normalized.headers = Object.keys(normalized.headers);
            }
        }
        return normalized;
    }
    stripEmailFooters(body) {
        const patterns = [
            /unsubscribe[^\n]*/gi,
            /manage preferences[^\n]*/gi,
            /^--\s*\n.+/gm,
            /^\d{4}-\d{2}-\d{2}.+sent from.+/gim,
            /this is a \[?automated\]? email.+/gi,
        ];
        let cleaned = body;
        for (const pattern of patterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        return cleaned.trim();
    }
    normalizeCRMResponse(response, fieldsRemoved) {
        if (!response)
            return response;
        if (Array.isArray(response)) {
            return response.map((entity) => this.normalizeCRMEntity(entity, fieldsRemoved));
        }
        if (response.data && Array.isArray(response.data)) {
            response.data = response.data.map((entity) => this.normalizeCRMEntity(entity, fieldsRemoved));
            return response;
        }
        return this.normalizeCRMEntity(response, fieldsRemoved);
    }
    normalizeCRMEntity(entity, fieldsRemoved) {
        if (!entity || typeof entity !== 'object')
            return entity;
        const normalized = { ...entity };
        const verboseFields = [
            'description',
            'notes',
            'long_description',
            'body',
            'content',
        ];
        for (const field of verboseFields) {
            if (normalized[field] &&
                typeof normalized[field] === 'string' &&
                normalized[field].length > 2 * 1024) {
                if (!fieldsRemoved.includes(`${field} (truncated)`))
                    fieldsRemoved.push(`${field} (truncated)`);
                normalized[field] =
                    normalized[field].substring(0, 500) +
                        `\n...[${normalized[field].length - 500} more characters truncated for LLM context]`;
            }
        }
        return normalized;
    }
    normalizeCalendarResponse(response, fieldsRemoved) {
        if (!response)
            return response;
        if (Array.isArray(response)) {
            return response.map((event) => {
                if (event.description && event.description.length > 1024) {
                    if (!fieldsRemoved.includes('event_description (truncated)'))
                        fieldsRemoved.push('event_description (truncated)');
                    event.description = event.description.substring(0, 500) + '...[truncated]';
                }
                return event;
            });
        }
        return response;
    }
    estimateSize(data) {
        try {
            return JSON.stringify(data).length;
        }
        catch {
            return 0;
        }
    }
}
exports.ResponseNormalizationService = ResponseNormalizationService;
