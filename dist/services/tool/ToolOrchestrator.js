"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolOrchestrator = void 0;
const BaseService_1 = require("../base/BaseService");
const winston_1 = __importDefault(require("winston"));
const ResponseNormalizationService_1 = require("../ResponseNormalizationService");
const uuid_1 = require("uuid");
const config_1 = require("../../config");
const ioredis_1 = __importDefault(require("ioredis"));
const serverless_1 = require("@neondatabase/serverless");
const providerAliases_1 = require("./providerAliases");
const CRMEntityCacheService_1 = require("../data/CRMEntityCacheService");
const ToolExecutionDeduplicationService_1 = require("./ToolExecutionDeduplicationService");
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [new winston_1.default.transports.Console()],
});
const redis = new ioredis_1.default(config_1.CONFIG.REDIS_URL);
const sql = (0, serverless_1.neon)('postgresql://neondb_owner:npg_DZ9VLGrHc7jf@ep-hidden-field-advbvi8f-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require');
class ToolOrchestrator extends BaseService_1.BaseService {
    constructor(config) {
        super({ logger: config.logger });
        this.nangoService = config.nangoService;
        this.toolConfigManager = config.toolConfigManager;
        this.normalizationService = new ResponseNormalizationService_1.ResponseNormalizationService();
        const redisClient = config.redisClient || new ioredis_1.default(config_1.CONFIG.REDIS_URL);
        this.entityCache = new CRMEntityCacheService_1.CRMEntityCacheService(redisClient);
        this.deduplicationService = new ToolExecutionDeduplicationService_1.ToolExecutionDeduplicationService(this.entityCache);
        logger.info("ToolOrchestrator initialized with CRM entity caching and deduplication.");
    }
    async executeTool(toolCall, planId, stepId, sessionId) {
        const executionId = toolCall.id || (0, uuid_1.v4)();
        const { name: toolName, arguments: originalArgs } = toolCall;
        this.logger.info(`Executing tool: '${toolName}'`, { executionId, toolName, userId: toolCall.userId });
        try {
            if (sessionId) {
                const toolCallProvider = toolCall.provider || 'nango';
                const dedupeKey = {
                    toolName,
                    provider: toolCallProvider,
                    arguments: originalArgs,
                };
                const cachedEntityIds = await this.deduplicationService.checkForDuplicate(sessionId, dedupeKey);
                if (cachedEntityIds && cachedEntityIds.length > 0) {
                    this.logger.info('Returning deduplicated cached result', {
                        executionId,
                        toolName,
                        cachedCount: cachedEntityIds.length,
                        sessionId,
                    });
                    const cachedEntities = await this.entityCache.getEntities(sessionId, cachedEntityIds);
                    if (cachedEntities.length > 0) {
                        const hydratedResult = cachedEntities.map(entity => ({
                            id: entity.id,
                            type: entity.type,
                            from: entity.from,
                            to: entity.to,
                            subject: entity.subject,
                            name: entity.name,
                            body_text: entity.cleanBody,
                            body_html: undefined,
                            _cached: true,
                            _cacheTimestamp: new Date(entity.timestamp).toISOString(),
                            ...entity.metadata,
                        }));
                        return {
                            status: 'success',
                            toolName,
                            data: hydratedResult,
                            error: '',
                        };
                    }
                    else {
                        this.logger.warn('Failed to retrieve cached entities, returning reference', {
                            sessionId,
                            entityCount: cachedEntityIds.length,
                        });
                        return {
                            status: 'success',
                            toolName,
                            data: {
                                _deduped: true,
                                _cacheInfo: `Using ${cachedEntityIds.length} cached entities from earlier in conversation`,
                                total: cachedEntityIds.length,
                                source: 'cache',
                            },
                            error: '',
                        };
                    }
                }
            }
            const toolCallToExecute = { ...toolCall };
            let originalToolArgs = toolCall.arguments?.input || toolCall.arguments || {};
            if (toolName === 'fetch_entity') {
                this.logger.info('Applying fetch_entity normalization logic.');
                toolCallToExecute.arguments = this._normalizeFetchEntityArgs(originalToolArgs);
            }
            else if (toolName === 'create_entity') {
                this.logger.info('Applying create_entity normalization logic.');
                toolCallToExecute.arguments = this._normalizeCreateEntityArgs(originalToolArgs);
            }
            else if (toolName === 'update_entity') {
                this.logger.info('Applying update_entity normalization logic.');
                toolCallToExecute.arguments = this._normalizeUpdateEntityArgs(originalToolArgs);
            }
            const toolConfig = this.toolConfigManager.getToolConfig(toolName);
            const source = toolConfig?.source;
            let nangoResult;
            if (source === 'cache') {
                this.logger.info(`Routing ${toolName} to cache-based execution`);
                nangoResult = await this.executeCacheTool(toolCallToExecute);
            }
            else {
                this.logger.info(`Routing ${toolName} to action-based execution`);
                nangoResult = await this.executeNangoActionDispatcher(toolCallToExecute);
            }
            let finalData;
            if (nangoResult && typeof nangoResult.truncated_response === 'string') {
                try {
                    finalData = JSON.parse(nangoResult.truncated_response);
                }
                catch {
                    finalData = { error: 'Failed to parse truncated response.', raw: nangoResult.truncated_response };
                }
            }
            else if (nangoResult?.success === false) {
                return { status: 'failed', toolName, data: null, error: nangoResult.message };
            }
            else {
                finalData = nangoResult;
            }
            const { originalResponse, llmResponse, truncationMetadata } = this.normalizationService.normalizeForLLM(toolName, finalData);
            if (sessionId && this._isFetchToolResult(toolName, llmResponse)) {
                await this._cacheEntityResults(sessionId, toolName, originalArgs, llmResponse);
                const entityIds = this._extractEntityIds(llmResponse);
                if (entityIds.length > 0) {
                    const toolCallProvider = toolCall.provider || 'nango';
                    await this.deduplicationService.recordExecution(sessionId, { toolName, provider: toolCallProvider, arguments: originalArgs }, entityIds);
                }
            }
            const enrichedData = {
                ...llmResponse,
                _truncation_metadata: truncationMetadata,
            };
            return { status: 'success', toolName, data: enrichedData, error: '' };
        }
        catch (error) {
            logger.error('Tool execution failed unexpectedly in orchestrator', { error: error.message, stack: error.stack, toolCall });
            const errorResponse = {
                status: 'failed',
                toolName: toolCall.name,
                data: null,
                error: error.message || 'Unknown error'
            };
            if (error.nangoErrorDetails) {
                errorResponse.errorDetails = error.nangoErrorDetails;
            }
            return errorResponse;
        }
    }
    _normalizeFetchEntityArgs(args) {
        const wrapIfPresent = (value) => {
            if (value === undefined)
                return undefined;
            return { type: value, nullable: value == null };
        };
        const identifierWrapped = (() => {
            if (args.identifier === 'all')
                return { type: 'all', nullable: false };
            return wrapIfPresent(args.identifier);
        })();
        const filters = (args.filters && Object.keys(args.filters).length > 0) ? args.filters : undefined;
        const normalizedEntityType = this.normalizeEntityType(args.entityType);
        return {
            operation: args.operation || 'fetch',
            entityType: normalizedEntityType,
            identifier: identifierWrapped,
            identifierType: wrapIfPresent(args.identifierType),
            timeFrame: wrapIfPresent(args.timeFrame),
            filters: filters,
            format: wrapIfPresent(args.format),
            countOnly: { type: !!args.countOnly, nullable: false },
            limit: wrapIfPresent(args.limit)
        };
    }
    _normalizeCreateEntityArgs(args) {
        const normalizedArgs = {
            operation: args.operation || 'create',
            entityType: this.normalizeEntityType(args.entityType),
        };
        if (args.record !== undefined) {
            normalizedArgs.record = args.record;
        }
        if (args.fields !== undefined) {
            normalizedArgs.fields = args.fields;
        }
        if (args.records !== undefined) {
            normalizedArgs.records = args.records;
        }
        if (args.parentId !== undefined) {
            normalizedArgs.parentId = args.parentId;
        }
        if (args.idempotencyKey !== undefined) {
            normalizedArgs.idempotencyKey = args.idempotencyKey;
        }
        if (args.format !== undefined) {
            normalizedArgs.format = args.format;
        }
        return normalizedArgs;
    }
    _normalizeUpdateEntityArgs(args) {
        const normalizedArgs = {
            operation: args.operation || 'update',
            entityType: this.normalizeEntityType(args.entityType),
        };
        if (args.identifier !== undefined) {
            normalizedArgs.identifier = args.identifier;
        }
        if (args.identifierType !== undefined) {
            normalizedArgs.identifierType = args.identifierType;
        }
        if (args.record !== undefined) {
            normalizedArgs.record = args.record;
        }
        if (args.fields !== undefined) {
            normalizedArgs.fields = args.fields;
        }
        if (args.records !== undefined) {
            normalizedArgs.records = args.records;
        }
        if (args.idempotencyKey !== undefined) {
            normalizedArgs.idempotencyKey = args.idempotencyKey;
        }
        if (args.format !== undefined) {
            normalizedArgs.format = args.format;
        }
        return normalizedArgs;
    }
    async resolveConnectionId(userId, providerConfigKey) {
        this.logger.info(`Querying database for connectionId`, {
            userId,
            providerConfigKey,
            table: 'connections'
        });
        const providerCandidates = Array.from(new Set((0, providerAliases_1.getCanonicalProviderChain)(providerConfigKey)));
        this.logger.info(`Resolving connection across provider aliases`, {
            userId,
            providerConfigKey,
            providerCandidates
        });
        for (const candidateProvider of providerCandidates) {
            const rows = await sql `
                SELECT connection_id, provider, last_poll_at, enabled FROM connections
                WHERE user_id = ${userId} AND provider = ${candidateProvider}
                ORDER BY last_poll_at DESC NULLS LAST, created_at DESC
            `;
            this.logger.info(`Database query result for provider candidate`, {
                userId,
                providerCandidate: candidateProvider,
                rowCount: rows.length,
                providers: rows.map(r => r.provider),
                connectionDetails: rows.map(r => ({
                    id: r.connection_id.substring(0, 12) + '...',
                    lastPoll: r.last_poll_at,
                    enabled: r.enabled
                }))
            });
            if (rows.length > 0 && rows[0].connection_id) {
                const matchedProvider = (rows[0].provider || '').toLowerCase();
                this.logger.info(`Resolved connectionId from database (most recently synced)`, {
                    userId,
                    providerConfigKey,
                    connectionId: rows[0].connection_id.substring(0, 12) + '...',
                    matchedProvider,
                    lastPoll: rows[0].last_poll_at,
                    totalConnections: rows.length
                });
                return { connectionId: rows[0].connection_id, provider: matchedProvider };
            }
        }
        this.logger.error(`No connectionId found for user and provider`, {
            userId,
            providerConfigKey,
            providerCandidates,
            hint: 'Check that provider key in tool-config.json matches database rows'
        });
        const allUserProviders = await sql `
            SELECT DISTINCT provider FROM connections WHERE user_id = ${userId}
        `;
        this.logger.info(`All providers for user`, {
            userId,
            providers: allUserProviders.map(r => r.provider)
        });
        return null;
    }
    async executeNangoActionDispatcher(toolCall) {
        const { name: toolName, arguments: args, userId } = toolCall;
        const providerConfigKey = this.toolConfigManager.getProviderConfigKeyForTool(toolName);
        if (!providerConfigKey)
            throw new Error(`Missing providerConfigKey for tool: ${toolName}`);
        if (toolName === 'send_message') {
            this.logger.info('send_message tool executed (stub)', { args, userId });
            return {
                success: true,
                message: 'Message logged (stub implementation)',
                channel: args?.input?.channel,
                text: args?.input?.text
            };
        }
        const resolvedConnection = await this.resolveConnectionId(userId, providerConfigKey);
        if (!resolvedConnection)
            throw new Error(`No active connectionId found for user ${userId} for provider ${providerConfigKey}`);
        const { connectionId, provider: resolvedProvider } = resolvedConnection;
        this.logger.info(`Dispatching tool`, {
            toolName,
            userId,
            providerConfigKey,
            resolvedProvider,
            connectionId: '***'
        });
        switch (toolName) {
            case 'send_email':
                return this.nangoService.sendEmail(providerConfigKey, connectionId, args);
            case 'fetch_emails':
                return this.nangoService.fetchEmails(providerConfigKey, connectionId, args);
            case 'create_entity':
            case 'update_entity':
            case 'fetch_entity':
                return this.nangoService.triggerSalesforceAction(providerConfigKey, connectionId, args);
            case 'fetch_calendar_events':
                return this.nangoService.fetchCalendarEvents(providerConfigKey, connectionId, args);
            case 'create_calendar_event':
                return this.nangoService.createCalendarEvent(providerConfigKey, connectionId, args);
            case 'update_calendar_event':
                return this.nangoService.updateCalendarEvent(providerConfigKey, connectionId, args);
            case 'create_outlook_entity':
            case 'update_outlook_entity':
            case 'fetch_outlook_entity':
                return this.nangoService.triggerOutlookAction(providerConfigKey, connectionId, args);
            case 'fetch_outlook_event_body':
                return this.nangoService.fetchOutlookEventBody(providerConfigKey, connectionId, args);
            case 'fetch_notion_page':
            case 'create_notion_page':
            case 'update_notion_page':
                return this.nangoService.triggerGenericNangoAction(providerConfigKey, connectionId, toolName, args);
            case 'create_zoom_meeting':
                return this.nangoService.triggerGenericNangoAction(providerConfigKey, connectionId, toolName, args);
            default:
                throw new Error(`No Nango handler for tool: ${toolName}`);
        }
    }
    async executeCacheTool(toolCall) {
        const { name: toolName, arguments: args, userId } = toolCall;
        const toolConfig = this.toolConfigManager.getToolConfig(toolName);
        const providerConfigKey = this.toolConfigManager.getProviderConfigKeyForTool(toolName);
        if (!providerConfigKey)
            throw new Error(`Missing providerConfigKey for tool: ${toolName}`);
        const resolvedConnection = await this.resolveConnectionId(userId, providerConfigKey);
        if (!resolvedConnection)
            throw new Error(`No active connectionId found for user ${userId} for provider ${providerConfigKey}`);
        const { connectionId, provider: resolvedProvider } = resolvedConnection;
        this.logger.info(`Executing cache-based tool`, {
            toolName,
            userId,
            providerConfigKey,
            resolvedProvider,
            connectionId: '***'
        });
        this.logger.info(`🔍 [executeCacheTool] About to call resolveModel with args=${JSON.stringify(args).substring(0, 200)}`);
        const model = this.resolveModel(toolName, toolConfig, args);
        if (!model) {
            throw new Error(`Could not resolve Nango model for cache tool: ${toolName}`);
        }
        const isMultiEntityModel = model === 'SalesforceEntity';
        const fetchLimit = isMultiEntityModel ? 500 : (args.filters?.limit || args.limit || 100);
        const cacheOptions = {
            limit: fetchLimit,
        };
        if (args.filters?.dateRange?.after || args.filters?.after_date) {
            cacheOptions.modifiedAfter = args.filters?.dateRange?.after || args.filters?.after_date;
        }
        this.logger.info('🔍 [executeCacheTool] Cache fetch strategy', {
            model,
            isMultiEntityModel,
            userRequestedLimit: args.filters?.limit || args.limit,
            actualFetchLimit: fetchLimit,
            reason: isMultiEntityModel ? 'Multi-entity model requires larger fetch for filtering' : 'Single entity model'
        });
        this.logger.info('🔍 [executeCacheTool] Calling Nango fetchFromCache', {
            provider: providerConfigKey,
            connectionId: connectionId.substring(0, 8) + '...',
            model,
            cacheOptions,
            fullArgs: JSON.stringify(args).substring(0, 500)
        });
        const cacheResult = await this.nangoService.fetchFromCache(providerConfigKey, connectionId, model, cacheOptions);
        this.logger.info('🔍 [executeCacheTool] Nango returned', {
            recordCount: cacheResult.records?.length || 0,
            hasNextCursor: !!cacheResult.nextCursor
        });
        let records = cacheResult.records;
        if (model === 'SalesforceEntity' && args.entityType) {
            const beforeFilter = records.length;
            records = records.filter((r) => r.entityType === args.entityType);
            this.logger.info('🔍 [executeCacheTool] Filtered by entityType', {
                entityType: args.entityType,
                beforeCount: beforeFilter,
                afterCount: records.length,
                sampleEntityTypes: cacheResult.records.slice(0, 5).map((r) => r.entityType)
            });
        }
        this.logger.info('🔍 [executeCacheTool] Applying client-side filters', {
            hasFilters: !!args.filters,
            filterKeys: args.filters ? Object.keys(args.filters) : [],
            filterDetails: args.filters ? JSON.stringify(args.filters).substring(0, 300) : 'none',
            sampleRecord: records[0] ? {
                keys: Object.keys(records[0]),
                hasData: !!records[0].data,
                dataKeys: records[0].data ? Object.keys(records[0].data).slice(0, 10) : [],
                stageName: records[0].data?.StageName || records[0].StageName
            } : null
        });
        let filteredRecords = this.applyFilters(records, args, resolvedProvider, toolName);
        this.logger.info('🔍 [executeCacheTool] After client-side filtering', {
            beforeCount: records.length,
            afterCount: filteredRecords.length,
            filtered: records.length - filteredRecords.length
        });
        return {
            records: filteredRecords,
            total: filteredRecords.length,
            source: 'cache',
            nextCursor: cacheResult.nextCursor,
        };
    }
    normalizeEntityType(entityType) {
        if (!entityType)
            return entityType;
        const normalized = entityType.trim();
        const entityTypeAliases = {
            'Deal': 'Opportunity',
            'Deals': 'Opportunity',
            'deal': 'Opportunity',
            'deals': 'Opportunity',
            'Opp': 'Opportunity',
            'Opps': 'Opportunity',
            'opp': 'Opportunity',
            'opps': 'Opportunity',
            'Opportunities': 'Opportunity',
            'opportunities': 'Opportunity',
            'opportunity': 'Opportunity',
            'lead': 'Lead',
            'leads': 'Lead',
            'Leads': 'Lead',
            'contact': 'Contact',
            'contacts': 'Contact',
            'Contacts': 'Contact',
            'account': 'Account',
            'accounts': 'Account',
            'Accounts': 'Account',
            'case': 'Case',
            'cases': 'Case',
            'Cases': 'Case',
            'article': 'Article',
            'articles': 'Article',
            'Articles': 'Article',
        };
        return entityTypeAliases[normalized] || normalized;
    }
    resolveModel(toolName, toolConfig, args) {
        if (toolConfig?.cache_model) {
            return toolConfig.cache_model;
        }
        const entityType = args.entityType || args.input?.entityType;
        this.logger.info(`🔍 [resolveModel] toolName=${toolName}, entityType=${entityType}`);
        if (toolName === 'fetch_entity' && entityType) {
            const model = 'SalesforceEntity';
            this.logger.info(`🔍 [resolveModel] Result: toolName=${toolName}, entityType=${entityType}, model=${model}`);
            return model;
        }
        if (toolName === 'fetch_outlook_entity' && entityType) {
            const entityTypeMap = {
                'Message': 'OutlookMessage',
                'Event': 'OutlookEvent',
                'Contact': 'OutlookContact',
                'MailFolder': 'OutlookMailFolder',
                'Calendar': 'OutlookCalendar',
            };
            return entityTypeMap[entityType] || null;
        }
        const defaultModels = {
            'fetch_emails': 'GmailThread',
            'fetch_calendar_events': 'CalendarEvent',
            'fetch_notion_page': 'NotionPage',
        };
        return defaultModels[toolName] || null;
    }
    applyFilters(records, args, provider, toolName) {
        if (!args.filters && !args.identifier)
            return records;
        let filtered = [...records];
        const filters = args.filters || {};
        this.logger.info('🔍 [applyFilters] START', {
            inputRecordCount: records.length,
            argsKeys: Object.keys(args),
            filterKeys: Object.keys(filters),
            hasLimit: !!filters.limit || !!args.limit,
            filterLimit: filters.limit,
            argsLimit: args.limit,
            toolName
        });
        const canonicalProviders = (0, providerAliases_1.getCanonicalProviderChain)(provider);
        const isGmailProvider = canonicalProviders.includes('google-mail');
        const isCalendarProvider = canonicalProviders.includes('google-calendar');
        const isSalesforceProvider = canonicalProviders.includes('salesforce') || canonicalProviders.includes('salesforce-2') || canonicalProviders.includes('salesforce-ybzg');
        if (toolName === 'fetch_emails' || isGmailProvider) {
            if (filters.sender) {
                filtered = filtered.filter(r => r.from?.toLowerCase().includes(filters.sender.toLowerCase()) ||
                    r.lastFrom?.toLowerCase().includes(filters.sender.toLowerCase()) ||
                    r.sender?.toLowerCase().includes(filters.sender.toLowerCase()));
            }
            if (filters.subject?.contains) {
                const keywords = filters.subject.contains;
                filtered = filtered.filter(r => {
                    const subject = r.subject?.toLowerCase() || '';
                    return keywords.every((kw) => subject.includes(kw.toLowerCase()));
                });
            }
            if (filters.hasAttachment !== undefined) {
                filtered = filtered.filter(r => !!(r.hasAttachments ?? r.has_attachments) === filters.hasAttachment);
            }
            if (filters.isRead !== undefined) {
                filtered = filtered.filter(r => !!(r.isRead ?? r.is_read) === filters.isRead);
            }
            if (filters.dateRange?.after) {
                const afterDate = new Date(filters.dateRange.after);
                filtered = filtered.filter(r => {
                    const emailDate = new Date(r.lastDate || r.date || r.received_at || r.internal_date);
                    return emailDate >= afterDate;
                });
            }
            if (filters.dateRange?.before) {
                const beforeDate = new Date(filters.dateRange.before);
                filtered = filtered.filter(r => {
                    const emailDate = new Date(r.lastDate || r.date || r.received_at || r.internal_date);
                    return emailDate <= beforeDate;
                });
            }
            if (filters.semanticType) {
                filtered = filtered.filter(r => r.semanticType === filters.semanticType);
            }
            if (filters.minConfidence !== undefined) {
                filtered = filtered.filter(r => (r.semanticConfidence ?? 0) >= filters.minConfidence);
            }
        }
        if (toolName === 'fetch_calendar_events' || isCalendarProvider) {
            if (filters.dateRange?.timeMin) {
                const minDate = new Date(filters.dateRange.timeMin);
                filtered = filtered.filter(r => {
                    const startDate = new Date(r.start?.dateTime || r.start?.date || r.start_time);
                    return startDate >= minDate;
                });
            }
            if (filters.dateRange?.timeMax) {
                const maxDate = new Date(filters.dateRange.timeMax);
                filtered = filtered.filter(r => {
                    const startDate = new Date(r.start?.dateTime || r.start?.date || r.start_time);
                    return startDate <= maxDate;
                });
            }
            if (filters.q) {
                const query = filters.q.toLowerCase();
                filtered = filtered.filter(r => {
                    const summary = (r.summary || r.title || '').toLowerCase();
                    const description = (r.description || '').toLowerCase();
                    return summary.includes(query) || description.includes(query);
                });
            }
        }
        if (toolName === 'fetch_entity' || isSalesforceProvider) {
            const identifierValue = typeof args.identifier === 'object' && args.identifier?.type
                ? args.identifier.type
                : args.identifier;
            if (identifierValue && identifierValue !== 'all') {
                const identifierType = args.identifierType || 'Id';
                filtered = filtered.filter(r => r[identifierType] === identifierValue);
            }
            if (filters.conditions && Array.isArray(filters.conditions)) {
                const isSimpleLogic = filters.logic === 'AND' || filters.logic === 'OR';
                if (filters.logic && !isSimpleLogic) {
                    filtered = filtered.filter(r => this.evaluateLogicExpression(filters.logic, filters.conditions, r));
                }
                else {
                    const useOr = filters.logic === 'OR';
                    if (useOr) {
                        filtered = filtered.filter(r => filters.conditions.some((condition) => this.evaluateCondition(condition, r)));
                    }
                    else {
                        this.logger.info('🔍 [applyFilters] Using AND logic (default)', {
                            conditionCount: filters.conditions.length,
                            recordsBeforeFilter: filtered.length
                        });
                        filters.conditions.forEach((condition, index) => {
                            const beforeCount = filtered.length;
                            filtered = filtered.filter(r => this.evaluateCondition(condition, r));
                            this.logger.info('🔍 [applyFilters] Applied condition', {
                                conditionIndex: index,
                                condition: JSON.stringify(condition),
                                beforeCount,
                                afterCount: filtered.length,
                                removed: beforeCount - filtered.length
                            });
                        });
                    }
                }
            }
            if (filters.orderBy && Array.isArray(filters.orderBy)) {
                filters.orderBy.forEach((sort) => {
                    const { field, direction } = sort;
                    filtered.sort((a, b) => {
                        const aVal = a.data?.[field] ?? a[field];
                        const bVal = b.data?.[field] ?? b[field];
                        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                        return direction === 'DESC' ? -comparison : comparison;
                    });
                });
            }
            if (filters.includeFields && Array.isArray(filters.includeFields)) {
                filtered = filtered.map(r => {
                    const projected = {};
                    filters.includeFields.forEach((field) => {
                        const value = r.data?.[field] ?? r[field];
                        if (value !== undefined)
                            projected[field] = value;
                    });
                    return projected;
                });
            }
            else if (filters.excludeFields && Array.isArray(filters.excludeFields)) {
                filtered = filtered.map(r => {
                    if (r.data) {
                        const projected = { ...r, data: { ...r.data } };
                        filters.excludeFields.forEach((field) => {
                            delete projected.data[field];
                            delete projected[field];
                        });
                        return projected;
                    }
                    else {
                        const projected = { ...r };
                        filters.excludeFields.forEach((field) => {
                            delete projected[field];
                        });
                        return projected;
                    }
                });
            }
        }
        const extractValue = (val) => {
            if (val === undefined || val === null)
                return undefined;
            if (typeof val === 'number')
                return val;
            if (typeof val === 'object' && val.type !== undefined)
                return val.type;
            return undefined;
        };
        const offset = extractValue(filters.offset) ?? extractValue(args.offset) ?? 0;
        const limit = extractValue(filters.limit) ?? extractValue(args.limit) ?? 100;
        this.logger.info('🔍 [applyFilters] Pagination', {
            rawFiltersLimit: filters.limit,
            rawArgsLimit: args.limit,
            extractedLimit: limit,
            extractedOffset: offset,
            currentRecordCount: filtered.length
        });
        if (offset > 0 || limit) {
            const start = offset;
            const end = offset + limit;
            const beforeSlice = filtered.length;
            filtered = filtered.slice(start, end);
            this.logger.info('🔍 [applyFilters] After slice', {
                start,
                end,
                beforeSlice,
                afterSlice: filtered.length
            });
        }
        return filtered;
    }
    evaluateCondition(condition, record) {
        const { field, operator, value, values } = condition;
        const fieldValue = record.data?.[field] ?? record[field];
        if (Math.random() < 0.1) {
            this.logger.info('🔍 [evaluateCondition] Debug', {
                field,
                operator,
                expectedValue: value,
                actualValue: fieldValue,
                hasData: !!record.data,
                dataKeys: record.data ? Object.keys(record.data).slice(0, 5) : [],
                result: operator === 'notEquals' ? fieldValue != value : undefined
            });
        }
        switch (operator) {
            case 'equals':
                return fieldValue == value;
            case 'notEquals':
                return fieldValue != value;
            case 'greaterThan':
                return fieldValue > value;
            case 'lessThan':
                return fieldValue < value;
            case 'greaterOrEqual':
                return fieldValue >= value;
            case 'lessOrEqual':
                return fieldValue <= value;
            case 'contains':
                return String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase());
            case 'notContains':
                return !String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase());
            case 'startsWith':
                return String(fieldValue || '').toLowerCase().startsWith(String(value).toLowerCase());
            case 'endsWith':
                return String(fieldValue || '').toLowerCase().endsWith(String(value).toLowerCase());
            case 'in':
                return values && values.includes(fieldValue);
            case 'notIn':
                return values && !values.includes(fieldValue);
            case 'isNull':
                return fieldValue == null;
            case 'isNotNull':
                return fieldValue != null;
            case 'between':
                if (values && values.length === 2) {
                    return fieldValue >= values[0] && fieldValue <= values[1];
                }
                return true;
            default:
                return true;
        }
    }
    evaluateLogicExpression(logic, conditions, record) {
        try {
            let expression = logic;
            while (expression.includes('(')) {
                const innerMatch = expression.match(/\(([^()]+)\)/);
                if (!innerMatch)
                    break;
                const innerExpression = innerMatch[1];
                const innerResult = this.evaluateSimpleExpression(innerExpression, conditions, record);
                expression = expression.replace(innerMatch[0], innerResult ? 'TRUE' : 'FALSE');
            }
            return this.evaluateSimpleExpression(expression, conditions, record);
        }
        catch (error) {
            this.logger.warn('Logic expression evaluation failed, defaulting to AND', {
                logic,
                error: error.message
            });
            return conditions.every(condition => this.evaluateCondition(condition, record));
        }
    }
    evaluateSimpleExpression(expression, conditions, record) {
        const orParts = expression.split(/\s+OR\s+/i);
        if (orParts.length > 1) {
            return orParts.some(part => this.evaluateAndExpression(part.trim(), conditions, record));
        }
        return this.evaluateAndExpression(expression, conditions, record);
    }
    evaluateAndExpression(expression, conditions, record) {
        const andParts = expression.split(/\s+AND\s+/i);
        return andParts.every(part => {
            const trimmed = part.trim();
            if (trimmed === 'TRUE')
                return true;
            if (trimmed === 'FALSE')
                return false;
            const conditionIndex = parseInt(trimmed, 10) - 1;
            if (conditionIndex >= 0 && conditionIndex < conditions.length) {
                return this.evaluateCondition(conditions[conditionIndex], record);
            }
            this.logger.warn('Invalid condition number in logic expression', {
                expression,
                conditionNumber: trimmed,
                availableConditions: conditions.length
            });
            return true;
        });
    }
    async executeWarmupAction(provider, connectionId, providerConfigKey, sessionId) {
        const executionId = `warmup_${provider}_${Date.now()}`;
        this.logger.info('Executing provider warmup via Nango', {
            provider,
            connectionId: '***',
            providerConfigKey,
            sessionId,
            note: 'Result will be cached, not broadcast'
        });
        try {
            const warmupManager = this.nangoService.getWarmupManager();
            const warmupCallback = this.getProviderWarmupCallback(provider, connectionId, providerConfigKey);
            if (!warmupCallback) {
                this.logger.debug('No warmup available for provider', { provider });
                return null;
            }
            const warmupStatus = await warmupManager.warmupProvider(sessionId, provider, connectionId, warmupCallback);
            this.logger.info('Provider warmup cached (not broadcast)', {
                provider,
                warmed: warmupStatus.warmed,
                duration: warmupStatus.duration,
            });
            return warmupStatus;
        }
        catch (error) {
            this.logger.error('Provider warmup failed', {
                provider,
                error: error.message,
                connectionId: '***',
            });
            return null;
        }
    }
    getProviderWarmupCallback(provider, connectionId, providerConfigKey) {
        switch (provider.toLowerCase()) {
            case 'google':
            case 'gmail':
            case 'google-mail':
            case 'google-mail-ynxw':
                return () => this.nangoService.warmupGoogle(connectionId, providerConfigKey);
            case 'google-calendar':
                return () => this.nangoService.warmupGoogleCalendar(connectionId, providerConfigKey);
            case 'outlook':
                return () => this.nangoService.warmupOutlook(connectionId, providerConfigKey);
            case 'salesforce':
            case 'salesforce-2':
            case 'salesforce-ybzg':
                return () => this.nangoService.warmupSalesforce(connectionId, providerConfigKey);
            case 'notion':
                return () => this.nangoService.warmupNotion(connectionId, providerConfigKey);
            case 'slack':
                return () => this.nangoService.warmupSlack(connectionId, providerConfigKey);
            default:
                return null;
        }
    }
    _isFetchToolResult(toolName, result) {
        const fetchTools = ['fetch_emails', 'fetch_entity', 'fetch_entities', 'search_entities'];
        if (!fetchTools.includes(toolName))
            return false;
        if (Array.isArray(result))
            return result.length > 0;
        if (Array.isArray(result.records))
            return result.records.length > 0;
        if (Array.isArray(result.data))
            return result.data.length > 0;
        return false;
    }
    _extractEntityIds(result) {
        const items = Array.isArray(result) ? result :
            Array.isArray(result.records) ? result.records :
                Array.isArray(result.data) ? result.data : [];
        return items
            .map((item) => item.id || item.Id || item._id)
            .filter((id) => !!id);
    }
    async _cacheEntityResults(sessionId, toolName, originalArgs, result) {
        try {
            const items = Array.isArray(result) ? result :
                Array.isArray(result.records) ? result.records :
                    Array.isArray(result.data) ? result.data : [];
            for (const item of items.slice(0, 10)) {
                const entityType = this._mapToolNameToEntityType(toolName);
                const provider = this._getProviderFromToolName(toolName);
                const { cleanBody, bodyHash } = this.entityCache.extractCleanBody(item.body_text || item.body || item.description, item.body_html, entityType);
                await this.entityCache.cacheEntity(sessionId, {
                    id: item.id || item.Id || item._id || (0, uuid_1.v4)(),
                    type: entityType,
                    provider,
                    from: item.from,
                    to: item.to,
                    subject: item.subject,
                    name: item.name,
                    accountName: item.account_name,
                    cleanBody,
                    bodyHash,
                    metadata: {
                        original_id: item.id || item.Id,
                        labels: item.labels,
                        isRead: item.isRead,
                        hasAttachments: item.hasAttachments,
                        created_at: item.created_at || item.startDate,
                    },
                    sessionId,
                });
            }
            this.logger.info('Cached entity results', {
                sessionId,
                toolName,
                itemCount: Math.min(items.length, 10),
            });
        }
        catch (err) {
            this.logger.warn('Failed to cache entities', {
                sessionId,
                toolName,
                error: err.message,
            });
        }
    }
    _mapToolNameToEntityType(toolName) {
        if (toolName === 'fetch_emails')
            return 'email';
        if (toolName.includes('contact'))
            return 'contact';
        if (toolName.includes('deal'))
            return 'deal';
        if (toolName.includes('account'))
            return 'account';
        if (toolName.includes('lead'))
            return 'lead';
        return 'record';
    }
    _getProviderFromToolName(toolName) {
        if (toolName === 'fetch_emails')
            return 'gmail';
        if (toolName.includes('entity') || toolName.includes('contact'))
            return 'salesforce';
        return 'nango';
    }
}
exports.ToolOrchestrator = ToolOrchestrator;
