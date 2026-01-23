import { HeadlessWSClient } from './headless-ws-client';
import { TestDataFactory } from './headless-test-config';

/**
 * QUICK START EXAMPLES - Copy & modify for your testing
 */

/**
 * Example 1: Single Message Test
 * Testing: Basic message flow with actual user and connection
 */
async function example1_singleMessage() {
    console.log('\n📝 Example 1: Single Message Test');
    
    const client = new HeadlessWSClient({
        wsUrl: 'ws://localhost:3000',
        userId: 'test-user-001',
        sessionId: 'session-001',
        timeout: 45000,
        verbose: true,
    });
    
    try {
        await client.connect();
        console.log('✓ Connected');
        
        const response = await client.sendUserMessage(
            'Show my recent emails from today'
        );
        
        console.log('✓ Received response');
        console.log(`Messages received: ${response.length}`);
        
        // Check for specific response type
        const toolResponse = response.find(r => r.type === 'tool_result');
        if (toolResponse) {
            console.log(`Tool executed: ${toolResponse.toolName}`);
            console.log(`Status: ${toolResponse.status}`);
        }
    } finally {
        await client.disconnect();
    }
}

/**
 * Example 2: Sequential Messages Test
 * Testing: Multiple messages in same session, state persistence
 */
async function example2_sequentialMessages() {
    console.log('\n📝 Example 2: Sequential Messages Test');
    
    const userId = TestDataFactory.generateUserId();
    const sessionId = TestDataFactory.generateSessionId();
    
    const client = new HeadlessWSClient({
        wsUrl: 'ws://localhost:3000',
        userId,
        sessionId,
        timeout: 45000,
        verbose: false,
    });
    
    try {
        await client.connect();
        
        // Message 1: Get emails
        console.log('→ Sending message 1: Get emails');
        const msg1 = await client.sendUserMessage(
            'Show my unread emails'
        );
        console.log(`✓ Received ${msg1.length} messages`);
        
        // Message 2: Filter by sender (session should remember context)
        console.log('→ Sending message 2: Filter emails');
        const msg2 = await client.sendUserMessage(
            'Filter to only emails from my manager'
        );
        console.log(`✓ Received ${msg2.length} messages`);
        
        // Message 3: Summary
        console.log('→ Sending message 3: Summarize');
        const msg3 = await client.sendUserMessage(
            'Summarize all the action items'
        );
        console.log(`✓ Received ${msg3.length} messages`);
        
    } finally {
        await client.disconnect();
    }
}

/**
 * Example 3: Multi-User Concurrent Test
 * Testing: Multiple users simultaneously, isolation
 */
async function example3_multiUserTest() {
    console.log('\n📝 Example 3: Multi-User Concurrent Test');
    
    const numUsers = 3;
    const promises = [];
    
    for (let i = 1; i <= numUsers; i++) {
        const promise = (async () => {
            const userId = `test-user-${i}`;
            const sessionId = `session-${i}`;
            
            const client = new HeadlessWSClient({
                wsUrl: 'ws://localhost:3000',
                userId,
                sessionId,
                timeout: 45000,
                verbose: false,
            });
            
            try {
                await client.connect();
                const startTime = Date.now();
                
                const response = await client.sendUserMessage(
                    `Get my emails from user ${i}`
                );
                
                const duration = Date.now() - startTime;
                console.log(`[User ${i}] Completed in ${duration}ms, got ${response.length} messages`);
                
                return { userId, duration, messageCount: response.length };
            } finally {
                await client.disconnect();
            }
        })();
        
        promises.push(promise);
    }
    
    const results = await Promise.all(promises);
    
    // Summary
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const totalMessages = results.reduce((sum, r) => sum + r.messageCount, 0);
    
    console.log(`\n📊 Summary:`);
    console.log(`  Users: ${numUsers}`);
    console.log(`  Avg latency: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Total messages: ${totalMessages}`);
}

/**
 * Example 4: Error Handling Test
 * Testing: How system handles errors, invalid input, timeouts
 */
async function example4_errorHandling() {
    console.log('\n📝 Example 4: Error Handling Test');
    
    const client = new HeadlessWSClient({
        wsUrl: 'ws://localhost:3000',
        userId: 'test-user-error',
        timeout: 5000,  // Short timeout to test timeout handling
        verbose: true,
    });
    
    try {
        await client.connect();
        
        // Test 1: Empty query
        console.log('\nTest 1: Empty query');
        try {
            await client.sendUserMessage('');
            console.log('❌ Should have rejected empty message');
        } catch (err) {
            console.log(`✓ Correctly rejected: ${err.message.substring(0, 50)}`);
        }
        
        // Test 2: Extremely long query
        console.log('\nTest 2: Very long query');
        const longQuery = 'a'.repeat(10000);
        try {
            await client.sendUserMessage(longQuery);
            console.log('❌ Should have rejected very long message');
        } catch (err) {
            console.log(`✓ Correctly rejected: ${err.message.substring(0, 50)}`);
        }
        
        // Test 3: Invalid connection
        console.log('\nTest 3: Invalid connection handling');
        try {
            // This would normally fail if connection is invalid
            const response = await client.sendUserMessage(
                'Test message from invalid connection'
            );
            console.log(`✓ Handled gracefully: ${response.length} messages`);
        } catch (err) {
            console.log(`✓ Caught error: ${err.message.substring(0, 50)}`);
        }
        
    } finally {
        await client.disconnect();
    }
}

/**
 * Example 5: Provider-Specific Test
 * Testing: Different providers (Gmail vs Outlook)
 */
async function example5_multiProviderTest() {
    console.log('\n📝 Example 5: Multi-Provider Test');
    
    const providers = ['gmail', 'outlook'];
    
    for (const provider of providers) {
        console.log(`\nTesting ${provider}...`);
        
        const userId = `test-user-${provider}`;
        const connectionId = TestDataFactory.generateConnectionId(provider);
        
        const client = new HeadlessWSClient({
            wsUrl: 'ws://localhost:3000',
            userId,
            sessionId: `session-${provider}`,
            timeout: 45000,
            verbose: false,
        });
        
        try {
            await client.connect();
            
            const response = await client.sendUserMessage(
                `Show my ${provider} emails`
            );
            
            // Check for provider-specific responses
            const hasEmailTool = response.some(r => 
                r.toolName?.includes('email') || 
                r.toolName?.includes('gmail') ||
                r.toolName?.includes('outlook')
            );
            
            console.log(`✓ ${provider}: Got ${response.length} messages, email tool: ${hasEmailTool}`);
            
        } finally {
            await client.disconnect();
        }
    }
}

/**
 * Example 6: Performance Baseline Test
 * Testing: Measure and record performance metrics
 */
async function example6_performanceBaseline() {
    console.log('\n📝 Example 6: Performance Baseline Test');
    
    const metrics = {
        latencies: [],
        startTime: Date.now(),
        messagesSent: 0,
        messagesReceived: 0,
    };
    
    const userId = 'perf-test-user';
    const client = new HeadlessWSClient({
        wsUrl: 'ws://localhost:3000',
        userId,
        timeout: 45000,
        verbose: false,
    });
    
    const queries = [
        'Get my emails',
        'Filter to unread',
        'Show recent messages',
        'Summary of emails',
        'Action items',
    ];
    
    try {
        await client.connect();
        
        for (const query of queries) {
            const msgStartTime = Date.now();
            const response = await client.sendUserMessage(query);
            const latency = Date.now() - msgStartTime;
            
            metrics.latencies.push(latency);
            metrics.messagesSent += 1;
            metrics.messagesReceived += response.length;
            
            console.log(`  "${query.substring(0, 20)}..." → ${latency}ms (${response.length} msgs)`);
        }
        
        // Calculate statistics
        const totalTime = Date.now() - metrics.startTime;
        const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
        const minLatency = Math.min(...metrics.latencies);
        const maxLatency = Math.max(...metrics.latencies);
        
        console.log(`\n📊 Performance Report:`);
        console.log(`  Total time: ${totalTime}ms`);
        console.log(`  Avg latency: ${avgLatency.toFixed(0)}ms`);
        console.log(`  Min/Max: ${minLatency}ms / ${maxLatency}ms`);
        console.log(`  Messages sent: ${metrics.messagesSent}`);
        console.log(`  Messages received: ${metrics.messagesReceived}`);
        console.log(`  Throughput: ${(metrics.messagesSent / (totalTime / 1000)).toFixed(2)} msg/s`);
        
    } finally {
        await client.disconnect();
    }
}

// ============================================================================
// RUNNER
// ============================================================================

async function runAllExamples() {
    console.log('═'.repeat(60));
    console.log('HEADLESS TESTING - QUICK START EXAMPLES');
    console.log('═'.repeat(60));
    
    const examples = [
        { name: 'Single Message', fn: example1_singleMessage },
        { name: 'Sequential Messages', fn: example2_sequentialMessages },
        { name: 'Multi-User', fn: example3_multiUserTest },
        { name: 'Error Handling', fn: example4_errorHandling },
        { name: 'Multi-Provider', fn: example5_multiProviderTest },
        { name: 'Performance', fn: example6_performanceBaseline },
    ];
    
    for (const example of examples) {
        try {
            await example.fn();
        } catch (err) {
            console.error(`\n❌ Example failed: ${err.message}`);
        }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Examples complete!');
    console.log('═'.repeat(60));
}

// Run if executed directly
if (require.main === module) {
    runAllExamples().catch(console.error);
}

export {
    example1_singleMessage,
    example2_sequentialMessages,
    example3_multiUserTest,
    example4_errorHandling,
    example5_multiProviderTest,
    example6_performanceBaseline,
};
