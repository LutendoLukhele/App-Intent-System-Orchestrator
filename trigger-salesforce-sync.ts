// Trigger Salesforce sync to populate Nango cache
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY;
const CONNECTION_ID = '8f1ee968-0251-41bc-85dc-38a841ef3a03';
const PROVIDER = 'salesforce-ybzg';

async function checkSyncStatus() {
    try {
        console.log('\n🔍 Checking Salesforce sync status...');
        
        const response = await axios.get(
            `https://api.nango.dev/sync/status`,
            {
                headers: {
                    'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': PROVIDER,
                    'Connection-Id': CONNECTION_ID,
                },
            }
        );

        console.log('✅ Sync status:', JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error: any) {
        console.error('❌ Failed to check sync status:', error.response?.data || error.message);
        return null;
    }
}

async function triggerSync(syncName: string) {
    try {
        console.log(`\n🚀 Triggering sync: ${syncName}...`);
        
        const response = await axios.post(
            `https://api.nango.dev/sync/trigger`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': PROVIDER,
                    'Connection-Id': CONNECTION_ID,
                },
                params: {
                    sync_name: syncName,
                },
            }
        );

        console.log(`✅ Sync triggered: ${syncName}`);
        return response.data;
    } catch (error: any) {
        console.error(`❌ Failed to trigger sync ${syncName}:`, error.response?.data || error.message);
        return null;
    }
}

async function checkCache(model: string) {
    try {
        console.log(`\n📦 Checking cache for model: ${model}...`);
        
        const response = await axios.get(
            'https://api.nango.dev/records',
            {
                headers: {
                    'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
                    'Provider-Config-Key': PROVIDER,
                    'Connection-Id': CONNECTION_ID,
                },
                params: {
                    model,
                    limit: 5,
                },
            }
        );

        const records = response.data.records || [];
        console.log(`✅ Cache has ${records.length} records for ${model}`);
        
        if (records.length > 0) {
            console.log('\nSample record:');
            console.log(JSON.stringify(records[0], null, 2));
        }
        
        return records;
    } catch (error: any) {
        console.error(`❌ Failed to check cache for ${model}:`, error.response?.data || error.message);
        return [];
    }
}

async function main() {
    console.log('🔧 Salesforce Sync Diagnostic Tool');
    console.log('==================================');
    console.log(`Connection ID: ${CONNECTION_ID}`);
    console.log(`Provider: ${PROVIDER}`);
    console.log('');

    // Step 1: Check sync status
    await checkSyncStatus();

    // Step 2: Check cache for SalesforceLead
    const cacheRecords = await checkCache('SalesforceLead');

    // Step 3: If cache is empty, trigger sync
    if (cacheRecords.length === 0) {
        console.log('\n⚠️  Cache is empty. Attempting to trigger sync...');
        
        // Try common Salesforce sync names
        const syncNames = ['salesforce-leads', 'leads', 'SalesforceLead'];
        
        for (const syncName of syncNames) {
            const result = await triggerSync(syncName);
            if (result) {
                console.log(`\n✅ Successfully triggered sync: ${syncName}`);
                console.log('⏳ Wait 30-60 seconds for sync to complete, then re-run this script');
                break;
            }
        }
    } else {
        console.log('\n✅ Cache has data! Tool should work now.');
    }
}

main().catch(console.error);
