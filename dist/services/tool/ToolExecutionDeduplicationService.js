"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutionDeduplicationService = void 0;
const winston_1 = __importDefault(require("winston"));
class ToolExecutionDeduplicationService {
    constructor(entityCache) {
        this.entityCache = entityCache;
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: { service: 'ToolExecutionDeduplicationService' },
            transports: [new winston_1.default.transports.Console()],
        });
    }
    async checkForDuplicate(sessionId, request) {
        if (!this.isFetchOperation(request.toolName)) {
            return null;
        }
        const dedupeKey = {
            toolName: request.toolName,
            provider: request.provider,
            filters: this.extractFilters(request.toolName, request.arguments),
        };
        const cachedEntityIds = await this.entityCache.checkFetchDeduplication(sessionId, dedupeKey);
        if (cachedEntityIds && cachedEntityIds.length > 0) {
            this.logger.info('Duplicate fetch detected and reused', {
                sessionId,
                toolName: request.toolName,
                cachedCount: cachedEntityIds.length,
            });
            return cachedEntityIds;
        }
        return null;
    }
    async recordExecution(sessionId, request, resultEntityIds) {
        if (!this.isFetchOperation(request.toolName)) {
            return;
        }
        const dedupeKey = {
            toolName: request.toolName,
            provider: request.provider,
            filters: this.extractFilters(request.toolName, request.arguments),
        };
        await this.entityCache.recordFetchResult(sessionId, dedupeKey, resultEntityIds);
    }
    isFetchOperation(toolName) {
        const fetchTools = [
            'fetch_emails',
            'fetch_entity',
            'fetch_entities',
            'search_entities',
            'fetch_contacts',
            'fetch_deals',
            'fetch_accounts',
        ];
        return fetchTools.includes(toolName);
    }
    extractFilters(toolName, args) {
        const input = args.input || args;
        if (toolName === 'fetch_emails') {
            return {
                operation: input.operation,
                from: input.filters?.from,
                to: input.filters?.to,
                subject: input.filters?.subject,
                labels: input.filters?.labels ? input.filters.labels.sort().join(',') : undefined,
                isRead: input.filters?.isRead,
                dateRange: input.filters?.dateRange,
                limit: input.filters?.limit || input.limit || 10,
            };
        }
        if (toolName === 'fetch_entity' || toolName === 'fetch_entities') {
            return {
                operation: input.operation,
                entityType: input.entityType,
                filters: input.filters ? JSON.stringify(input.filters) : undefined,
                limit: input.limit || 20,
            };
        }
        if (toolName === 'search_entities') {
            return {
                operation: input.operation,
                entityType: input.entityType,
                query: input.query,
                limit: input.limit || 20,
            };
        }
        return JSON.parse(JSON.stringify(input));
    }
}
exports.ToolExecutionDeduplicationService = ToolExecutionDeduplicationService;
