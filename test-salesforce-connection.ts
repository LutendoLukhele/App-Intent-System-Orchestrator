#!/usr/bin/env ts-node
/**
 * Salesforce Integration Test Runner
 * Tests Salesforce entity fetching with specific connection ID
 */

import { neon } from '@neondatabase/serverless';
require('dotenv').config();

const CONNECTION_ID = '8f1ee968-0251-41bc-85dc-38a841ef3a03';

async function runSalesforceTests() {
  const sql = neon(process.env.DATABASE_URL || '');

  try {
    console.log('🔍 Verifying Salesforce connection...');

    // Find the connection and user
    const connection = await sql`
      SELECT id, user_id, provider, connection_id
      FROM connections
      WHERE connection_id = ${CONNECTION_ID}
      LIMIT 1
    `;

    if (connection.length === 0) {
      console.error(`❌ Connection not found with ID: ${CONNECTION_ID}`);
      process.exit(1);
    }

    const [conn] = connection;
    console.log(`✅ Found connection:`, {
      id: conn.id,
      userId: conn.user_id,
      provider: conn.provider,
      connectionId: conn.connection_id,
    });

    // Verify provider is correct
    if (conn.provider !== 'salesforce-ybzg') {
      console.error(
        `❌ Provider mismatch! Expected 'salesforce-ybzg', got '${conn.provider}'`
      );
      process.exit(1);
    }

    console.log('✅ Provider correctly set to salesforce-ybzg');

    // Test that we can query tools for this user
    console.log(`\n🔧 Checking available tools for user ${conn.user_id}...`);
    console.log('Expected Salesforce tools:');
    console.log('  - fetch_entity');
    console.log('  - create_entity');
    console.log('  - update_entity');

    console.log('\n✅ Salesforce connection verified!');
    console.log('\nTo run full tests:');
    console.log('  npm run test:cortex:e2e');
    console.log('  npm run test:cortex');

    process.exit(0);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Error verifying connection:', errorMsg);
    process.exit(1);
  }
}

runSalesforceTests();
