// src/services/conversation/ConversationService.ts

import Groq, { GroqError,  } from 'groq-sdk';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { ConversationConfig, Message, MessageType, ToolResult } from './types';
import { ToolConfigManager } from '../tool/ToolConfigManager';
import { ProviderAwareToolFilter } from '../tool/ProviderAwareToolFilter';
import { MarkdownStreamParser } from '@lixpi/markdown-stream-parser';
import { StreamChunk } from '../stream/types';
import { MAIN_CONVERSATIONAL_SYSTEM_PROMPT_TEMPLATE } from './prompts/mainConversationalPrompt';
import { DEDICATED_TOOL_CALL_SYSTEM_PROMPT_TEMPLATE } from './prompts/dedicatedToolCallPrompt';
import { StreamEventEmitter } from '../events/StreamEventEmitter';
import Redis from 'ioredis';
import { CONFIG } from '../../config';
import { CRMEntityCacheService } from '../data/CRMEntityCacheService';
import { EMAIL_COMPRESSION_CONFIG, compressEmailData, compressCRMData } from '../emailCompressionConfig';

// Interfaces remain the same
interface LixpiParsedSegment { 
    status: 'STREAMING' | 'END_STREAM' | string;
    segment?: { segment: string; styles: string[]; type: string; };
}
interface ConversationalStreamResult {
    text: string;
    hasToolCalls: boolean;
}

interface ToolCallStreamResult {
    hasToolCalls: boolean;
}
export interface ProcessedMessageResult {
    toolCalls: boolean;
    aggregatedToolCalls: Array<{ name: string; arguments: Record<string, any>; id?: string; function: any; streamType: string; }>;
    conversationalResponse: string;
}

const PLANNER_META_TOOL = {
    type: "function" as const,
    function: {
        name: "planParallelActions",
        description: "Use this when a user's request is complex and requires multiple steps or actions to be planned. This triggers the main planning process.",
        parameters: {
            type: "object" as const,
            properties: {
                userInput: { type: "string" as const, description: "The original, full text of the user's complex request." },
                preliminaryToolCalls: {
                    type: "array" as const,
                    description: "A list of potential tool calls already identified.",
                    items: { "type": "object" as const }
                }
            },
            required: ["userInput"]
        }
    }
};

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

const KEYWORD_TO_CATEGORY_MAP: Record<string, string> = {
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

function getRelevantToolCategories(userInput: string): string[] {
    const detectedCategories = new Set<string>();
    const lowerInput = userInput.toLowerCase();
    for (const keyword in KEYWORD_TO_CATEGORY_MAP) {
        if (lowerInput.includes(keyword)) {
            detectedCategories.add(KEYWORD_TO_CATEGORY_MAP[keyword]);
        }
    }
    return detectedCategories.size > 0 ? Array.from(detectedCategories) : ['Email', 'Calendar', 'CRM'];
}
export class ConversationService extends StreamEventEmitter {
    private client: Groq;
    private model: string;
    private maxTokens: number;
    private conversationHistory: Map<string, Message[]> = new Map();
    private toolConfigManager: ToolConfigManager;
    private providerAwareFilter?: ProviderAwareToolFilter;
    private titleEmitted: Set<string> = new Set(); // Track which sessions have emitted titles
    // ENHANCEMENT 2: Groq prompt caching to reduce API calls and latency
    private promptCache: Map<string, { result: any; timestamp: number }> = new Map();
    private readonly PROMPT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private readonly redis: Redis;
    private entityCache: CRMEntityCacheService;

    constructor(private config: ConversationConfig, providerAwareFilter?: ProviderAwareToolFilter) {
        super('ConversationService'); // Pass service name to StreamEventEmitter
        if (!config.groqApiKey) throw new Error("Groq API key is missing.");
        this.client = new Groq({ apiKey: config.groqApiKey });
        this.model = config.model;
        this.maxTokens = config.maxTokens;
        this.toolConfigManager = new ToolConfigManager();
        this.providerAwareFilter = providerAwareFilter;
        this.redis = config.redisClient ?? new Redis(CONFIG.REDIS_URL!);
        this.entityCache = new CRMEntityCacheService(this.redis);
    }

    // Helper: Generate cache key from messages and system prompt
    private generateCacheKey(messages: any[], systemPrompt?: string | null): string {
        const crypto = require('crypto');
        const content = JSON.stringify({ messages, systemPrompt: systemPrompt || '' });
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        return hash;
    }

    // Helper: Retrieve cached result if still valid
    private getCachedResult(cacheKey?: string): any | null {
        if (!cacheKey) return null;
        const cached = this.promptCache.get(cacheKey);
        if (!cached) return null;
        
        // Check if cache is still valid (TTL)
        if (Date.now() - cached.timestamp > this.PROMPT_CACHE_TTL) {
            this.promptCache.delete(cacheKey);
            return null;
        }
        
        return cached.result; // Return cached result
    }

    // Helper: Store result in cache with TTL
    private setCachedResult(cacheKey: string | undefined, result: any): void {
        if (!cacheKey) return; // Skip if no cache key
        this.promptCache.set(cacheKey, { result, timestamp: Date.now() });
        // Keep cache size manageable (max 100 entries)
        if (this.promptCache.size > 100) {
            const firstKey = this.promptCache.keys().next().value;
            if (firstKey) {
                this.promptCache.delete(firstKey);
            }
        }
    }

    public async processMessageAndAggregateResults(
        userMessage: string | null, 
        sessionId: string,
        incomingMessageId?: string,
        _userId?: string
    ): Promise<ProcessedMessageResult> {
        const messageProcessingId = uuidv4();
        const currentMessageId = incomingMessageId || uuidv4();
        logger.info('Processing message, will aggregate results', { sessionId });

        const history = this.getHistory(sessionId);
        // Only add a user message to history if one was provided.
        if (userMessage) {
            history.push({ role: 'user', content: userMessage });
            this.conversationHistory.set(sessionId, history);
        }
        
        const isSummaryMode = !userMessage;
        let toolsForStream: any[] = [];
        let initialUserQuery = '';

        if (!isSummaryMode) {
            const relevantCategories = getRelevantToolCategories(userMessage || history.at(-1)?.content || '');
            logger.info('🔥 Tool category detection', {
                userMessage: userMessage?.substring(0, 100),
                detectedCategories: relevantCategories
            });

            // Use provider-aware filtering if available and userId is provided
            let filteredToolConfigs;
            if (this.providerAwareFilter && _userId) {
                logger.info('🔥 Using provider-aware tool filtering', { userId: _userId, categories: relevantCategories });
                filteredToolConfigs = await this.providerAwareFilter.getToolsByCategoriesForUser(_userId, relevantCategories);
                logger.info('🔥 Provider-aware filter returned tools', {
                    userId: _userId,
                    toolCount: filteredToolConfigs.length,
                    toolNames: filteredToolConfigs.map(t => t.name)
                });
            } else {
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
                // Clean the schema for strict Groq validation (removes "optional" flags, ensures JSON Schema compliance)
                const cleanedSchema = this.toolConfigManager.cleanSchemaForGroq(inputSchema);
                return {
                    type: "function" as const,
                    function: { name: tool.name, description: tool.description, parameters: cleanedSchema }
                };
            }).filter(Boolean);

            logger.info('🔥 Groq tools after schema validation', {
                groqToolCount: groqTools.length,
                groqToolNames: groqTools.map((t: any) => t?.function?.name)
            });

            toolsForStream = [...(groqTools as any[]), PLANNER_META_TOOL];

            logger.info('🔥 Final tools for stream (including planner)', {
                totalToolCount: toolsForStream.length,
                toolNames: toolsForStream.map(t => t?.function?.name || 'unknown')
            });

            initialUserQuery = history.find(m => m.role === 'user')?.content || userMessage || '';
        } else {
            initialUserQuery = history.find(m => m.role === 'user')?.content || 'the previous actions';
        }

        const aggregatedToolCallsOutput: ProcessedMessageResult['aggregatedToolCalls'] = [];

        let conversationalResponseText = "";
        
        const conversationalStreamPromise = this.runConversationalStream(
            userMessage, initialUserQuery, sessionId, currentMessageId, messageProcessingId,
            toolsForStream, history, aggregatedToolCallsOutput, _userId
        ).then(result => {
            conversationalResponseText = result.text;
        });
        
        // The dedicated tool call stream is removed. All logic is now in runConversationalStream.
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

    private async runConversationalStream(
        currentUserMessage: string | null,
        initialUserQuery: string,
        sessionId: string,
        currentMessageId: string,
        messageProcessingId: string,
        toolsForThisStream: any[],
        historyForThisStream: Message[],
        aggregatedToolCallsOutput: ProcessedMessageResult['aggregatedToolCalls'],
        _userId?: string
    ): Promise<ConversationalStreamResult> {
        const streamId = `conversational_${messageProcessingId}`;
        logger.info('Starting main conversational stream', { sessionId, streamId });

        const parserInstanceId = `conv_parser_${sessionId}_${currentMessageId}`;
        const parser = MarkdownStreamParser.getInstance(parserInstanceId);
        let unsubscribeFromParser: (() => void) | null = null;
        let parserSuccessfullyCleanedUp = false;

        let accumulatedText = "";
        let accumulatedToolCalls: Groq.Chat.Completions.ChatCompletionMessageToolCall[] | null = null;

        try {
            unsubscribeFromParser = parser.subscribeToTokenParse((parsedSegment: LixpiParsedSegment) => {
                const isLastSegmentFromParser = parsedSegment.status === 'END_STREAM';
                this.emit('send_chunk', sessionId, {
                    type: 'conversational_text_segment',
                    content: parsedSegment,
                    messageId: currentMessageId,
                    isFinal: isLastSegmentFromParser,
                    streamType: 'conversational',
                    messageType: MessageType.STANDARD
                } as StreamChunk);
                if (isLastSegmentFromParser) {
                    if (unsubscribeFromParser) { unsubscribeFromParser(); unsubscribeFromParser = null; }
                    MarkdownStreamParser.removeInstance(parserInstanceId);
                    parserSuccessfullyCleanedUp = true;
                }
            });
            parser.startParsing();

            // Get provider context if available
            let providerContext = '';
            if (this.providerAwareFilter && _userId) {
                providerContext = await this.providerAwareFilter.getProviderContextForPrompt(_userId);
            }

            // In summary mode (no current message), make it explicit what the LLM should do
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

            const systemPromptContent = MAIN_CONVERSATIONAL_SYSTEM_PROMPT_TEMPLATE
                .replace('{{USER_INITIAL_QUERY}}', initialUserQuery)
                .replace('{{USER_CURRENT_MESSAGE}}', currentMessageText)
                .replace('{{PROVIDER_CONTEXT}}', providerContext);

            const messagesForApi: Message[] = [
                { role: 'system', content: systemPromptContent }
            ];
            // Hydrate any Redis-cached tool results before sending to LLM
            // In summary mode, allow larger email results to be fully hydrated (for analysis)
            logger.info('About to hydrate tool results', {
                historyLength: historyForThisStream.length,
                isSummaryMode,
                toolMessages: historyForThisStream.filter(m => m.role === 'tool').length
            });
            const hydratedHistory = await this.hydrateToolResultsFromRedis(historyForThisStream, isSummaryMode);
            
            // COMPRESSION: Apply email/CRM compression to tool results before sending to LLM
            // This reduces token usage significantly (98% for emails, 77% for CRM)
            const compressedHistory = hydratedHistory.map(msg => {
                if (msg.role === 'tool' && msg.content) {
                    try {
                        const toolResult = JSON.parse(msg.content);
                        
                        // Check if this is email/record data that needs compression
                        const hasRecords = toolResult.records && Array.isArray(toolResult.records);
                        const isArray = Array.isArray(toolResult);
                        
                        if (hasRecords || isArray) {
                            // Detect if this is CRM data (has attributes.type or entityType) or email data (has 'from', 'subject')
                            let isCRMData = false;
                            const sampleRecord = hasRecords ? toolResult.records[0] : (isArray ? toolResult[0] : null);
                            
                            if (sampleRecord) {
                                // CRM records have attributes.type (Salesforce direct) or entityType (Nango SalesforceEntity)
                                isCRMData = !!sampleRecord.attributes?.type || !!sampleRecord.entityType || !!sampleRecord.data?.attributes?.type;
                            }
                            
                            const compressionResult = isCRMData 
                                ? compressCRMData(toolResult, EMAIL_COMPRESSION_CONFIG.MAX_EMAILS)
                                : compressEmailData(
                                    toolResult,
                                    EMAIL_COMPRESSION_CONFIG.MAX_EMAILS,
                                    EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT
                                );
                            
                            if (compressionResult.wasCompressed) {
                                logger.info('ConversationService: Compressed tool result for LLM', {
                                    toolName: msg.name,
                                    dataType: isCRMData ? 'CRM' : 'Email',
                                    entityType: (compressionResult as any).entityType,
                                    originalSize: compressionResult.originalSize,
                                    compressedSize: compressionResult.compressedSize,
                                    compressionRatio: compressionResult.compressionRatio,
                                    recordCount: hasRecords ? toolResult.records.length : toolResult.length,
                                    keptRecords: EMAIL_COMPRESSION_CONFIG.MAX_EMAILS
                                });
                                
                                return {
                                    ...msg,
                                    content: JSON.stringify(compressionResult.compressed, null, 2)
                                };
                            }
                        }
                    } catch (error) {
                        // If parsing fails, keep original content
                        logger.warn('Failed to parse tool result for compression', {
                            error: error instanceof Error ? error.message : String(error),
                            toolName: msg.name
                        });
                    }
                }
                return msg;
            });
            
            // ENHANCEMENT: Inject cached CRM entities for follow-up questions
            // This ensures that if user asks follow-ups about cached emails/records,
            // the LLM has access to the original entity bodies without refetching
            const historyWithCachedEntities = await this.injectCachedEntitiesIntoHistory(
                sessionId,
                compressedHistory
            );
            
            const preparedHistory = this.prepareHistoryForLLM(historyWithCachedEntities);
            
            // In summary mode, preserve tool results with actual data (don't trim aggressively)
            // This ensures emails/records are available for the LLM to analyze
            const maxHistoryLength = isSummaryMode ? 15 : 8; // Allow more history in summary mode for analysis
            const trimmedHistory = this.trimHistoryForApi(preparedHistory, maxHistoryLength);
            messagesForApi.push(...trimmedHistory);

            // Debug: Log the messages being sent to LLM, especially in summary mode
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

            // Build API parameters conditionally based on whether tools are available
            // Only include tools and tool_choice when tools are actually available
            // This prevents confusing the LLM in summary mode
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
                        hasToolCalls: !!(m as any).tool_calls,
                        isToolMessage: m.role === 'tool'
                    })),
                    systemPromptLength: messagesForApi[0]?.content?.length || 0,
                    userMessage: currentUserMessage || '[SUMMARY MODE]',
                    hasToolChoice: true
                });

                // Log the actual system prompt for debugging
                if (messagesForApi[0]?.role === 'system') {
                    logger.info('🔥 System prompt being sent to LLM', {
                        sessionId,
                        prompt: messagesForApi[0].content?.substring(0, 500) + '...'
                    });
                }

                // ENHANCEMENT 2: Check prompt cache before API call
                const cacheKey = this.generateCacheKey(messagesForApi, messagesForApi[0]?.content || undefined);
                const cachedResponse = this.getCachedResult(cacheKey);
                
                if (cachedResponse) {
                    logger.info('Groq prompt cache HIT - reusing response', {
                        sessionId,
                        cacheKeyPrefix: cacheKey.substring(0, 8),
                        savedLatency: '500-2000ms'
                    });
                    responseStream = cachedResponse;
                } else {
                    // API call - result will be cached
                    responseStream = await this.client.chat.completions.create({
                        model: this.model,
                        messages: messagesForApi as any,
                        max_tokens: this.maxTokens,
                        tools: toolsForThisStream,
                        tool_choice: "auto",
                        stream: true,
                        temperature: 0.5,
                    });
                    // Don't cache streams - they can only be iterated once
                    // (Groq SDK streams throw error on reuse)
                }
            } else {
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
                
                // Note: We don't cache streams (only cache full responses, not iterables)
                responseStream = await this.client.chat.completions.create({
                    model: this.model,
                    messages: messagesForApi as any,
                    max_tokens: this.maxTokens,
                    stream: true,
                    temperature: 0.5,
                    });
            }

            let chunkCount = 0;
            let streamError: any = null;
            try {
                for await (const chunk of responseStream) {
                    chunkCount++;

                    const contentDelta = chunk.choices[0]?.delta?.content;
                    const toolCallsDelta = chunk.choices[0]?.delta?.tool_calls;

                    if (contentDelta) {
                        accumulatedText += contentDelta;
                        // NOTE: We accumulate text but DON'T emit it yet
                        // If tool calls are present, we'll suppress this text since it assumes completion
                        // Text will only be emitted if NO tool calls are detected
                    }

                    if (toolCallsDelta) {
                        if (!accumulatedToolCalls) accumulatedToolCalls = [];
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
            } catch (err: any) {
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
                // Check if this is a malformed tool call error
                if (err.message?.includes('Failed to parse tool call arguments as JSON')) {
                    logger.warn('🔥 Malformed tool call detected - will attempt plan generation with placeholders', {
                        sessionId,
                        streamId,
                        userMessage: currentUserMessage?.substring(0, 100)
                    });
                    // Continue processing - we'll generate a plan with placeholders instead
                    accumulatedToolCalls = null;
                    streamError = null; // Clear error to continue
                } else {
                    throw err; // Re-throw other errors
                }
            }

            if (parser.parsing && !parserSuccessfullyCleanedUp) {
                parser.stopParsing();
            }

            // Process accumulated tool calls from this stream
            if (accumulatedToolCalls && accumulatedToolCalls.length > 0) {
                logger.info(`Conversational stream identified ${accumulatedToolCalls.length} tool calls.`, { sessionId });
                
                // IMPORTANT: When tool calls are present, suppress any conversational text
                // The LLM often generates text like "I've updated..." alongside the tool call
                // This text assumes the action is already complete, which is incorrect
                // We'll generate a proper summary AFTER tools execute
                if (accumulatedText && accumulatedText.trim().length > 0) {
                    logger.info('🔥 Suppressing conversational text because tool calls are present', {
                        sessionId,
                        suppressedTextLength: accumulatedText.length,
                        suppressedTextPreview: accumulatedText.substring(0, 100),
                        toolCallCount: accumulatedToolCalls.length
                    });
                    accumulatedText = ''; // Clear the text
                }
                
                accumulatedToolCalls.forEach(tc => {
                    if (tc.id && tc.function.name) {
                        try {
                            // Check for duplicates before adding
                            if (!aggregatedToolCallsOutput.some(existing => existing.id === tc.id)) {
                                // DEBUG: raw toolcall from LLM (before any manipulation)
                                try {
                                    console.log("🔥 RAW_TOOLCALL_FROM_LLM:", JSON.stringify(tc, null, 2));
                                } catch (e) {
                                    console.log("🔥 RAW_TOOLCALL_FROM_LLM (stringify failed):", tc);
                                }


                                aggregatedToolCallsOutput.push({
                                    id: tc.id,
                                    name: tc.function.name,
                                    arguments: this.sanitizeToolArguments(JSON.parse(tc.function.arguments || '{}')),
                                    streamType: 'conversational', // Mark the source stream
                                    function: undefined as any
                                });
                                logger.info('Collected tool_call from conversational stream', { name: tc.function.name });
                            }
                        } catch (e: any) {
                            logger.error("Failed to parse tool arguments from conversational stream", { 
                                args: tc.function.arguments, error: e.message 
                            });
                        }
                    }
                });
            } else {
                // No tool calls - safe to emit the conversational text
                if (accumulatedText && accumulatedText.trim().length > 0) {
                    logger.info('🔥 No tool calls detected - emitting conversational text', {
                        sessionId,
                        textLength: accumulatedText.length
                    });
                    // Emit the accumulated text now
                    if (parser.parsing && !parserSuccessfullyCleanedUp) {
                        // Re-parse the entire accumulated text
                        parser.parseToken(accumulatedText);
                    }
                    this.emitStructuredEventsFromText(sessionId, accumulatedText, currentMessageId);
                }
            }

            // Log the complete LLM response for debugging
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

            // Warn if LLM returned completely empty response (neither text nor tool calls)
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

            // After the stream is complete, add the assistant's text response to history.
            // Include tool_calls if any were made - this is critical for the LLM to understand
            // the context when we later add tool results and generate a summary.
            // SAFETY: Only include what actually exists.
            // Never push an empty assistant message.
            if (accumulatedToolCalls && accumulatedToolCalls.length > 0) {
                historyForThisStream.push({
                    role: 'assistant',
                    content: null, // Per API requirements, content is null when using tools
                    tool_calls: accumulatedToolCalls
                });
            } else if (accumulatedText && accumulatedText.trim().length > 0) {
                // IMPORTANT: Do NOT include `tool_calls: null`. The key should be omitted.
                historyForThisStream.push({
                    role: 'assistant',
                    content: accumulatedText
                });
            } else {
                logger.warn("Skipping empty assistant message — prevents broken second-turn.", {
                    sessionId
                });
            }
            this.conversationHistory.set(sessionId, this.trimHistory(historyForThisStream));

            // If tool calls failed or no tool calls were made, attempt to generate a plan with placeholders
            // This allows vague requests to proceed with a plan that the UI can fill in missing params for
            // BUT: Only do this in non-summary mode - in summary mode, we should just respond based on tool results
            if (!accumulatedToolCalls || accumulatedToolCalls.length === 0) {
                // Skip plan generation in summary mode - just respond based on tool results
                if (isSummaryMode) {
                    logger.info('🔥 Summary mode: No tool calls, not generating new plan (responding based on tool results)', {
                        sessionId,
                        streamId,
                        hasConversationalText: !!accumulatedText
                    });
                } else {
                    logger.info('🔥 No valid tool calls from conversational stream, attempting plan generation with placeholders', {
                        sessionId,
                        streamId,
                        userMessage: currentUserMessage?.substring(0, 100),
                        hasConversationalText: !!accumulatedText
                    });
                
                    try {
                        // Attempt to generate a plan from the user message
                        // The planner will create a plan with placeholders for missing parameters
                        const generatedPlan = await this.generatePlanWithPlaceholders(
                            currentUserMessage || '',
                            sessionId,
                            currentMessageId,
                            _userId
                        );

                        if (generatedPlan && generatedPlan.length > 0) {
                            logger.info('🔥 Successfully generated plan with placeholders', {
                                sessionId,
                                stepCount: generatedPlan.length,
                                toolNames: generatedPlan.map((s: any) => s.tool)
                            });
                            // Convert plan steps to aggregated tool calls format
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
                    } catch (planError: any) {
                        logger.warn('🔥 Plan generation with placeholders failed', {
                            sessionId,
                            error: planError.message
                        });
                        // Continue without plan - conversational response is still valid
                    }
                }
            }

        } catch (outerError: any) {
            logger.error('🔥🔥🔥 FATAL ERROR in conversational stream', {
                sessionId,
                streamId,
                error: outerError.message,
                errorStack: outerError.stack,
                errorName: outerError.name,
                accumulatedTextLength: accumulatedText.length,
                hasAccumulatedToolCalls: !!accumulatedToolCalls
            });
            // Don't re-throw - return empty result gracefully
        } finally {
            if (!parserSuccessfullyCleanedUp) {
                if (unsubscribeFromParser) unsubscribeFromParser();
                if (parser.parsing) parser.stopParsing();
                MarkdownStreamParser.removeInstance(parserInstanceId);
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

    private accumulateToolCallDeltas(
        currentToolCalls: Groq.Chat.Completions.ChatCompletionMessageToolCall[],
        toolCallDeltas: Groq.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
    ) {
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
                    currentToolCalls[toolCallDelta.index].type = toolCallDelta.type as 'function';
                }
            }
        }
    }

    /**
     * Generate a plan with placeholders for vague requests
     * This allows the UI to prompt the user for missing parameters
     */
    private async generatePlanWithPlaceholders(
        userMessage: string,
        sessionId: string,
        messageId: string,
        userId?: string
    ): Promise<any[]> {
        logger.info('🔥 Generating plan with placeholders for vague request', {
            sessionId,
            userMessage: userMessage.substring(0, 100)
        });

        // Use provider-aware filtering if available
        let availableTools;
        if (this.providerAwareFilter && userId) {
            const relevantCategories = getRelevantToolCategories(userMessage);
            availableTools = await this.providerAwareFilter.getToolsByCategoriesForUser(userId, relevantCategories);
        } else {
            const relevantCategories = getRelevantToolCategories(userMessage);
            availableTools = this.toolConfigManager.getToolsByCategories(relevantCategories);
        }

        const toolDefinitions = availableTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            schema: this.toolConfigManager.getToolInputSchema(tool.name)
        })).filter(t => t.schema);

        // Create a prompt that instructs the LLM to generate a plan with placeholders
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
            // ENHANCEMENT 2: Cache planning prompts - same user request = same plan
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
            } else {
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

            // Parse the JSON response - try multiple strategies for robustness
            let parsedResponse: any = null;
            let parseError: string | null = null;

            // Strategy 1: Try to find and parse JSON object
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsedResponse = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    parseError = e instanceof Error ? e.message : 'Unknown parse error';
                    logger.warn('🔥 First JSON parse attempt failed', { 
                        sessionId, 
                        error: parseError,
                        attemptedText: jsonMatch[0].substring(0, 200)
                    });
                }
            }

            // Strategy 2: If first strategy failed, try to extract valid JSON by finding balanced braces
            if (!parsedResponse && responseText.includes('{')) {
                try {
                    let braceCount = 0;
                    let startIdx = responseText.indexOf('{');
                    let endIdx = -1;

                    for (let i = startIdx; i < responseText.length; i++) {
                        if (responseText[i] === '{') braceCount++;
                        if (responseText[i] === '}') braceCount--;
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
                } catch (e) {
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
                steps: planSteps.map((s: any) => ({ id: s.id, tool: s.tool }))
            });

            return planSteps;
        } catch (error: any) {
            logger.error('🔥 Error generating plan with placeholders', {
                sessionId,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Hydrate any Redis-cached tool results back into full content before sending to LLM.
     * This ensures the LLM sees complete data for summary generation.
     * Also cap the size to prevent token overflow.
     */
    private async hydrateToolResultsFromRedis(history: Message[], summaryMode: boolean = false): Promise<Message[]> {
        const hydrated: Message[] = [];
        // In summary mode, allow larger results (for email analysis) - up to 100KB
        // In normal mode, cap at 15KB to prevent token overflow
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
                    
                    // Check if this is a Redis reference
                    if (parsed.__note === 'Full result stored in Redis' && parsed.__redisKey) {
                        logger.info('Found Redis reference, retrieving...', {
                            redisKey: parsed.__redisKey,
                            toolName: msg.name
                        });
                        
                        // Retrieve the full result from Redis
                        const fullResult = await this.redis.get(parsed.__redisKey);
                        
                        if (fullResult) {
                            // Always process email data to compress it (not just summary mode!)
                            // This prevents rate limiting on follow-up messages
                            let contentToSend = fullResult;
                            let compressionApplied = false;
                            
                            logger.debug('🔍 Hydration: Retrieved from Redis', {
                                summaryMode,
                                resultSize: fullResult.length,
                                resultType: typeof fullResult,
                                toolName: msg.name
                            });
                            
                            // ALWAYS attempt compression for email results, not just in summary mode
                            // This prevents sending 107KB of data on follow-up messages
                            logger.debug('🔍 Attempting compression for email data');
                            try {
                                const resultData = JSON.parse(fullResult);
                                logger.debug('🔍 JSON parse successful', {
                                    isArray: Array.isArray(resultData),
                                    dataType: typeof resultData,
                                    arrayLength: Array.isArray(resultData) ? resultData.length : 'N/A'
                                });
                                
                                // Handle both array format and object format (with records array)
                                let emailArray = Array.isArray(resultData) ? resultData : 
                                                (resultData?.records && Array.isArray(resultData.records)) ? resultData.records : 
                                                null;
                                
                                if (emailArray && emailArray.length > 0) {
                                    // Compress emails: limit to 5 emails, generous body compression
                                    const MAX_EMAILS_FOR_SUMMARY = EMAIL_COMPRESSION_CONFIG.MAX_EMAILS;
                                    const BODY_CHAR_LIMIT = EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT;
                                    
                                    const emailsToAnalyze = emailArray.slice(0, MAX_EMAILS_FOR_SUMMARY).map((email: any) => ({
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
                                } else {
                                    logger.warn('⚠️ Could not find email array to compress', {
                                        dataType: typeof resultData,
                                        dataKeys: Object.keys(resultData || {}).slice(0, 5),
                                        hasRecords: !!resultData?.records
                                    });
                                }
                            } catch (e) {
                                // If parsing fails, use full result as-is
                                logger.warn('⚠️ Could not parse result data for compression', { 
                                    error: e instanceof Error ? e.message : 'unknown',
                                    resultPreview: fullResult.substring(0, 200)
                                });
                            }
                            
                            // NOW send the result to LLM, even if still large
                            // The LLM needs actual data to generate a rich response, not references
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
                        } else {
                            // No result found in Redis - log but continue with reference
                            logger.warn('Redis key not found, using reference', {
                                redisKey: parsed.__redisKey,
                                toolName: msg.name
                            });
                            // Don't mark as hydrated, fall through to push original
                        }
                    }
                } catch (error) {
                    logger.debug('Error parsing tool message content', { 
                        error: error instanceof Error ? error.message : 'unknown',
                        toolName: msg.name
                    });
                }
            }
            
            // Only push original message if it wasn't successfully hydrated
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

    private async injectCachedEntitiesIntoHistory(sessionId: string, history: Message[]): Promise<Message[]> {
        try {
            if (!this.entityCache) return history;

            // First, check if there's a recent tool result with email data that should be cached
            // This ensures fresh fetches are immediately available for LLM analysis
            const lastToolMessage = history.slice().reverse().find((msg: Message) => msg.role === 'tool' && msg.name?.includes('fetch_emails'));
            if (lastToolMessage && lastToolMessage.content) {
                try {
                    const toolData = JSON.parse(lastToolMessage.content);
                    if (toolData.data && Array.isArray(toolData.data)) {
                        // Tool result has fresh emails - they should already be cached by ToolOrchestrator
                        // This is good, the emails are available for the LLM
                    }
                } catch (e) {
                    // Not JSON, skip
                }
            }

            // Retrieve recent cached entities (emails for follow-up context)
            // Limit to 5 most recent emails to avoid token bloat
            const recentCachedEntities = await this.entityCache.getRecentCachedEntities(
                sessionId,
                'email',  // Focus on emails for context
                5  // Maximum 5 recent emails
            );

            if (!recentCachedEntities || recentCachedEntities.length === 0) {
                return history;
            }

            // Check if we already have these entities in recent history to avoid duplication
            const existingEntityIds = new Set<string>();
            history.forEach(msg => {
                if (msg.role === 'tool' && msg.content) {
                    try {
                        const parsed = JSON.parse(msg.content);
                        if (Array.isArray(parsed)) {
                            parsed.forEach((item: any) => {
                                if (item.id) existingEntityIds.add(item.id);
                            });
                        } else if (parsed.id) {
                            existingEntityIds.add(parsed.id);
                        }
                    } catch (e) {
                        // Not JSON, skip
                    }
                }
            });

            // Filter out entities already in history
            const newCachedEntities = recentCachedEntities.filter(
                entity => !existingEntityIds.has(entity.id)
            );

            if (newCachedEntities.length === 0) {
                return history;
            }

            // Create a synthetic tool message with the cached entities
            // This simulates them being freshly fetched
            const cachedEntityMessage: Message = {
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

            // Insert cached entities right before the last user message
            // This maintains conversation flow while giving LLM context
            const enhancedHistory = [...history];
            
            // Find the last user message
            let lastUserMessageIndex = -1;
            for (let i = enhancedHistory.length - 1; i >= 0; i--) {
                if (enhancedHistory[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            if (lastUserMessageIndex >= 0) {
                // Insert cached entities before the last user message
                enhancedHistory.splice(lastUserMessageIndex, 0, cachedEntityMessage);
            } else {
                // No user message found, append at the end
                enhancedHistory.push(cachedEntityMessage);
            }

            logger.info('Injected cached entities into conversation history', {
                sessionId,
                entityCount: newCachedEntities.length,
                totalHistoryLength: enhancedHistory.length
            });

            return enhancedHistory;
        } catch (error) {
            logger.warn('Error injecting cached entities into history', {
                error: error instanceof Error ? error.message : String(error),
                sessionId
            });
            return history;
        }
    }

    private prepareHistoryForLLM(history: Message[]): Message[] {
        return history.filter(msg => {
            // Exclude system messages (they're added separately)
            if (msg.role === 'system') return false;

            // Include tool result messages (role: 'tool') if they have content
            if (msg.role === 'tool' && msg.content) return true;

            // Include other messages (user/assistant) if they have content or tool calls
            return msg.content || (msg.tool_calls && msg.tool_calls.length > 0);
        });
    }

    private getHistory(sessionId: string): Message[] {
        return this.conversationHistory.get(sessionId) || [];
    }

    private trimHistory(history: Message[], maxLength: number = 20): Message[] {
        if (history.length <= maxLength) return history;
        const systemPrompts = history.filter(h => h.role === 'system');
        const nonSystem = history.filter(h => h.role !== 'system');
        const trimmed = nonSystem.slice(-maxLength + systemPrompts.length);
        return [...systemPrompts, ...trimmed];
    }

    /**
     * Trim history to reduce token count for API calls.
     * Keeps last N messages to stay within token budget.
     */
    private trimHistoryForApi(history: Message[], maxMessages: number = 8): Message[] {
        if (history.length <= maxMessages) return history;
        
        // Always keep system message
        const systemMsg = history.find(h => h.role === 'system');
        const others = history.filter(h => h.role !== 'system');
        
        // Keep the most recent messages
        const trimmed = others.slice(-(maxMessages - 1));
        
        logger.info('Trimming history for API call', {
            originalLength: history.length,
            trimmedLength: trimmed.length + (systemMsg ? 1 : 0),
            maxMessages
        });
        
        return systemMsg ? [systemMsg, ...trimmed] : trimmed;
    }

    public addAssistantMessageToHistory(sessionId: string, content: string, metadata?: Record<string, any>): void {
        const history = this.getHistory(sessionId);
        const assistantMessage: Message = {
            role: 'assistant',
            content: content,
        };
        history.push(assistantMessage);
        this.conversationHistory.set(sessionId, this.trimHistory(history));
        logger.info('Added assistant message to history programmatically', { sessionId });
    }

    public addToolResultMessageToHistory(sessionId: string, toolCallId: string, toolName: string, resultData: any): void {
        const history = this.getHistory(sessionId);
        
        // Validate result size before adding to history
        const resultSize = JSON.stringify(resultData).length;
        const MAX_RESULT_SIZE = 50 * 1024; // 50KB limit per result
        
        let content: string;
        
        if (resultSize > MAX_RESULT_SIZE) {
            logger.info('Tool result exceeds size limit, storing in Redis', {
                sessionId,
                toolName,
                toolCallId,
                originalSize: resultSize,
                limit: MAX_RESULT_SIZE,
                oversizeBy: resultSize - MAX_RESULT_SIZE
            });
            
            // Store full result in Redis with 1-hour TTL
            const resultRedisKey = `tool-result:${sessionId}:${toolCallId}`;
            this.redis.setex(
                resultRedisKey,
                3600, // 1 hour TTL
                JSON.stringify(resultData)
            ).catch((err: any) => {
                logger.error('Failed to store large tool result in Redis', { error: err.message, sessionId, toolCallId });
            });
            
            // Add a compact reference to history for the LLM
            content = JSON.stringify({
                __note: 'Full result stored in Redis',
                __toolCallId: toolCallId,
                __sessionId: sessionId,
                __redisKey: resultRedisKey,
                __originalSize: resultSize,
                // Include a brief summary if available (e.g., record count)
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
        } else {
            // Small results fit in history directly
            content = JSON.stringify(resultData, null, 2);
        }
        
        const toolMessage: Message = {
            role: 'tool',
            tool_call_id: toolCallId,
            name: toolName,
            content: content,
        };
        history.push(toolMessage);
        this.conversationHistory.set(sessionId, this.trimHistory(history));
        logger.info('Added tool result message to history', { sessionId, toolName, toolCallId, resultSize, stored: resultSize > MAX_RESULT_SIZE ? 'Redis' : 'History' });
    }

    /**
     * Sanitize tool arguments by removing null/undefined values
     * This prevents schema validation failures from optional parameters passed as null
     */
    private sanitizeToolArguments(args: Record<string, any>): Record<string, any> {
        const sanitized: Record<string, any> = {};

        const removeNullRecursive = (obj: any): any => {
            if (obj === null || obj === undefined) {
                return undefined; // Mark for removal
            }

            if (typeof obj !== 'object') {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(removeNullRecursive).filter(v => v !== undefined);
            }

            const cleaned: Record<string, any> = {};
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

    /**
     * Extract title from text (first heading or first sentence)
     */
    private extractTitle(text: string): string {
        // Try to find markdown heading first
        const headingMatch = text.match(/^#+ (.+)$/m);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        // Otherwise, take first sentence (up to 100 chars)
        const sentences = text.split(/[.!?]\s+/);
        if (sentences.length > 0) {
            const firstSentence = sentences[0].trim();
            return firstSentence.length > 100
                ? firstSentence.substring(0, 97) + '...'
                : firstSentence;
        }

        return text.substring(0, 100);
    }

    /**
     * Parse text into structured segments
     */
    private parseIntoSegments(text: string): Array<{
        type: 'text' | 'quote' | 'context';
        content?: string;
        text?: string;
        attribution?: string;
        title?: string;
        summary?: string;
    }> {
        const segments: Array<any> = [];
        const lines = text.split('\n');
        let currentParagraph = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines
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

            // Check if it's a heading (context segment)
            if (line.startsWith('#')) {
                if (currentParagraph) {
                    segments.push({
                        type: 'text',
                        content: currentParagraph.trim()
                    });
                    currentParagraph = '';
                }

                const headingText = line.replace(/^#+\s*/, '');
                // Peek ahead for the content under this heading
                let summary = '';
                for (let j = i + 1; j < lines.length && !lines[j].startsWith('#'); j++) {
                    if (lines[j].trim()) {
                        summary += lines[j] + ' ';
                        if (summary.length > 200) break;
                    }
                }

                segments.push({
                    type: 'context',
                    title: headingText,
                    summary: summary.trim().substring(0, 200)
                });
                continue;
            }

            // Check if it's a quote
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

            // Regular text - accumulate into paragraph
            currentParagraph += line + ' ';
        }

        // Add final paragraph
        if (currentParagraph) {
            segments.push({
                type: 'text',
                content: currentParagraph.trim()
            });
        }

        return segments;
    }

    /**
     * Emit structured events from accumulated text during streaming
     */
    private emitStructuredEventsFromText(
        sessionId: string,
        accumulatedText: string,
        messageId: string
    ): void {
        // Emit title if this is the first significant text and we haven't emitted one yet
        if (accumulatedText.length > 20 && !this.titleEmitted.has(sessionId)) {
            const title = this.extractTitle(accumulatedText);
            this.emitTitleGenerated(sessionId, title);
            this.titleEmitted.add(sessionId);
            logger.info('Emitted title_generated event', { sessionId, title });
        }

        // Optionally emit segments as text accumulates
        // Note: This is disabled by default to avoid duplicate events
        // Enable this if you want progressive segment emission during conversations
        /*
        if (accumulatedText.length > 100) {
            const segments = this.parseIntoSegments(accumulatedText);
            segments.forEach(segment => {
                this.emitSegmentAdded(sessionId, segment);
            });
        }
        */
    }

    /**
     * Clear title tracking for a session (e.g., when starting a new conversation)
     */
    public clearTitleTracking(sessionId: string): void {
        this.titleEmitted.delete(sessionId);
    }
}
