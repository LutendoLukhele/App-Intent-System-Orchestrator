"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.groqService = exports.GroqService = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
class GroqService {
    constructor() {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is required');
        }
        this.client = new groq_sdk_1.default({ apiKey });
    }
    async executeSearch(prompt, options = {}) {
        try {
            const response = await this.client.chat.completions.create({
                model: process.env.GROQ_MODEL ?? 'groq/compound',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                stream: false,
                ...(options.searchSettings ? { search_settings: options.searchSettings } : {}),
            });
            return {
                content: response.choices[0].message?.content ?? '',
                model: response.model ?? '',
                usage: response.usage ?? {},
                executedTools: response.choices[0].message?.tool_calls,
                reasoning: response.choices[0]?.message?.reasoning,
            };
        }
        catch (error) {
            throw new Error(`Groq API error: ${error?.message ?? 'Unknown error'}`);
        }
    }
    async *executeSearchStream(prompt, options = {}) {
        try {
            const stream = await this.client.chat.completions.create({
                model: process.env.GROQ_MODEL ?? 'groq/compound',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                stream: true,
                ...(options.searchSettings ? { search_settings: options.searchSettings } : {}),
            });
            let combinedContent = '';
            let combinedReasoning = '';
            let model = '';
            let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            for await (const chunk of stream) {
                if (chunk.model)
                    model = chunk.model;
                if (chunk.usage) {
                    usage = { ...usage, ...chunk.usage };
                }
                const choice = chunk.choices?.[0];
                const delta = choice?.delta;
                if (delta?.content && options.callbacks?.onToken) {
                    options.callbacks.onToken(delta.content);
                    combinedContent += delta.content;
                }
                if (delta?.reasoning && options.callbacks?.onReasoning) {
                    options.callbacks.onReasoning(delta.reasoning);
                    combinedReasoning += delta.reasoning;
                }
                if (delta?.tool_calls && options.callbacks?.onToolCall) {
                    options.callbacks.onToolCall(delta.tool_calls);
                }
                yield chunk;
            }
            if (options.callbacks?.onComplete) {
                options.callbacks.onComplete({
                    content: combinedContent,
                    model,
                    usage,
                    reasoning: combinedReasoning || undefined,
                    executedTools: undefined
                });
            }
        }
        catch (error) {
            const err = new Error(`Groq API error: ${error?.message ?? 'Unknown error'}`);
            if (options.callbacks?.onError) {
                options.callbacks.onError(err);
            }
            throw err;
        }
    }
}
exports.GroqService = GroqService;
exports.groqService = new GroqService();
