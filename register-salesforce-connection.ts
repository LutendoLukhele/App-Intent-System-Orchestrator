#!/usr/bin/env ts-node
/**
 * Register Salesforce Connection Manually
 * Creates the connection record in the database for the Salesforce webhook
 */

import { neon } from '@neondatabase/serverless';
require('dotenv').config();

async function registerSalesforceConnection() {
  const sql = neon(process.env.DATABASE_URL || '');

  const CONNECTION_ID = '8f1ee968-0251-41bc-85dc-38a841ef3a03';
  const USER_ID = '7CSWY89B4sT7nj3ixd9mvgcJPSm2';
  const PROVIDER = 'salesforce-ybzg';

  try {
    console.log('🔧 Registering Salesforce connection...\n');

    const result = await sql`
      INSERT INTO connections (user_id, provider, connection_id, enabled)
      VALUES (${USER_ID}, ${PROVIDER}, ${CONNECTION_ID}, true)
      ON CONFLICT (user_id, provider) DO UPDATE SET
        connection_id = EXCLUDED.connection_id,
        enabled = true,
        error_count = 0,
        last_poll_at = NOW()
      RETURNING id, user_id, provider, connection_id, enabled
    `;

    console.log('✅ Connection registered successfully:');
    console.log(`   ID: ${result[0].id}`);
    console.log(`   User: ${result[0].user_id}`);
    console.log(`   Provider: ${result[0].provider}`);
    console.log(`   Connection ID: ${result[0].connection_id}`);
    console.log(`   Enabled: ${result[0].enabled}`);

    // Verify the connection
    console.log('\n📊 Verifying connection...');
    const connections = await sql`
      SELECT DISTINCT provider, COUNT(*) as count
      FROM connections
      GROUP BY provider
      ORDER BY provider
    `;

    console.log('Current connections:');
    connections.forEach((conn: any) => {
      console.log(`   - ${conn.provider}: ${conn.count} connection(s)`);
    });

    console.log('\n✅ Salesforce connection registered!');
    console.log('\n📌 Next steps:');
    console.log('   1. Restart the server: npm run dev');
    console.log('   2. Refresh the UI');
    console.log('   3. Salesforce tools should now be available');
    console.log('   4. Try: "Find all accounts with Tech in the name"');

    process.exit(0);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', errorMsg);
    process.exit(1);
  }
}

registerSalesforceConnection();
