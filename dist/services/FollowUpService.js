"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpService = void 0;
const winston_1 = __importDefault(require("winston"));
const followUpPrompt_1 = require("./followUpPrompt");
const ToolConfigManager_1 = require("./tool/ToolConfigManager");
const emailCompressionConfig_1 = require("./emailCompressionConfig");
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [new winston_1.default.transports.Console()],
});
class FollowUpService {
    constructor(client, model, maxTokens, redis) {
        this.client = client;
        this.model = model;
        this.maxTokens = maxTokens;
        this.redis = redis;
        this.toolConfigManager = new ToolConfigManager_1.ToolConfigManager();
    }
    async generateFollowUp(run, nextStep, sessionId) {
        const lastCompletedStep = [...run.toolExecutionPlan].reverse().find(s => s.status === 'completed');
        if (!lastCompletedStep || !lastCompletedStep.result) {
            logger.warn('FollowUpService: Could not find a last completed step with a result.', { runId: run.id });
            return { summary: null, nextToolCall: null };
        }
        let resultData = lastCompletedStep.result.data;
        if (sessionId && this.redis && typeof resultData === 'object' && resultData.__note === 'Full result stored in Redis') {
            try {
                const redisKey = resultData.__redisKey;
                const storedResult = await this.redis.get(redisKey);
                if (storedResult) {
                    resultData = JSON.parse(storedResult);
                    logger.info('FollowUpService: Retrieved full result from Redis', {
                        sessionId,
                        redisKey,
                        size: JSON.stringify(resultData).length
                    });
                }
            }
            catch (error) {
                logger.warn('FollowUpService: Failed to retrieve result from Redis, using reference', {
                    error: error instanceof Error ? error.message : String(error),
                    sessionId
                });
            }
        }
        let processedData = resultData;
        let recordArray = Array.isArray(resultData) ? resultData :
            (resultData?.records && Array.isArray(resultData.records)) ? resultData.records :
                null;
        if (recordArray && recordArray.length > 0) {
            const sampleRecord = recordArray[0];
            const isCRMData = !!sampleRecord?.attributes?.type;
            const compressionResult = isCRMData
                ? (0, emailCompressionConfig_1.compressCRMData)(resultData, emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS)
                : (0, emailCompressionConfig_1.compressEmailData)(resultData, emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS, emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.BODY_CHAR_LIMIT);
            processedData = compressionResult.compressed;
            logger.info('FollowUpService: Data compression complete', {
                dataType: isCRMData ? 'CRM' : 'Email',
                entityType: compressionResult.entityType,
                originalCount: recordArray.length,
                compressedCount: compressionResult.wasCompressed ? emailCompressionConfig_1.EMAIL_COMPRESSION_CONFIG.MAX_EMAILS : 'N/A',
                originalSize: compressionResult.originalSize,
                compressedSize: compressionResult.compressedSize,
                compressionRatio: compressionResult.compressionRatio
            });
        }
        const toolResultJson = JSON.stringify(processedData, null, 2);
        const nextToolName = nextStep.toolCall.name;
        const nextToolSchema = this.toolConfigManager.getToolInputSchema(nextToolName);
        const nextToolDescription = this.toolConfigManager.getToolDefinition(nextToolName)?.description || 'No description available.';
        const prompt = followUpPrompt_1.FOLLOW_UP_PROMPT_TEMPLATE
            .replace('{{USER_INITIAL_QUERY}}', run.userInput)
            .replace('{{PREVIOUS_TOOL_RESULT_JSON}}', toolResultJson)
            .replace('{{NEXT_TOOL_NAME}}', nextToolName)
            .replace('{{NEXT_TOOL_DESCRIPTION}}', nextToolDescription)
            .replace('{{NEXT_TOOL_PARAMETERS_JSON}}', JSON.stringify(nextToolSchema, null, 2));
        try {
            const chatCompletion = await this.client.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: this.model,
                response_format: { type: "json_object" },
                max_tokens: this.maxTokens,
            });
            const responseContent = chatCompletion.choices[0]?.message?.content;
            if (!responseContent) {
                logger.warn('FollowUpService: LLM returned no content.', { runId: run.id });
                return { summary: "The action was successful.", nextToolCall: null };
            }
            const parsedResponse = JSON.parse(responseContent);
            const summary = parsedResponse.summary || null;
            const nextToolCallArgs = parsedResponse.nextToolCallArgs || null;
            const nextToolCall = nextToolCallArgs ? { ...nextStep.toolCall, arguments: nextToolCallArgs } : null;
            logger.info('FollowUpService: Generated follow-up response', {
                runId: run.id,
                hasSummary: !!summary,
                summaryLength: summary?.length || 0,
                hasNextToolCall: !!nextToolCall
            });
            return { summary, nextToolCall };
        }
        catch (error) {
            logger.error('Failed to generate AI follow-up from Groq.', { error });
            return { summary: `The action '${lastCompletedStep.result.toolName}' completed successfully.`, nextToolCall: null };
        }
    }
    _extractCRMSummaryFields(entityType, records) {
        const fieldMappings = {
            'Lead': ['Id', 'FirstName', 'LastName', 'Email', 'Company', 'Status', 'Rating', 'Phone'],
            'Account': ['Id', 'Name', 'Industry', 'AnnualRevenue', 'Phone', 'WebsiteURL', 'NumberOfEmployees'],
            'Contact': ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'AccountId', 'Title', 'Department'],
            'Case': ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'CreatedDate', 'AccountId', 'ContactId'],
            'Opportunity': ['Id', 'Name', 'StageName', 'Amount', 'CloseDate', 'Probability', 'AccountId'],
            'Article': ['Id', 'Title', 'UrlName', 'PublishStatus', 'CreatedDate', 'CreatedById']
        };
        const relevantFields = fieldMappings[entityType] || ['Id', 'Name', 'Email', 'Status'];
        const summaryRecords = [];
        for (const record of records.slice(0, 5)) {
            const summary = {};
            for (const field of relevantFields) {
                if (field in record) {
                    summary[field] = record[field];
                }
            }
            if (Object.keys(summary).length > 0) {
                summaryRecords.push(summary);
            }
        }
        return summaryRecords;
    }
}
exports.FollowUpService = FollowUpService;
