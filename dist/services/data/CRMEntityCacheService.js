"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRMEntityCacheService = void 0;
const winston_1 = __importDefault(require("winston"));
const crypto_1 = __importDefault(require("crypto"));
class CRMEntityCacheService {
    constructor(redis) {
        this.ENTITY_CACHE_TTL = 24 * 60 * 60;
        this.FETCH_RESULT_TTL = 60 * 60;
        this.MAX_CLEAN_BODY_SIZE = 5 * 1024;
        this.MAX_EMAILS_IN_HYDRATED_CONTEXT = 5;
        this.redis = redis;
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: { service: 'CRMEntityCacheService' },
            transports: [new winston_1.default.transports.Console()],
        });
    }
    async cacheEntity(sessionId, entity) {
        const key = this.getEntityCacheKey(sessionId, entity.id);
        const cacheEntry = {
            ...entity,
            timestamp: Date.now(),
        };
        try {
            await this.redis.setex(key, this.ENTITY_CACHE_TTL, JSON.stringify(cacheEntry));
            this.logger.info('Entity cached', {
                sessionId,
                entityId: entity.id,
                type: entity.type,
                bodySize: entity.cleanBody.length,
            });
        }
        catch (err) {
            this.logger.error('Failed to cache entity', {
                sessionId,
                entityId: entity.id,
                error: err.message,
            });
        }
    }
    async getEntity(sessionId, entityId) {
        const key = this.getEntityCacheKey(sessionId, entityId);
        try {
            const cached = await this.redis.get(key);
            if (!cached)
                return null;
            return JSON.parse(cached);
        }
        catch (err) {
            this.logger.error('Failed to retrieve cached entity', {
                sessionId,
                entityId,
                error: err.message,
            });
            return null;
        }
    }
    async getEntities(sessionId, entityIds) {
        const keys = entityIds.map((id) => this.getEntityCacheKey(sessionId, id));
        try {
            const results = await this.redis.mget(...keys);
            return results
                .filter((r) => r !== null)
                .map((r) => JSON.parse(r));
        }
        catch (err) {
            this.logger.error('Failed to batch retrieve entities', {
                sessionId,
                count: entityIds.length,
                error: err.message,
            });
            return [];
        }
    }
    async checkFetchDeduplication(sessionId, dedupeKey) {
        const hashKey = this.getFetchDedupeKey(sessionId, dedupeKey);
        try {
            const cached = await this.redis.get(hashKey);
            if (!cached)
                return null;
            const result = JSON.parse(cached);
            this.logger.info('Fetch deduplication hit', {
                sessionId,
                toolName: dedupeKey.toolName,
                entityCount: result.entityIds.length,
                ageSeconds: Math.round((Date.now() - result.timestamp) / 1000),
            });
            return result.entityIds;
        }
        catch (err) {
            this.logger.warn('Fetch dedup check failed', {
                sessionId,
                error: err.message,
            });
            return null;
        }
    }
    async recordFetchResult(sessionId, dedupeKey, entityIds) {
        const hashKey = this.getFetchDedupeKey(sessionId, dedupeKey);
        const result = {
            entityIds,
            resultHash: crypto_1.default.createHash('md5').update(entityIds.join(',')).digest('hex'),
            timestamp: Date.now(),
            sessionId,
        };
        try {
            await this.redis.setex(hashKey, this.FETCH_RESULT_TTL, JSON.stringify(result));
            this.logger.info('Fetch result recorded for dedup', {
                sessionId,
                toolName: dedupeKey.toolName,
                entityCount: entityIds.length,
            });
        }
        catch (err) {
            this.logger.error('Failed to record fetch result', {
                sessionId,
                error: err.message,
            });
        }
    }
    extractCleanBody(rawBody, bodyHtml, type) {
        if (!rawBody && !bodyHtml) {
            return { cleanBody: '[No body content available]', bodyHash: '' };
        }
        let text = rawBody || bodyHtml || '';
        text = this.stripEmailFooters(text);
        text = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join('\n');
        text = text.replace(/<[^>]*>/g, '');
        text = this.decodeHtmlEntities(text);
        if (text.length > this.MAX_CLEAN_BODY_SIZE) {
            text =
                text.substring(0, this.MAX_CLEAN_BODY_SIZE) +
                    '\n[... Content truncated for conversation context. Use reuse_cached_entity to view full body.]';
        }
        const bodyHash = crypto_1.default.createHash('md5').update(text).digest('hex');
        return { cleanBody: text, bodyHash };
    }
    generateIndexEntry(entity) {
        if (entity.type === 'email') {
            return {
                id: entity.id,
                type: 'email',
                from: entity.from,
                subject: entity.subject,
                timestamp: new Date(entity.timestamp).toISOString(),
                _cached: true,
                _bodySize: entity.cleanBody.length,
            };
        }
        else if (['contact', 'lead', 'account', 'deal', 'record'].includes(entity.type)) {
            return {
                id: entity.id,
                type: entity.type,
                name: entity.name || entity.accountName,
                provider: entity.provider,
                timestamp: new Date(entity.timestamp).toISOString(),
                _cached: true,
                _dataSize: entity.cleanBody.length,
            };
        }
        return {
            id: entity.id,
            type: entity.type,
            _cached: true,
        };
    }
    async getRecentCachedEntities(sessionId, entityType, limit = this.MAX_EMAILS_IN_HYDRATED_CONTEXT) {
        const pattern = `crm-entity:${sessionId}:*`;
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length === 0)
                return [];
            const entities = await this.getEntities(sessionId, keys.map((k) => k.split(':')[3]));
            return entities
                .filter((e) => e.type === entityType)
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);
        }
        catch (err) {
            this.logger.error('Failed to get recent cached entities', {
                sessionId,
                entityType,
                error: err.message,
            });
            return [];
        }
    }
    async clearSessionCache(sessionId) {
        const pattern = `crm-entity:${sessionId}:*`;
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                this.logger.info('Session cache cleared', {
                    sessionId,
                    entriesRemoved: keys.length,
                });
            }
        }
        catch (err) {
            this.logger.error('Failed to clear session cache', {
                sessionId,
                error: err.message,
            });
        }
    }
    getEntityCacheKey(sessionId, entityId) {
        return `crm-entity:${sessionId}:${entityId}`;
    }
    getFetchDedupeKey(sessionId, dedupeKey) {
        const hash = crypto_1.default
            .createHash('md5')
            .update(JSON.stringify(dedupeKey))
            .digest('hex');
        return `fetch-dedup:${sessionId}:${hash}`;
    }
    stripEmailFooters(text) {
        const footerPatterns = [
            /\n--+.*\n[\s\S]*/i,
            /Sent from.*/i,
            /Best regards.*/i,
            /unsubscribe/i,
            /manage preferences/i,
            /\|.*view.*(email|message).*/i,
            /©.*google/i,
            /you received this email.*/i,
        ];
        let cleaned = text;
        for (const pattern of footerPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        return cleaned;
    }
    decodeHtmlEntities(text) {
        const htmlEntities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&nbsp;': ' ',
        };
        let decoded = text;
        for (const [entity, char] of Object.entries(htmlEntities)) {
            decoded = decoded.replace(new RegExp(entity, 'g'), char);
        }
        return decoded;
    }
}
exports.CRMEntityCacheService = CRMEntityCacheService;
