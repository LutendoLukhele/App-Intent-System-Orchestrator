"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationService = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const winston_1 = __importDefault(require("winston"));
const uuid_1 = require("uuid");
const types_1 = require("./types");
const ToolConfigManager_1 = require("../tool/ToolConfigManager");
const markdown_stream_parser_1 = require("@lixpi/markdown-stream-parser");
const mainConversationalPrompt_1 = require("./prompts/mainConversationalPrompt");
const StreamEventEmitter_1 = require("../events/StreamEventEmitter");
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../../config");
const CRMEntityCacheService_1 = require("../data/CRMEntityCacheService");
const emailCompressionConfig_1 = require("../emailCompressionConfig");
const PLANNER_META_TOOL = {
    type: "function",
    function: {
        name: "planParallelActions",
        description: "Use this when a user's request is complex and requires multiple steps or actions to be planned. This triggers the main planning process.",
        parameters: {
            type: "object",
            properties: {
                userInput: { type: "string", description: "The original, full text of the user's complex request." },
                preliminaryToolCalls: {
                    type: "array",
                    description: "A list of potential tool calls already identified.",
                    items: { "type": "object" }
                }
            },
            required: ["userInput"]
        }
    }
};
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [new winston_1.default.transports.Console()],
});
const KEYWORD_TO_CATEGORY_MAP = {
    'email': 'Email',
    'emails': 'Email',
    'send': 'Email',
    'calendar': 'Calendar',
    'event': 'Calendar',
    'meeting': 'Calendar',
    'schedule': 'Calendar',
    'salesforce': 'CRM',
    'deal': 'CRM',
    'contact': 'CRM',
    'account': 'CRM',
    'lead': 'CRM'
};
function getRelevantToolCategories(userInput) {
    const detectedCategories = new Set();
    const lowerInput = userInput.toLowerCase();
    for (const keyword in KEYWORD_TO_CATEGORY_MAP) {
        if (lowerInput.includes(keyword)) {
            detectedCategories.add(KEYWORD_TO_CATEGORY_MAP[keyword]);
        }
    }
    return detectedCategories.size > 0 ? Array.from(detectedCategories) : ['Email', 'Calendar', 'CRM'];
}
class ConversationService extends StreamEventEmitter_1.StreamEventEmitter {
    constructor(config, providerAwareFilter) {
        super('ConversationService');
        this.config = config;
        this.conversationHistory = new Map();
        this.titleEmitted = new Set();
        this.promptCache = new Map();
        this.PROMPT_CACHE_TTL = 5 * 60 * 1000;
        if (!config.groqApiKey)
            throw new Error("Groq API key is missing.");
        this.client = new groq_sdk_1.default({ apiKey: config.groqApiKey });
        this.model = config.model;
        this.maxTokens = config.maxTokens;
        this.toolConfigManager = new ToolConfigManager_1.ToolConfigManager();
        this.providerAwareFilter = providerAwareFilter;
        this.redis = config.redisClient ?? new ioredis_1.default(config_1.CONFIG.REDIS_URL);
        this.entityCache = new CRMEntityCacheService_1.CRMEntityCacheService(this.redis);
    }
    generateCacheKey(messages, systemPrompt) {
        const crypto = require('crypto');
        const content = JSON.stringify({ messages, systemPrompt: systemPrompt || '' });
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        return hash;
    }
    getCachedResult(cacheKey) {
        if (!cacheKey)
            return null;
        const cached = this.promptCache.get(cacheKey);
        if (!cached)
            return null;
        if (Date.now() - cached.timestamp > this.PROMPT_CACHE_TTL) {
            this.promptCache.delete(cacheKey);
            return null;
        }
        return cached.result;
    }
    setCachedResult(cacheKey, result) {
        if (!cacheKey)
            return;
        this.promptCache.set(cacheKey, { result, timestamp: Date.now() });
        if (this.promptCache.size > 100) {
            const firstKey = this.promptCache.keys().next().value;
            if (firstKey) {
                this.promptCache.delete(firstKey);
            }
        }
    }
    async processMessageAndAggregateResults(userMessage, sessionId, incomingMessageId, _userId) {
        const messageProcessingId = (0, uuid_1.v4)();
        const currentMessageId = incomingMessageId || (0, uuid_1.v4)();
        logger.info('Processing message, will aggregate results', { sessionId });
        const history = this.getHistory(sessionId);
        if (userMessage) {
            history.push({ role: 'user', content: userMessage });
            this.conversationHistory.set(sessionId, history);
        }
        const isSummaryMode = !userMessage;
        let toolsForStream = [];
        let initialUserQuery = '';
        if (!isSummaryMode) {
            const relevantCategories = getRelevantToolCategories(userMessage || history.at(-1)?.content || '');
            logger.info('🔥 Tool category detection', {
                userMessage: userMessage?.substring(0, 100),
                detectedCategories: relevantCategories
            });
            let filteredToolConfigs;
            if (this.providerAwareFilter && _userId) {
                logger.info('🔥 Using provider-aware tool filtering', { userId: _userId, categories: relevantCategories });
                filteredToolConfigs = await this.providerAwareFilter.getToolsByCategoriesForUser(_userId, relevantCategories);
                logger.info('🔥 Provider-aware filter returned tools', {
                    userId: _userId,
                    toolCount: filteredToolConfigs.length,
                    toolNames: filteredToolConfigs.map(t => t.name)
                });
            }
            else {
                logger.warn('🔥 Provider-aware filtering not available, falling back to category-only filtering', {
                    hasFilter: !!this.providerAwareFilter,
                    hasUserId: !!_userId
                });
                filteredToolConfigs = this.toolConfigManager.getToolsByCategories(relevantCategories);
                logger.info('🔥 Category-only filter returned tools', {
                    toolCount: filteredToolConfigs.length,
                    toolNames: filteredToolConfigs.map(t => t.name)
                });
            }
            const groqTools = filteredToolConfigs.map(tool => {
                const inputSchema = this.toolConfigManager.getToolInputSchema(tool.name);
                if (!inputSchema) {
                    logger.warn(`🔥 Skipping Groq definition for ${tool.name}: No input schema found.`);
                    return null;
                }
                const cleanedSchema = this.toolConfigManager.cleanSchemaForGroq(inputSchema);
                return {
                    type: "function",
                    function: { name: tool.name, description: tool.description, parameters: cleanedSchema }
                };
            }).filter(Boolean);
            logger.info('🔥 Groq tools after schema validation', {
                groqToolCount: groqTools.length,
                groqToolNames: groqTools.map((t) => t?.function?.name)
            });
            toolsForStream = [...groqTools, PLANNER_META_TOOL];
            logger.info('🔥 Final tools for stream (including planner)', {
                totalToolCount: toolsForStream.length,
                toolNames: toolsForStream.map(t => t?.function?.name || 'unknown')
            });
            initialUserQuery = history.find(m => m.role === 'user')?.content || userMessage || '';
        }
        else {
            initialUserQuery = history.find(m => m.role === 'user')?.content || 'the previous actions';
        }
        const aggregatedToolCallsOutput = [];
        let conversationalResponseText = "";
        const conversationalStreamPromise = this.runConversationalStream(userMessage, initialUserQuery, sessionId, currentMessageId, messageProcessingId, toolsForStream, history, aggregatedToolCallsOutput, _userId).then(result => {
            conversationalResponseText = result.text;
        });
        await Promise.allSettled([conversationalStreamPromise]);
        logger.info('All ConversationService streams have settled.', {
            sessionId,
            finalAggregatedToolCount: aggregatedToolCallsOutput.length,
            totalToolCalls: aggregatedToolCallsOutput.length,
            conversationalResponseLength: conversationalResponseText.length
        });
        return {
            toolCalls: aggregatedToolCallsOutput.length > 0,
            aggregatedToolCalls: aggregatedToolCallsOutput,
            conversationalResponse: conversationalResponseText
        };
    }
    async runConversationalStream(currentUserMessage, initialUserQuery, sessionId, currentMessageId, messageProcessingId, toolsForThisStream, historyForThisStream, aggregatedToolCallsOutput, _userId) {
        const streamId = `conversational_${messageProcessingId}`;
        logger.info('Starting main conversational stream', { sessionId, streamId });
        const parserInstanceId = `conv_parser_${sessionId}_${currentMessageId}`;
        const parser = markdown_stream_parser_1.MarkdownStreamParser.getInstance(parserInstanceId);
        let unsubscribeFromParser = null;
        let parserSuccessfullyCleanedUp = false;
        let accumulatedText = "";
        let accumulatedToolCalls = null;
        try {
            unsubscribeFromParser = parser.subscribeToTokenParse((parsedSegment) => {
                const isLastSegmentFromParser = parsedSegment.status === 'END_STREAM';
                this.emit('send_chunk', sessionId, {
                    type: 'conversational_text_segment',
                    content: parsedSegment,
                    messageId: currentMessageId,
                    isFinal: isLastSegmentFromParser,
                    streamType: 'conversational',
                    messageType: types_1.MessageType.STANDARD
                });
                if (isLastSegmentFromParser) {
                    if (unsubscribeFromParser) {
                        unsubscribeFromParser();
                        unsubscribeFromParser = null;
                    }
                    markdown_stream_parser_1.MarkdownStreamParser.removeInstance(parserInstanceId);
                    parserSuccessfullyCleanedUp = true;
                }
            });
            parser.startParsing();
            let providerContext = '';
            if (this.providerAwareFilter && _userId) {
                providerContext = await this.providerAwareFilter.getProviderContextForPrompt(_userId);
            }
            const isSummaryMode = !currentUserMessage;
            const currentMessageText = isSummaryMode
                ? `[SUMMARY MODE] No new user message. The previous assistant message has tool_calls and corresponding tool results below. 
                
IMPORTANT: You MUST analyze the actual content of the tool results (emails, records, data) and provide a detailed, substantive summary that:
1. References SPECIFIC content from the emails/data (mention senders, topics, key points)
2. Synthesizes information across multiple emails if applicable
3. Highlights important insights or patterns in the data
4. Uses warm, conversational language
5. Does NOT just say "I fetched X emails" - ANALYZE what they contain

Review the tool results in the previous messages and provide a comprehensive summary.`
                : currentUserMessage || '';
            const systemPromptContent = mainConversationalPrompt_1.MAIN_CONVERSATIONAL_SYSTEM_PROMPT_TEMPLATE
                .replace('{{USER_INITIAL_QUERY}}', initialUserQuery)
                .replace('{{USER_CURRENT_MESSAGE}}', currentMessageText)
                .replace('{{PROVIDER_CONTEXT}}', providerContext);
            const messagesForApi = [
                { role: 'system', content: systemPromptContent }
            ];
            logger.info('About to hydrate tool results', {
                historyLength: historyForThisStream.length,
                isSummaryMode,
                toolMessages: historyForThisStream.filter(m => m.role === 'tool').length
            });
            const hydratedHistory = await this.hydrateToolResultsFromRedis(historyForThisStream, isSummaryMode);
            const compressedHistory = hydratedHistory.map(msg => {
                if (msg.role === 'tool' && msg.content) {
                    try {
                        const toolResult = JSON.parse(msg.content);
                        const hasRecords = toolResult.records && Array.isArray(toolResult.records);
                        const isArray = Array.isArray(toolResult);
                        if (hasRecords || isArray) {
                            let isCRMData = false;
                            const sampleRecord = hasRecords ? toolResult.records[0] : (isArray ? toolResult[0] : null);
                            if (sampleRecord) {
                                isCRMData = !!sampleRecord.attributes?.type || !!sampleRecord.entityType || !!sampleRecord.data?.attributes?.type;
                            }
                            const compressionResult = isCRMData
                                ? (0, emailCompressionConfig_1.compressCRMData)(toolResult, emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS)
                                : (0, emailCompressionConfig_1.compressEmailData)(toolResult, emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS, emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT);
                            if (compressionResult.wasCompressed) {
                                logger.info('ConversationService: Compressed tool result for LLM', {
                                    toolName: msg.name,
                                    dataType: isCRMData ? 'CRM' : 'Email',
                                    entityType: compressionResult.entityType,
                                    originalSize: compressionResult.originalSize,
                                    compressedSize: compressionResult.compressedSize,
                                    compressionRatio: compressionResult.compressionRatio,
                                    recordCount: hasRecords ? toolResult.records.length : toolResult.length,
                                    keptRecords: emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS
                                });
                                return {
                                    ...msg,
                                    content: JSON.stringify(compressionResult.compressed, null, 2)
                                };
                            }
                        }
                    }
                    catch (error) {
                        logger.warn('Failed to parse tool result for compression', {
                            error: error instanceof Error ? error.message : String(error),
                            toolName: msg.name
                        });
                    }
                }
                return msg;
            });
            const historyWithCachedEntities = await this.injectCachedEntitiesIntoHistory(sessionId, compressedHistory);
            const preparedHistory = this.prepareHistoryForLLM(historyWithCachedEntities);
            const maxHistoryLength = isSummaryMode ? 15 : 8;
            const trimmedHistory = this.trimHistoryForApi(preparedHistory, maxHistoryLength);
            messagesForApi.push(...trimmedHistory);
            if (isSummaryMode) {
                const toolMessages = messagesForApi.filter(m => m.role === 'tool');
                logger.info('Summary mode: Messages being sent to LLM', {
                    sessionId,
                    totalMessages: messagesForApi.length,
                    messageRoles: messagesForApi.map(m => m.role),
                    toolResultCount: toolMessages.length,
                    toolResults: toolMessages.map(m => {
                        const contentPreview = m.content?.substring(0, 300) || '';
                        const isRedisRef = contentPreview.includes('__redisKey');
                        return {
                            name: m.name,
                            hasContent: !!m.content,
                            contentLength: m.content?.length || 0,
                            isRedisRef,
                            contentPreview: contentPreview.replace(/\n/g, ' ').substring(0, 200)
                        };
                    }),
                    totalPromptLength: JSON.stringify(messagesForApi).length
                });
            }
            let responseStream;
            if (toolsForThisStream.length > 0) {
                logger.info('🔥 Conversational stream: Calling LLM with tools', {
                    toolCount: toolsForThisStream.length,
                    toolNames: toolsForThisStream.map(t => t.function?.name || 'unknown'),
                    sessionId,
                    model: this.model,
                    messageCount: messagesForApi.length,
                    messages: messagesForApi.map(m => ({
                        role: m.role,
                        contentLength: m.content?.length || 0,
                        hasToolCalls: !!m.tool_calls,
                        isToolMessage: m.role === 'tool'
                    })),
                    systemPromptLength: messagesForApi[0]?.content?.length || 0,
                    userMessage: currentUserMessage || '[SUMMARY MODE]',
                    hasToolChoice: true
                });
                if (messagesForApi[0]?.role === 'system') {
                    logger.info('🔥 System prompt being sent to LLM', {
                        sessionId,
                        prompt: messagesForApi[0].content?.substring(0, 500) + '...'
                    });
                }
                const cacheKey = this.generateCacheKey(messagesForApi, messagesForApi[0]?.content || undefined);
                const cachedResponse = this.getCachedResult(cacheKey);
                if (cachedResponse) {
                    logger.info('Groq prompt cache HIT - reusing response', {
                        sessionId,
                        cacheKeyPrefix: cacheKey.substring(0, 8),
                        savedLatency: '500-2000ms'
                    });
                    responseStream = cachedResponse;
                }
                else {
                    responseStream = await this.client.chat.completions.create({
                        model: this.model,
                        messages: messagesForApi,
                        max_tokens: this.maxTokens,
                        tools: toolsForThisStream,
                        tool_choice: "auto",
                        stream: true,
                        temperature: 0.5,
                    });
                }
            }
            else {
                const toolMessages = messagesForApi.filter(m => m.role === 'tool');
                logger.info('🔥 Conversational stream: Calling LLM in summary mode (NO tools)', {
                    sessionId,
                    model: this.model,
                    messageCount: messagesForApi.length,
                    isSummaryMode: true,
                    hasToolChoice: false,
                    systemPromptLength: systemPromptContent.length,
                    toolResultMessages: toolMessages.length,
                    toolResultDetails: toolMessages.map(m => {
                        const preview = m.content?.substring(0, 200) || '';
                        const isRedisRef = preview.includes('__redisKey');
                        return {
                            name: m.name,
                            size: m.content?.length || 0,
                            isRedisRef,
                            preview: preview.replace(/\n/g, ' ')
                        };
                    })
                });
                responseStream = await this.client.chat.completions.create({
                    model: this.model,
                    messages: messagesForApi,
                    max_tokens: this.maxTokens,
                    stream: true,
                    temperature: 0.5,
                });
            }
            let chunkCount = 0;
            let streamError = null;
            try {
                for await (const chunk of responseStream) {
                    chunkCount++;
                    const contentDelta = chunk.choices[0]?.delta?.content;
                    const toolCallsDelta = chunk.choices[0]?.delta?.tool_calls;
                    if (contentDelta) {
                        accumulatedText += contentDelta;
                    }
                    if (toolCallsDelta) {
                        if (!accumulatedToolCalls)
                            accumulatedToolCalls = [];
                        this.accumulateToolCallDeltas(accumulatedToolCalls, toolCallsDelta);
                    }
                    const finishReason = chunk.choices[0]?.finish_reason;
                    if (finishReason) {
                        logger.info(`🔥 Conversational stream finished. Reason: ${finishReason}`, {
                            sessionId,
                            streamId,
                            finishReason,
                            chunkCount
                        });
                        break;
                    }
                }
                logger.info('🔥 Stream iteration complete', {
                    sessionId,
                    streamId,
                    chunkCount,
                    accumulatedTextLength: accumulatedText.length,
                    hasToolCalls: !!accumulatedToolCalls
                });
            }
            catch (err) {
                streamError = err;
                logger.error('🔥🔥🔥 ERROR in LLM stream iteration', {
                    sessionId,
                    streamId,
                    error: err.message,
                    errorStack: err.stack,
                    errorName: err.name,
                    chunkCount,
                    accumulatedTextLength: accumulatedText.length
                });
                if (err.message?.includes('Failed to parse tool call arguments as JSON')) {
                    logger.warn('🔥 Malformed tool call detected - will attempt plan generation with placeholders', {
                        sessionId,
                        streamId,
                        userMessage: currentUserMessage?.substring(0, 100)
                    });
                    accumulatedToolCalls = null;
                    streamError = null;
                }
                else {
                    throw err;
                }
            }
            if (parser.parsing && !parserSuccessfullyCleanedUp) {
                parser.stopParsing();
            }
            if (accumulatedToolCalls && accumulatedToolCalls.length > 0) {
                logger.info(`Conversational stream identified ${accumulatedToolCalls.length} tool calls.`, { sessionId });
                if (accumulatedText && accumulatedText.trim().length > 0) {
                    logger.info('🔥 Suppressing conversational text because tool calls are present', {
                        sessionId,
                        suppressedTextLength: accumulatedText.length,
                        suppressedTextPreview: accumulatedText.substring(0, 100),
                        toolCallCount: accumulatedToolCalls.length
                    });
                    accumulatedText = '';
                }
                accumulatedToolCalls.forEach(tc => {
                    if (tc.id && tc.function.name) {
                        try {
                            if (!aggregatedToolCallsOutput.some(existing => existing.id === tc.id)) {
                                try {
                                    console.log("🔥 RAW_TOOLCALL_FROM_LLM:", JSON.stringify(tc, null, 2));
                                }
                                catch (e) {
                                    console.log("🔥 RAW_TOOLCALL_FROM_LLM (stringify failed):", tc);
                                }
                                aggregatedToolCallsOutput.push({
                                    id: tc.id,
                                    name: tc.function.name,
                                    arguments: this.sanitizeToolArguments(JSON.parse(tc.function.arguments || '{}')),
                                    streamType: 'conversational',
                                    function: undefined
                                });
                                logger.info('Collected tool_call from conversational stream', { name: tc.function.name });
                            }
                        }
                        catch (e) {
                            logger.error("Failed to parse tool arguments from conversational stream", {
                                args: tc.function.arguments, error: e.message
                            });
                        }
                    }
                });
            }
            else {
                if (accumulatedText && accumulatedText.trim().length > 0) {
                    logger.info('🔥 No tool calls detected - emitting conversational text', {
                        sessionId,
                        textLength: accumulatedText.length
                    });
                    if (parser.parsing && !parserSuccessfullyCleanedUp) {
                        parser.parseToken(accumulatedText);
                    }
                    this.emitStructuredEventsFromText(sessionId, accumulatedText, currentMessageId);
                }
            }
            logger.info('🔥 Conversational stream: LLM response complete', {
                sessionId,
                streamId,
                contentLength: accumulatedText?.length || 0,
                hasContent: !!accumulatedText,
                contentPreview: accumulatedText?.substring(0, 200),
                hasToolCalls: !!(accumulatedToolCalls && accumulatedToolCalls.length > 0),
                toolCallCount: accumulatedToolCalls?.length || 0,
                toolCallNames: accumulatedToolCalls?.map(tc => tc.function?.name),
                isEmpty: !accumulatedText && (!accumulatedToolCalls || accumulatedToolCalls.length === 0)
            });
            if (!accumulatedText && (!accumulatedToolCalls || accumulatedToolCalls.length === 0)) {
                logger.error('🔥🔥🔥 LLM returned EMPTY response (no text, no tool calls)', {
                    sessionId,
                    streamId,
                    isSummaryMode,
                    userMessage: currentUserMessage?.substring(0, 100),
                    messageCount: messagesForApi.length,
                    toolsAvailable: toolsForThisStream.length > 0,
                    toolCount: toolsForThisStream.length,
                    toolNames: toolsForThisStream.map(t => t?.function?.name || 'unknown'),
                    systemPromptPreview: messagesForApi[0]?.content?.substring(0, 300)
                });
            }
            if (accumulatedToolCalls && accumulatedToolCalls.length > 0) {
                historyForThisStream.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: accumulatedToolCalls
                });
            }
            else if (accumulatedText && accumulatedText.trim().length > 0) {
                historyForThisStream.push({
                    role: 'assistant',
                    content: accumulatedText
                });
            }
            else {
                logger.warn("Skipping empty assistant message — prevents broken second-turn.", {
                    sessionId
                });
            }
            this.conversationHistory.set(sessionId, this.trimHistory(historyForThisStream));
            if (!accumulatedToolCalls || accumulatedToolCalls.length === 0) {
                logger.info('🔥 No valid tool calls from conversational stream, attempting plan generation with placeholders', {
                    sessionId,
                    streamId,
                    userMessage: currentUserMessage?.substring(0, 100),
                    hasConversationalText: !!accumulatedText
                });
                try {
                    const generatedPlan = await this.generatePlanWithPlaceholders(currentUserMessage || '', sessionId, currentMessageId, _userId);
                    if (generatedPlan && generatedPlan.length > 0) {
                        logger.info('🔥 Successfully generated plan with placeholders', {
                            sessionId,
                            stepCount: generatedPlan.length,
                            toolNames: generatedPlan.map((s) => s.tool)
                        });
                        for (const step of generatedPlan) {
                            aggregatedToolCallsOutput.push({
                                name: step.tool,
                                arguments: step.arguments,
                                id: step.id,
                                function: step.function,
                                streamType: 'planner'
                            });
                        }
                    }
                }
                catch (planError) {
                    logger.warn('🔥 Plan generation with placeholders failed', {
                        sessionId,
                        error: planError.message
                    });
                }
            }
        }
        catch (outerError) {
            logger.error('🔥🔥🔥 FATAL ERROR in conversational stream', {
                sessionId,
                streamId,
                error: outerError.message,
                errorStack: outerError.stack,
                errorName: outerError.name,
                accumulatedTextLength: accumulatedText.length,
                hasAccumulatedToolCalls: !!accumulatedToolCalls
            });
        }
        finally {
            if (!parserSuccessfullyCleanedUp) {
                if (unsubscribeFromParser)
                    unsubscribeFromParser();
                if (parser.parsing)
                    parser.stopParsing();
                markdown_stream_parser_1.MarkdownStreamParser.removeInstance(parserInstanceId);
            }
            this.emit('send_chunk', sessionId, {
                type: 'stream_end',
                streamType: 'conversational',
                messageId: currentMessageId,
                isFinal: true
            });
            logger.info('Conversational stream processing complete.', { sessionId, streamId });
        }
        return {
            text: accumulatedText,
            hasToolCalls: !!(accumulatedToolCalls && accumulatedToolCalls.length > 0)
        };
    }
    accumulateToolCallDeltas(currentToolCalls, toolCallDeltas) {
        for (const toolCallDelta of toolCallDeltas) {
            if (typeof toolCallDelta.index === 'number') {
                while (currentToolCalls.length <= toolCallDelta.index) {
                    currentToolCalls.push({
                        id: '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                    });
                }
                const currentFn = currentToolCalls[toolCallDelta.index].function;
                if (toolCallDelta.id && !currentToolCalls[toolCallDelta.index].id) {
                    currentToolCalls[toolCallDelta.index].id = toolCallDelta.id;
                }
                if (toolCallDelta.function?.name) {
                    currentFn.name += toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                    currentFn.arguments += toolCallDelta.function.arguments;
                }
                if (toolCallDelta.type) {
                    currentToolCalls[toolCallDelta.index].type = toolCallDelta.type;
                }
            }
        }
    }
    async generatePlanWithPlaceholders(userMessage, sessionId, messageId, userId) {
        logger.info('🔥 Generating plan with placeholders for vague request', {
            sessionId,
            userMessage: userMessage.substring(0, 100)
        });
        let availableTools;
        if (this.providerAwareFilter && userId) {
            const relevantCategories = getRelevantToolCategories(userMessage);
            availableTools = await this.providerAwareFilter.getToolsByCategoriesForUser(userId, relevantCategories);
        }
        else {
            const relevantCategories = getRelevantToolCategories(userMessage);
            availableTools = this.toolConfigManager.getToolsByCategories(relevantCategories);
        }
        const toolDefinitions = availableTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            schema: this.toolConfigManager.getToolInputSchema(tool.name)
        })).filter(t => t.schema);
        const planPrompt = `You are a planning expert. Analyze this user request and generate a structured plan using the available tools.

User Request: "${userMessage}"

Available Tools:
${JSON.stringify(toolDefinitions, null, 2)}

**ENTITY TYPE DETECTION (CRITICAL for Salesforce/CRM update_entity, create_entity, fetch_entity):**
When the user mentions updating/creating/fetching CRM entities, detect entityType using this PRIORITY ORDER:

**PRIORITY 1 - FIELD-BASED DETECTION:**
- User mentions "Rating", "Company", or "LeadSource" field → entityType: "Lead"
- User mentions "Title", "AccountId" field → entityType: "Contact"
- User mentions "StageName", "Amount", "Probability" field → entityType: "Opportunity"
- User mentions "CaseNumber", "Priority" (with Case context) field → entityType: "Case"
- User mentions "NumberOfEmployees", "AnnualRevenue" field → entityType: "Account"

**PRIORITY 2 - EXPLICIT MENTIONS:**
- User says "my lead" or "lead named X" → entityType: "Lead"
- User says "my contact" or "contact named X" → entityType: "Contact"

**EXAMPLES:**
- "Update Pat Stumuller's rating to Hot" → Field "Rating" detected → entityType: "Lead"
- "Change Sarah's title to VP" → Field "Title" detected → entityType: "Contact"
- "Update deal stage to Closed Won" → Field "StageName" detected → entityType: "Opportunity"

**IMPORTANT INSTRUCTIONS:**
1. For EACH action in the plan, use {{PLACEHOLDER_field_name}} for any missing or vague parameters
2. Example: {{PLACEHOLDER_meeting_title}}, {{PLACEHOLDER_attendee_email}}, {{PLACEHOLDER_start_time}}
3. For CRM tools, ALWAYS detect entityType from field names first (see ENTITY TYPE DETECTION above)
4. Create action steps even if some parameters are missing - the UI will prompt for these
5. Output ONLY valid JSON in this format:

{
  "plan": [
    {
      "id": "step_1",
      "tool": "create_calendar_event",
      "intent": "Create a calendar meeting",
      "arguments": {
        "title": "{{PLACEHOLDER_meeting_title}}",
        "startTime": "{{PLACEHOLDER_start_time}}",
        "attendees": ["{{PLACEHOLDER_attendee_email}}"]
      }
    }
  ]
}`;
        try {
            const cacheKey = this.generateCacheKey([{ role: 'user', content: planPrompt }], planPrompt);
            const cachedPlan = this.getCachedResult(cacheKey);
            let response;
            if (cachedPlan) {
                logger.info('Groq prompt cache HIT (plan generation)', {
                    sessionId,
                    cacheKeyPrefix: cacheKey.substring(0, 8),
                    savedLatency: '500-1000ms'
                });
                response = cachedPlan;
            }
            else {
                response = await this.client.chat.completions.create({
                    model: this.model,
                    messages: [{ role: 'user', content: planPrompt }],
                    max_tokens: 2048,
                    temperature: 0.3,
                });
                this.setCachedResult(cacheKey, response);
            }
            const responseText = response.choices[0]?.message?.content || '';
            logger.info('🔥 Plan generation response received', {
                sessionId,
                responseLength: responseText.length
            });
            let parsedResponse = null;
            let parseError = null;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsedResponse = JSON.parse(jsonMatch[0]);
                }
                catch (e) {
                    parseError = e instanceof Error ? e.message : 'Unknown parse error';
                    logger.warn('🔥 First JSON parse attempt failed', {
                        sessionId,
                        error: parseError,
                        attemptedText: jsonMatch[0].substring(0, 200)
                    });
                }
            }
            if (!parsedResponse && responseText.includes('{')) {
                try {
                    let braceCount = 0;
                    let startIdx = responseText.indexOf('{');
                    let endIdx = -1;
                    for (let i = startIdx; i < responseText.length; i++) {
                        if (responseText[i] === '{')
                            braceCount++;
                        if (responseText[i] === '}')
                            braceCount--;
                        if (braceCount === 0) {
                            endIdx = i + 1;
                            break;
                        }
                    }
                    if (endIdx > startIdx) {
                        const jsonStr = responseText.substring(startIdx, endIdx);
                        parsedResponse = JSON.parse(jsonStr);
                        logger.info('🔥 Successfully recovered JSON using brace-matching strategy', { sessionId });
                    }
                }
                catch (e) {
                    parseError = e instanceof Error ? e.message : 'Unknown parse error';
                    logger.warn('🔥 Brace-matching strategy also failed', { sessionId, error: parseError });
                }
            }
            if (!parsedResponse) {
                logger.warn('🔥 Could not parse plan response as JSON', {
                    sessionId,
                    responsePreview: responseText.substring(0, 300),
                    parseError
                });
                return [];
            }
            const planSteps = parsedResponse.plan || [];
            logger.info('🔥 Successfully parsed plan with placeholders', {
                sessionId,
                stepCount: planSteps.length,
                steps: planSteps.map((s) => ({ id: s.id, tool: s.tool }))
            });
            return planSteps;
        }
        catch (error) {
            logger.error('🔥 Error generating plan with placeholders', {
                sessionId,
                error: error.message
            });
            return [];
        }
    }
    async hydrateToolResultsFromRedis(history, summaryMode = false) {
        const hydrated = [];
        const MAX_RESULT_SIZE_BYTES = summaryMode ? 100 * 1024 : 15 * 1024;
        logger.info('🔄 Starting Redis hydration', {
            summaryMode,
            messageCount: history.length,
            maxResultSize: MAX_RESULT_SIZE_BYTES
        });
        for (const msg of history) {
            let wasHydrated = false;
            if (msg.role === 'tool' && msg.content) {
                try {
                    const parsed = JSON.parse(msg.content);
                    logger.debug('Checking tool message for Redis ref', {
                        toolName: msg.name,
                        hasRedisKey: !!parsed.__redisKey,
                        contentLength: msg.content.length,
                        contentPreview: msg.content.substring(0, 100)
                    });
                    if (parsed.__note === 'Full result stored in Redis' && parsed.__redisKey) {
                        logger.info('Found Redis reference, retrieving...', {
                            redisKey: parsed.__redisKey,
                            toolName: msg.name
                        });
                        const fullResult = await this.redis.get(parsed.__redisKey);
                        if (fullResult) {
                            let contentToSend = fullResult;
                            let compressionApplied = false;
                            logger.debug('🔍 Hydration: Retrieved from Redis', {
                                summaryMode,
                                resultSize: fullResult.length,
                                resultType: typeof fullResult,
                                toolName: msg.name
                            });
                            logger.debug('🔍 Attempting compression for email data');
                            try {
                                const resultData = JSON.parse(fullResult);
                                logger.debug('🔍 JSON parse successful', {
                                    isArray: Array.isArray(resultData),
                                    dataType: typeof resultData,
                                    arrayLength: Array.isArray(resultData) ? resultData.length : 'N/A'
                                });
                                let emailArray = Array.isArray(resultData) ? resultData :
                                    (resultData?.records && Array.isArray(resultData.records)) ? resultData.records :
                                        null;
                                if (emailArray && emailArray.length > 0) {
                                    const MAX_EMAILS_FOR_SUMMARY = emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS;
                                    const BODY_CHAR_LIMIT = emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT;
                                    const emailsToAnalyze = emailArray.slice(0, MAX_EMAILS_FOR_SUMMARY).map((email) => ({
                                        from: email.from,
                                        subject: email.subject,
                                        body_text: email.body_text ? email.body_text.substring(0, BODY_CHAR_LIMIT) : '',
                                        received: email.received || email.startDate || email.lastDate,
                                        isRead: email.isRead,
                                        hasAttachments: email.hasAttachments || false,
                                        id: email.id
                                    }));
                                    contentToSend = JSON.stringify(emailsToAnalyze, null, 2);
                                    compressionApplied = true;
                                    logger.info('✅ Compressed email data', {
                                        originalCount: emailArray.length,
                                        compressedCount: emailsToAnalyze.length,
                                        originalSize: fullResult.length,
                                        compressedSize: contentToSend.length,
                                        compressionRatio: ((1 - contentToSend.length / fullResult.length) * 100).toFixed(1) + '%',
                                        bodyCharLimit: BODY_CHAR_LIMIT,
                                        summaryMode: summaryMode
                                    });
                                }
                                else {
                                    logger.warn('⚠️ Could not find email array to compress', {
                                        dataType: typeof resultData,
                                        dataKeys: Object.keys(resultData || {}).slice(0, 5),
                                        hasRecords: !!resultData?.records
                                    });
                                }
                            }
                            catch (e) {
                                logger.warn('⚠️ Could not parse result data for compression', {
                                    error: e instanceof Error ? e.message : 'unknown',
                                    resultPreview: fullResult.substring(0, 200)
                                });
                            }
                            hydrated.push({
                                ...msg,
                                content: contentToSend
                            });
                            wasHydrated = true;
                            logger.info('✅ Hydrated tool result from Redis', {
                                redisKey: parsed.__redisKey,
                                originalSize: fullResult.length,
                                sentSize: contentToSend.length,
                                compressionApplied,
                                exceedsLimit: contentToSend.length > MAX_RESULT_SIZE_BYTES,
                                summaryMode,
                                toolName: msg.name
                            });
                        }
                        else {
                            logger.warn('Redis key not found, using reference', {
                                redisKey: parsed.__redisKey,
                                toolName: msg.name
                            });
                        }
                    }
                }
                catch (error) {
                    logger.debug('Error parsing tool message content', {
                        error: error instanceof Error ? error.message : 'unknown',
                        toolName: msg.name
                    });
                }
            }
            if (!wasHydrated) {
                hydrated.push(msg);
            }
        }
        logger.info('🔄 Redis hydration complete', {
            originalMessageCount: history.length,
            hydratedMessageCount: hydrated.length
        });
        return hydrated;
    }
    async injectCachedEntitiesIntoHistory(sessionId, history) {
        try {
            if (!this.entityCache)
                return history;
            const lastToolMessage = history.slice().reverse().find((msg) => msg.role === 'tool' && msg.name?.includes('fetch_emails'));
            if (lastToolMessage && lastToolMessage.content) {
                try {
                    const toolData = JSON.parse(lastToolMessage.content);
                    if (toolData.data && Array.isArray(toolData.data)) {
                    }
                }
                catch (e) {
                }
            }
            const recentCachedEntities = await this.entityCache.getRecentCachedEntities(sessionId, 'email', 5);
            if (!recentCachedEntities || recentCachedEntities.length === 0) {
                return history;
            }
            const existingEntityIds = new Set();
            history.forEach(msg => {
                if (msg.role === 'tool' && msg.content) {
                    try {
                        const parsed = JSON.parse(msg.content);
                        if (Array.isArray(parsed)) {
                            parsed.forEach((item) => {
                                if (item.id)
                                    existingEntityIds.add(item.id);
                            });
                        }
                        else if (parsed.id) {
                            existingEntityIds.add(parsed.id);
                        }
                    }
                    catch (e) {
                    }
                }
            });
            const newCachedEntities = recentCachedEntities.filter(entity => !existingEntityIds.has(entity.id));
            if (newCachedEntities.length === 0) {
                return history;
            }
            const cachedEntityMessage = {
                role: 'tool',
                name: 'fetch_emails_or_records',
                tool_call_id: `cached_${sessionId}_${Date.now()}`,
                content: JSON.stringify({
                    status: 'success',
                    data: newCachedEntities.map(entity => ({
                        id: entity.id,
                        from: entity.from,
                        subject: entity.subject,
                        body_text: entity.cleanBody,
                        _cached: true,
                        _cacheTimestamp: new Date(entity.timestamp).toISOString(),
                        ...entity.metadata
                    })),
                    _note: 'Cached entities from earlier in conversation'
                })
            };
            const enhancedHistory = [...history];
            let lastUserMessageIndex = -1;
            for (let i = enhancedHistory.length - 1; i >= 0; i--) {
                if (enhancedHistory[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }
            if (lastUserMessageIndex >= 0) {
                enhancedHistory.splice(lastUserMessageIndex, 0, cachedEntityMessage);
            }
            else {
                enhancedHistory.push(cachedEntityMessage);
            }
            logger.info('Injected cached entities into conversation history', {
                sessionId,
                entityCount: newCachedEntities.length,
                totalHistoryLength: enhancedHistory.length
            });
            return enhancedHistory;
        }
        catch (error) {
            logger.warn('Error injecting cached entities into history', {
                error: error instanceof Error ? error.message : String(error),
                sessionId
            });
            return history;
        }
    }
    prepareHistoryForLLM(history) {
        return history.filter(msg => {
            if (msg.role === 'system')
                return false;
            if (msg.role === 'tool' && msg.content)
                return true;
            return msg.content || (msg.tool_calls && msg.tool_calls.length > 0);
        });
    }
    getHistory(sessionId) {
        return this.conversationHistory.get(sessionId) || [];
    }
    trimHistory(history, maxLength = 20) {
        if (history.length <= maxLength)
            return history;
        const systemPrompts = history.filter(h => h.role === 'system');
        const nonSystem = history.filter(h => h.role !== 'system');
        const trimmed = nonSystem.slice(-maxLength + systemPrompts.length);
        return [...systemPrompts, ...trimmed];
    }
    trimHistoryForApi(history, maxMessages = 8) {
        if (history.length <= maxMessages)
            return history;
        const systemMsg = history.find(h => h.role === 'system');
        const others = history.filter(h => h.role !== 'system');
        const trimmed = others.slice(-(maxMessages - 1));
        logger.info('Trimming history for API call', {
            originalLength: history.length,
            trimmedLength: trimmed.length + (systemMsg ? 1 : 0),
            maxMessages
        });
        return systemMsg ? [systemMsg, ...trimmed] : trimmed;
    }
    addAssistantMessageToHistory(sessionId, content, metadata) {
        const history = this.getHistory(sessionId);
        const assistantMessage = {
            role: 'assistant',
            content: content,
        };
        history.push(assistantMessage);
        this.conversationHistory.set(sessionId, this.trimHistory(history));
        logger.info('Added assistant message to history programmatically', { sessionId });
    }
    addToolResultMessageToHistory(sessionId, toolCallId, toolName, resultData) {
        const history = this.getHistory(sessionId);
        const resultSize = JSON.stringify(resultData).length;
        const MAX_RESULT_SIZE = 50 * 1024;
        let content;
        if (resultSize > MAX_RESULT_SIZE) {
            logger.info('Tool result exceeds size limit, storing in Redis', {
                sessionId,
                toolName,
                toolCallId,
                originalSize: resultSize,
                limit: MAX_RESULT_SIZE,
                oversizeBy: resultSize - MAX_RESULT_SIZE
            });
            const resultRedisKey = `tool-result:${sessionId}:${toolCallId}`;
            this.redis.setex(resultRedisKey, 3600, JSON.stringify(resultData)).catch((err) => {
                logger.error('Failed to store large tool result in Redis', { error: err.message, sessionId, toolCallId });
            });
            content = JSON.stringify({
                __note: 'Full result stored in Redis',
                __toolCallId: toolCallId,
                __sessionId: sessionId,
                __redisKey: resultRedisKey,
                __originalSize: resultSize,
                __summary: Array.isArray(resultData)
                    ? `${resultData.length} records`
                    : `Full result available in Redis`
            }, null, 2);
            logger.warn('Large tool result stored in Redis, reference added to history', {
                sessionId,
                toolName,
                toolCallId,
                redisKey: resultRedisKey,
                originalSize: resultSize
            });
        }
        else {
            content = JSON.stringify(resultData, null, 2);
        }
        const toolMessage = {
            role: 'tool',
            tool_call_id: toolCallId,
            name: toolName,
            content: content,
        };
        history.push(toolMessage);
        this.conversationHistory.set(sessionId, this.trimHistory(history));
        logger.info('Added tool result message to history', { sessionId, toolName, toolCallId, resultSize, stored: resultSize > MAX_RESULT_SIZE ? 'Redis' : 'History' });
    }
    sanitizeToolArguments(args) {
        const sanitized = {};
        const removeNullRecursive = (obj) => {
            if (obj === null || obj === undefined) {
                return undefined;
            }
            if (typeof obj !== 'object') {
                return obj;
            }
            if (Array.isArray(obj)) {
                return obj.map(removeNullRecursive).filter(v => v !== undefined);
            }
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                const cleaned_value = removeNullRecursive(value);
                if (cleaned_value !== undefined) {
                    cleaned[key] = cleaned_value;
                }
            }
            return cleaned;
        };
        for (const [key, value] of Object.entries(args)) {
            const cleaned_value = removeNullRecursive(value);
            if (cleaned_value !== undefined) {
                sanitized[key] = cleaned_value;
            }
        }
        const hadNulls = JSON.stringify(args) !== JSON.stringify(sanitized);
        if (hadNulls) {
            logger.info('🔧 Sanitized tool arguments (removed null/undefined values)', {
                before: args,
                after: sanitized
            });
        }
        return sanitized;
    }
    extractTitle(text) {
        const headingMatch = text.match(/^#+ (.+)$/m);
        if (headingMatch) {
            return headingMatch[1].trim();
        }
        const sentences = text.split(/[.!?]\s+/);
        if (sentences.length > 0) {
            const firstSentence = sentences[0].trim();
            return firstSentence.length > 100
                ? firstSentence.substring(0, 97) + '...'
                : firstSentence;
        }
        return text.substring(0, 100);
    }
    parseIntoSegments(text) {
        const segments = [];
        const lines = text.split('\n');
        let currentParagraph = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                if (currentParagraph) {
                    segments.push({
                        type: 'text',
                        content: currentParagraph.trim()
                    });
                    currentParagraph = '';
                }
                continue;
            }
            if (line.startsWith('#')) {
                if (currentParagraph) {
                    segments.push({
                        type: 'text',
                        content: currentParagraph.trim()
                    });
                    currentParagraph = '';
                }
                const headingText = line.replace(/^#+\s*/, '');
                let summary = '';
                for (let j = i + 1; j < lines.length && !lines[j].startsWith('#'); j++) {
                    if (lines[j].trim()) {
                        summary += lines[j] + ' ';
                        if (summary.length > 200)
                            break;
                    }
                }
                segments.push({
                    type: 'context',
                    title: headingText,
                    summary: summary.trim().substring(0, 200)
                });
                continue;
            }
            if (line.startsWith('>')) {
                if (currentParagraph) {
                    segments.push({
                        type: 'text',
                        content: currentParagraph.trim()
                    });
                    currentParagraph = '';
                }
                segments.push({
                    type: 'quote',
                    text: line.replace(/^>\s*/, '').trim(),
                    attribution: 'Source'
                });
                continue;
            }
            currentParagraph += line + ' ';
        }
        if (currentParagraph) {
            segments.push({
                type: 'text',
                content: currentParagraph.trim()
            });
        }
        return segments;
    }
    emitStructuredEventsFromText(sessionId, accumulatedText, messageId) {
        if (accumulatedText.length > 20 && !this.titleEmitted.has(sessionId)) {
            const title = this.extractTitle(accumulatedText);
            this.emitTitleGenerated(sessionId, title);
            this.titleEmitted.add(sessionId);
            logger.info('Emitted title_generated event', { sessionId, title });
        }
    }
    clearTitleTracking(sessionId) {
        this.titleEmitted.delete(sessionId);
    }
}
exports.ConversationService = ConversationService;
