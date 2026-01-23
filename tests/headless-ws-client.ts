/**
 * Headless WebSocket Client for Testing
 * Provides synchronous interface to WebSocket server for automated testing
 */

import WebSocket from 'ws';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

const logger = winston.createLogger({
    level: process.env.TEST_LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.colorize()
    ),
    transports: [new winston.transports.Console()],
});

export interface HeadlessClientConfig {
    wsUrl: string;
    userId: string;
    sessionId?: string;
    timeout?: number;
    verbose?: boolean;
}

export interface TestResponse {
    type: string;
    content?: any;
    error?: string;
    timestamp: Date;
}

export class HeadlessWSClient {
    private ws: WebSocket | null = null;
    private config: HeadlessClientConfig;
    private messageQueue: TestResponse[] = [];
    private responsePromises: Map<string, (value: TestResponse) => void> = new Map();
    private messageListeners: Map<string, ((msg: TestResponse) => void)[]> = new Map();
    private connected: boolean = false;
    private clientId: string = `client-${uuidv4().slice(0, 8)}`;

    constructor(config: HeadlessClientConfig) {
        this.config = {
            timeout: 30000,
            ...config,
        };
    }

    /**
     * Connect to WebSocket server
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
            }, this.config.timeout);

            try {
                this.ws = new WebSocket(this.config.wsUrl);

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    logger.info('✅ WebSocket connected', { clientId: this.clientId });

                    // Send auth message
                    this.sendRaw({
                        type: 'auth_message',
                        payload: {
                            userId: this.config.userId,
                            sessionId: this.config.sessionId || `session-${uuidv4()}`,
                            authToken: `mock-token-${this.clientId}`,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    resolve();
                });

                this.ws.on('message', (data: string) => {
                    this.handleMessage(data);
                });

                this.ws.on('error', (error) => {
                    clearTimeout(timeout);
                    logger.error('❌ WebSocket error', { error: error.message });
                    reject(error);
                });

                this.ws.on('close', () => {
                    this.connected = false;
                    logger.info('WebSocket closed');
                });
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Send a raw message to the server
     */
    private sendRaw(message: any): void {
        if (!this.ws || !this.connected) {
            throw new Error('WebSocket not connected');
        }
        if (this.config.verbose) {
            logger.debug('📤 Sending message', {
                clientId: this.clientId,
                type: message.type,
            });
        }
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Send a user message and wait for response
     */
    async sendUserMessage(
        userQuery: string,
        messageId?: string,
        timeout?: number
    ): Promise<TestResponse[]> {
        const id = messageId || `msg-${uuidv4().slice(0, 8)}`;
        const waitTimeout = timeout || this.config.timeout;

        if (this.config.verbose) {
            logger.info('📨 Sending user message', { messageId: id, query: userQuery });
        }

        this.sendRaw({
            type: 'user_message',
            payload: {
                userMessage: userQuery,
                sessionId: this.config.sessionId,
                userId: this.config.userId,
                messageId: id,
                timestamp: new Date().toISOString(),
            },
        });

        // Wait for completion signal or timeout
        return this.waitForMessageType('conversational_response_complete', waitTimeout).then(
            () => this.messageQueue.splice(0)
        );
    }

    /**
     * Wait for a specific message type
     */
    private async waitForMessageType(type: string, timeout: number): Promise<TestResponse> {
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.responsePromises.delete(type);
                reject(new Error(`Timeout waiting for message type: ${type}`));
            }, timeout);

            const resolver = (response: TestResponse) => {
                clearTimeout(timeoutHandle);
                this.responsePromises.delete(type);
                resolve(response);
            };

            this.responsePromises.set(type, resolver);

            // Check if message already in queue
            const existingIndex = this.messageQueue.findIndex((m) => m.type === type);
            if (existingIndex !== -1) {
                const message = this.messageQueue.splice(existingIndex, 1)[0];
                resolver(message);
            }
        });
    }

    /**
     * Handle incoming messages from server
     */
    private handleMessage(rawData: string): void {
        try {
            const data = JSON.parse(rawData);

            const response: TestResponse = {
                type: data.type || 'unknown',
                content: data.content || data,
                timestamp: new Date(),
            };

            if (this.config.verbose) {
                logger.debug('📥 Received message', { type: response.type });
            }

            this.messageQueue.push(response);

            // Notify waiters
            const resolver = this.responsePromises.get(response.type);
            if (resolver) {
                resolver(response);
            }

            // Notify listeners
            const listeners = this.messageListeners.get(response.type) || [];
            listeners.forEach((listener) => listener(response));
        } catch (error) {
            logger.warn('Failed to parse WebSocket message', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Subscribe to message type
     */
    on(type: string, callback: (msg: TestResponse) => void): void {
        if (!this.messageListeners.has(type)) {
            this.messageListeners.set(type, []);
        }
        this.messageListeners.get(type)!.push(callback);
    }

    /**
     * Disconnect from server
     */
    async disconnect(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.ws) {
                resolve();
                return;
            }

            this.ws.on('close', () => {
                logger.info('Disconnected from WebSocket');
                resolve();
            });

            this.ws.close();
        });
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get all queued messages
     */
    getMessages(): TestResponse[] {
        return [...this.messageQueue];
    }

    /**
     * Clear message queue
     */
    clearQueue(): void {
        this.messageQueue = [];
    }
}
