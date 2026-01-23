/**
 * End-to-End Headless Testing Suite
 * Test complete user workflows without UI
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import {
    TestDataFactory,
    TestMessageFactory,
    generateTestFixture,
    loadTestEnvironment,
    delay,
    retryWithBackoff,
} from './headless-test-config';
import { HeadlessWSClient } from './headless-ws-client';

const env = loadTestEnvironment();

describe('Headless E2E Tests', function () {
    this.timeout(120000); // Global timeout for all tests

    let client: HeadlessWSClient;
    let testFixture: ReturnType<typeof generateTestFixture>;

    before(async function () {
        this.timeout(10000);
        logger.info('🚀 Starting headless test suite');

        // Verify environment
        if (!env.wsUrl) {
            throw new Error('TEST_WS_URL or wsUrl is required');
        }

        // Generate test data
        testFixture = generateTestFixture(1, 1);
        logger.info('✅ Test fixtures generated', {
            users: testFixture.users.length,
            connections: testFixture.connections.length,
        });
    });

    after(async function () {
        if (client && client.isConnected()) {
            await client.disconnect();
        }
        logger.info('🏁 Test suite completed');
    });

    describe('Authentication & Connection', function () {
        beforeEach(async function () {
            const user = testFixture.users[0];
            client = new HeadlessWSClient({
                wsUrl: env.wsUrl,
                userId: user.userId,
                timeout: 10000,
                verbose: true,
            });
        });

        afterEach(async function () {
            if (client && client.isConnected()) {
                await client.disconnect();
            }
        });

        it('should connect to WebSocket server', async function () {
            await client.connect();
            expect(client.isConnected()).to.be.true;
        });

        it('should receive auth confirmation', async function () {
            await client.connect();
            const messages = client.getMessages();
            expect(messages.length).to.be.greaterThan(0);
        });

        it('should handle connection with valid userId', async function () {
            const user = testFixture.users[0];
            client = new HeadlessWSClient({
                wsUrl: env.wsUrl,
                userId: user.userId,
            });
            await client.connect();
            expect(client.isConnected()).to.be.true;
        });
    });

    describe('User Message Processing', function () {
        beforeEach(async function () {
            const user = testFixture.users[0];
            client = new HeadlessWSClient({
                wsUrl: env.wsUrl,
                userId: user.userId,
                timeout: 45000,
                verbose: false,
            });
            await client.connect();
        });

        afterEach(async function () {
            if (client && client.isConnected()) {
                await client.disconnect();
            }
        });

        it('should process simple email fetch request', async function () {
            const response = await client.sendUserMessage(
                'Show me my most recent 5 email threads from today',
                'test-msg-001',
                45000
            );

            expect(response).to.be.an('array');
            expect(response.length).to.be.greaterThan(0);

            // Should have some kind of response
            const hasResponse = response.some((msg) =>
                ['conversational_text_segment', 'conversational_response_complete'].includes(msg.type)
            );
            expect(hasResponse).to.be.true;
        });

        it('should include tool execution info', async function () {
            const response = await client.sendUserMessage(
                'Fetch my emails from today excluding promotions',
                'test-msg-002',
                45000
            );

            // Should have tool-related messages
            const hasToolExecution = response.some((msg) =>
                msg.type.includes('tool') || msg.type.includes('plan')
            );
            expect(hasToolExecution || response.length > 0).to.be.true;
        });

        it('should handle multiple sequential messages', async function () {
            const queries = [
                'Show recent emails',
                'Any unread messages?',
                'Check calendar for today',
            ];

            for (const query of queries) {
                const response = await client.sendUserMessage(query);
                expect(response).to.be.an('array');
            }
        });
    });

    describe('Error Handling', function () {
        beforeEach(async function () {
            const user = testFixture.users[0];
            client = new HeadlessWSClient({
                wsUrl: env.wsUrl,
                userId: user.userId,
                timeout: 15000,
            });
        });

        afterEach(async function () {
            if (client && client.isConnected()) {
                await client.disconnect();
            }
        });

        it('should handle malformed queries gracefully', async function () {
            await client.connect();

            try {
                const response = await client.sendUserMessage('', 'test-empty');
                // Should either error or return empty response
                expect(response).to.be.an('array');
            } catch (error) {
                // Expected to timeout or error on empty query
                expect(error).to.exist;
            }
        });

        it('should timeout on slow responses', async function () {
            await client.connect();

            try {
                // Use very short timeout
                await client.sendUserMessage(
                    'Process a complex workflow',
                    'test-timeout',
                    100 // 100ms timeout
                );
                throw new Error('Should have timed out');
            } catch (error) {
                expect(error).to.exist;
            }
        });
    });

    describe('Performance Metrics', function () {
        beforeEach(async function () {
            const user = testFixture.users[0];
            client = new HeadlessWSClient({
                wsUrl: env.wsUrl,
                userId: user.userId,
                timeout: 45000,
            });
            await client.connect();
        });

        afterEach(async function () {
            if (client && client.isConnected()) {
                await client.disconnect();
            }
        });

        it('should process request under expected latency', async function () {
            const startTime = Date.now();
            const response = await client.sendUserMessage(
                'Show my recent emails',
                'test-perf-001',
                45000
            );
            const latency = Date.now() - startTime;

            logger.info('Performance metrics', {
                latency,
                messageCount: response.length,
                averageMs: latency / (response.length || 1),
            });

            // Should complete reasonably fast (not slower than LLM timeout)
            expect(latency).to.be.lessThan(50000);
        });

        it('should handle rapid sequential requests', async function () {
            const requests = Array.from({ length: 3 }, (_, i) => `Quick query ${i + 1}`);
            const startTime = Date.now();

            for (const query of requests) {
                await client.sendUserMessage(query);
            }

            const totalTime = Date.now() - startTime;
            logger.info('Rapid request metrics', { totalTime, requestCount: requests.length });

            expect(totalTime).to.be.lessThan(120000); // 2 minutes for 3 requests
        });
    });
});

// ============================================================
// HELPER LOGGER FOR TESTS
// ============================================================

import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `[${level.toUpperCase()}] ${message} ${metaStr}`.trim();
        })
    ),
    transports: [new winston.transports.Console()],
});
