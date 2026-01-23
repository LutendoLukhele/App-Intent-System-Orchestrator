// src/services/groq.service.ts

import Groq from 'groq-sdk';

interface GroqResponse {
    content: string;
    model: string;
    usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    executedTools?: unknown;
    reasoning?: string;
}

export interface SearchSettings {
    exclude_domains?: string[];
    include_domains?: string[];
    country?: string;
}

export interface StreamCallbacks {
    onToken?: (chunk: string) => void;
    onReasoning?: (text: string) => void;
    onToolCall?: (toolCalls: unknown) => void;
    onComplete?: (response: GroqResponse) => void;
    onError?: (error: Error) => void;
}

interface ExecuteOptions {
    searchSettings?: SearchSettings;
    callbacks?: StreamCallbacks;
}

export class GroqService {
    private client: Groq;

    constructor() {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is required');
        }
        this.client = new Groq({ apiKey });
    }

    public async executeSearch(prompt: string, options: ExecuteOptions = {}): Promise<GroqResponse> {
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
                // Forward web search controls to Compound/Compound-mini
                // See Groq docs: search_settings: { include_domains, exclude_domains, country }
                ...(options.searchSettings ? { search_settings: options.searchSettings } : {}),
            });

            return {
                content: response.choices[0].message?.content ?? '',
                model: response.model ?? '',
                usage: response.usage ?? {},
                executedTools: response.choices[0].message?.tool_calls,
                reasoning: (response.choices[0] as any)?.message?.reasoning,
            };
        } catch (error: any) {
            throw new Error(`Groq API error: ${error?.message ?? 'Unknown error'}`);
        }
    }

    public async *executeSearchStream(prompt: string, options: ExecuteOptions = {}): AsyncGenerator<Groq.Chat.Completions.ChatCompletionChunk> {
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
                // Extract data for callbacks
                if (chunk.model) model = chunk.model;
                if ((chunk as any).usage) {
                    usage = { ...usage, ...(chunk as any).usage };
                }

                const choice = chunk.choices?.[0];
                const delta = choice?.delta;

                // Call onToken callback
                if (delta?.content && options.callbacks?.onToken) {
                    options.callbacks.onToken(delta.content);
                    combinedContent += delta.content;
                }

                // Call onReasoning callback
                if ((delta as any)?.reasoning && options.callbacks?.onReasoning) {
                    options.callbacks.onReasoning((delta as any).reasoning);
                    combinedReasoning += (delta as any).reasoning;
                }

                // Call onToolCall callback
                if (delta?.tool_calls && options.callbacks?.onToolCall) {
                    options.callbacks.onToolCall(delta.tool_calls);
                }

                yield chunk;
            }

            // Call onComplete callback with accumulated response
            if (options.callbacks?.onComplete) {
                options.callbacks.onComplete({
                    content: combinedContent,
                    model,
                    usage,
                    reasoning: combinedReasoning || undefined,
                    executedTools: undefined
                });
            }

        } catch (error: any) {
            const err = new Error(`Groq API error: ${error?.message ?? 'Unknown error'}`);
            if (options.callbacks?.onError) {
                options.callbacks.onError(err);
            }
            throw err;
        }
    }
}

export const groqService = new GroqService();
