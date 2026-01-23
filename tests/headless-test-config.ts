/**
 * Headless Testing Configuration
 * Defines all test data fixtures and utilities needed for automated testing
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================
// TEST DATA GENERATORS
// ============================================================

export interface TestUser {
    userId: string;
    email: string;
    firebaseToken?: string;
}

export interface TestConnection {
    connectionId: string;
    userId: string;
    provider: string;
    nanoConnectionId: string;
}

export interface TestSession {
    sessionId: string;
    userId: string;
    connectionIds: string[];
    createdAt: Date;
}

export class TestDataFactory {
    /**
     * Create a mock Firebase user for testing
     * In production, use real Firebase auth tokens
     */
    static createTestUser(override?: Partial<TestUser>): TestUser {
        const userId = override?.userId || `test-user-${uuidv4().slice(0, 8)}`;
        return {
            userId,
            email: override?.email || `${userId}@test.cortex.dev`,
            firebaseToken: override?.firebaseToken || `mock-firebase-token-${userId}`,
            ...override,
        };
    }

    /**
     * Create a mock Nango connection
     * IMPORTANT: For real testing, use actual Nango connection IDs from staging
     */
    static createTestConnection(userId: string, override?: Partial<TestConnection>): TestConnection {
        const connectionId = override?.connectionId || `nango-${uuidv4().slice(0, 8)}`;
        return {
            connectionId,
            userId,
            provider: override?.provider || 'google-mail-ynxw',
            nanoConnectionId: override?.nanoConnectionId || `nano-${uuidv4().slice(0, 8)}`,
            ...override,
        };
    }

    /**
     * Create a mock WebSocket session
     */
    static createTestSession(userId: string, connectionIds: string[]): TestSession {
        return {
            sessionId: `session-${uuidv4().slice(0, 8)}`,
            userId,
            connectionIds,
            createdAt: new Date(),
        };
    }
}

// ============================================================
// TEST MESSAGES (PAYLOAD TYPES)
// ============================================================

export interface WebSocketMessage {
    type: 'user_message' | 'auth_message' | 'action_execute';
    payload: any;
}

export class TestMessageFactory {
    /**
     * Create an authentication message to establish WebSocket connection
     */
    static createAuthMessage(userId: string, sessionId?: string, token?: string): WebSocketMessage {
        return {
            type: 'auth_message',
            payload: {
                userId,
                sessionId: sessionId || `session-${uuidv4().slice(0, 8)}`,
                authToken: token || `mock-auth-${uuidv4().slice(0, 16)}`,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Create a user message (conversation message)
     * This is what triggers the full pipeline
     */
    static createUserMessage(
        userQuery: string,
        sessionId: string,
        userId: string,
        messageId?: string
    ): WebSocketMessage {
        return {
            type: 'user_message',
            payload: {
                userMessage: userQuery,
                sessionId,
                userId,
                messageId: messageId || `msg-${uuidv4().slice(0, 8)}`,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Create an action execution message
     * Used to trigger tool execution
     */
    static createActionExecuteMessage(
        actionId: string,
        planId: string,
        sessionId: string,
        userId: string,
        arguments: Record<string, any>
    ): WebSocketMessage {
        return {
            type: 'action_execute',
            payload: {
                actionId,
                planId,
                sessionId,
                userId,
                arguments,
                timestamp: new Date().toISOString(),
            },
        };
    }
}

// ============================================================
// TEST SCENARIOS
// ============================================================

export interface TestScenario {
    name: string;
    description: string;
    userId: string;
    connectionIds: string[];
    messages: Array<{
        type: string;
        delay?: number; // ms before sending
        expectedResponse?: string | RegExp;
        timeout?: number; // ms to wait for response
    }>;
}

export const COMMON_TEST_SCENARIOS: Record<string, TestScenario> = {
    FETCH_EMAILS: {
        name: 'Fetch Recent Emails',
        description: 'User requests recent emails from today',
        userId: 'test-user-001',
        connectionIds: ['nango-gmail-001'],
        messages: [
            {
                type: 'user_message',
                payload: {
                    userMessage: 'Show me my most recent 5 email threads from today, excluding promotions.',
                },
                timeout: 30000,
                expectedResponse: /email|thread|from|subject/i,
            },
        ],
    },

    EMAIL_SUMMARY: {
        name: 'Email Summary',
        description: 'User requests a summary of recent emails',
        userId: 'test-user-002',
        connectionIds: ['nango-gmail-002'],
        messages: [
            {
                type: 'user_message',
                payload: {
                    userMessage: 'Give me a summary of my emails from this week',
                },
                timeout: 45000,
                expectedResponse: /summary|received|important/i,
            },
        ],
    },

    MULTI_STEP_WORKFLOW: {
        name: 'Multi-Step Workflow',
        description: 'User request requiring multiple tool calls',
        userId: 'test-user-003',
        connectionIds: ['nango-gmail-003'],
        messages: [
            {
                type: 'user_message',
                payload: {
                    userMessage: 'Check my emails and then send a summary to my manager',
                },
                timeout: 60000,
                expectedResponse: /email|summary|send/i,
            },
        ],
    },
};

// ============================================================
// ENVIRONMENT SETUP
// ============================================================

export interface TestEnvironment {
    wsUrl: string;
    apiUrl: string;
    databaseUrl: string;
    redisUrl: string;
    groqApiKey: string;
    nanoApiKey: string;
    nanoSecretKey: string;
}

/**
 * Load test environment variables
 * Priority: env vars > .env.test > defaults
 */
export function loadTestEnvironment(): TestEnvironment {
    return {
        wsUrl: process.env.TEST_WS_URL || 'ws://localhost:3000',
        apiUrl: process.env.TEST_API_URL || 'http://localhost:3000/api',
        databaseUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
        redisUrl: process.env.TEST_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379',
        groqApiKey: process.env.GROQ_API_KEY || '',
        nanoApiKey: process.env.NANGO_API_KEY || '',
        nanoSecretKey: process.env.NANGO_SECRET_KEY || '',
    };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate test data for a complete test run
 */
export function generateTestFixture(numUsers: number = 1, connectionsPerUser: number = 1) {
    const users = Array.from({ length: numUsers }, () => TestDataFactory.createTestUser());
    const connections = users.flatMap((user) =>
        Array.from({ length: connectionsPerUser }, () =>
            TestDataFactory.createTestConnection(user.userId)
        )
    );
    const sessions = users.map((user) =>
        TestDataFactory.createTestSession(
            user.userId,
            connections.filter((c) => c.userId === user.userId).map((c) => c.connectionId)
        )
    );

    return { users, connections, sessions };
}

/**
 * Wait for a specific time period
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelayMs: number = 100
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxAttempts - 1) {
                const delayMs = initialDelayMs * Math.pow(2, attempt);
                await delay(delayMs);
            }
        }
    }

    throw lastError || new Error('All retry attempts failed');
}
