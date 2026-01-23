#!/usr/bin/env npx ts-node

import { NangoService } from '../src/services/NangoService';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const nangoService = new NangoService();
  const testConnectionId = process.env.TEST_CONNECTION_ID || '8716bc9a-694a-4891-98dc-61fcadd7cde4';

  console.log('🔍 Nango Connection Debugger\n');

  // 1. List all connections
  console.log('📋 Listing all connections...');
  const connections = await nangoService.listConnections();

  if (connections.length === 0) {
    console.log('❌ No connections found in Nango');
    console.log('\n💡 Next steps:');
    console.log('1. Go to Nango dashboard');
    console.log('2. Connect a provider (Gmail, Salesforce, etc.)');
    console.log('3. Run this script again');
    return;
  }

  console.log(`✅ Found ${connections.length} connection(s):\n`);
  connections.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.id} (${c.provider})`);
  });

  // 2. Validate test connection
  console.log(`\n🔍 Validating TEST_CONNECTION_ID: ${testConnectionId}\n`);

  const { valid, error } = await nangoService.validateConnection(
    'google-mail',
    testConnectionId
  );

  if (valid) {
    console.log('✅ Connection is valid!\n');

    // 3. Try fetching from cache
    console.log('📦 Testing cache fetch...');
    try {
      const result = await nangoService.fetchFromCache(
        'google-mail',
        testConnectionId,
        'GmailEmail',
        { limit: 1 }
      );

      console.log(`✅ Cache fetch successful!`);
      console.log(`   Records: ${result.records.length}`);

      if (result.records.length > 0) {
        console.log('   Sample:', JSON.stringify(result.records[0], null, 2));
      }
    } catch (err: any) {
      console.log(`❌ Cache fetch failed: ${err.message}`);
    }
  } else {
    console.log(`❌ Connection is invalid: ${error}\n`);
    console.log('💡 Suggested fix:');
    console.log(`   Update .env with one of the valid connections above:`);
    console.log(`   TEST_CONNECTION_ID=${connections[0]?.id}`);
  }
}

main().catch(console.error);
