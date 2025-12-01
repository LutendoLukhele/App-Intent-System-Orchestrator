"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionAwareWarmupManager = void 0;
const winston_1 = __importDefault(require("winston"));
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
class SessionAwareWarmupManager {
    constructor(redisClient) {
        this.WARMUP_CACHE_TTL = 30 * 60;
        this.WARMUP_PREFIX = 'warmup:';
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: { service: 'SessionAwareWarmupManager' },
            transports: [new winston_1.default.transports.Console()],
        });
        this.redis = redisClient || new ioredis_1.default(config_1.CONFIG.REDIS_URL);
    }
    async isWarmed(sessionId, provider, connectionId) {
        const key = this.buildCacheKey(sessionId, provider, connectionId);
        const cached = await this.redis.get(key);
        return cached !== null;
    }
    async setWarmed(sessionId, provider, connectionId, duration) {
        const key = this.buildCacheKey(sessionId, provider, connectionId);
        const data = JSON.stringify({
            warmedAt: Date.now(),
            duration,
        });
        await this.redis.setex(key, this.WARMUP_CACHE_TTL, data);
    }
    async getProvidersNeedingWarmup(sessionId, connectionIds) {
        const needsWarmup = [];
        for (const [provider, connectionId] of Object.entries(connectionIds)) {
            const warmed = await this.isWarmed(sessionId, provider, connectionId);
            if (!warmed) {
                needsWarmup.push({ provider, connectionId });
            }
        }
        return needsWarmup;
    }
    async warmupProvider(sessionId, provider, connectionId, performWarmup) {
        const startTime = Date.now();
        const status = {
            provider,
            connectionId,
            warmed: false,
            warmedAt: 0,
            duration: 0,
        };
        try {
            this.logger.info('Starting provider warmup via Nango', {
                sessionId,
                provider,
                connectionId: '***',
                note: 'Warmup action result will be cached, not broadcast',
            });
            await performWarmup();
            const duration = Date.now() - startTime;
            status.warmed = true;
            status.warmedAt = Date.now();
            status.duration = duration;
            await this.setWarmed(sessionId, provider, connectionId, duration);
            this.logger.info('Provider warmup via Nango successful', {
                sessionId,
                provider,
                duration,
                connectionId: '***',
                note: 'Connection ready for user actions',
            });
            return status;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            status.warmed = false;
            status.duration = duration;
            status.error = error.message || 'Unknown warmup error';
            this.logger.warn('Provider warmup via Nango failed', {
                sessionId,
                provider,
                error: error.message,
                duration,
                connectionId: '***',
                note: 'Will retry on next user action',
            });
            return status;
        }
    }
    createWarmupAction(provider, connectionId, actionId) {
        return {
            id: actionId || `warmup_${provider}_${Date.now()}`,
            type: 'warmup',
            provider,
            connectionId,
            status: 'pending',
        };
    }
    buildCacheKey(sessionId, provider, connectionId) {
        return `${this.WARMUP_PREFIX}${sessionId}:${provider}:${connectionId}`;
    }
    async clearSessionWarmup(sessionId) {
        const pattern = `${this.WARMUP_PREFIX}${sessionId}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
            this.logger.info('Cleared warmup cache for session', { sessionId, keysCleared: keys.length });
        }
    }
    async getWarmupStats(sessionId) {
        const pattern = `${this.WARMUP_PREFIX}${sessionId}:*`;
        const keys = await this.redis.keys(pattern);
        const stats = {
            sessionId,
            providersWarmed: keys.length,
            providers: [],
        };
        for (const key of keys) {
            const data = await this.redis.get(key);
            if (data) {
                const parsed = JSON.parse(data);
                stats.providers.push({
                    key: key.replace(this.WARMUP_PREFIX, ''),
                    ...parsed,
                });
            }
        }
        return stats;
    }
    async clearAllWarmupCaches() {
        const pattern = `${this.WARMUP_PREFIX}*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
            this.logger.info('Cleared all warmup caches', { keysCleared: keys.length });
        }
    }
}
exports.SessionAwareWarmupManager = SessionAwareWarmupManager;
