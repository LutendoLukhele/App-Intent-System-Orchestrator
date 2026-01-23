// Test direct Nango API call
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY;
const CONNECTION_ID = '8f1ee968-0251-41bc-85dc-38a841ef3a03';
const PROVIDER = 'salesforce-ybzg';

async function testFetch() {
    console.log('\n🧪 Testing Nango fetch with different parameters...\n');

    // Test 1: No filters (should return all)
    console.log('Test 1: Fetch all leads (no filters)');
    try {
        const response1 = await axios.get('https://api.nango.dev/records', {
            headers: {
                'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
                'Provider-Config-Key': PROVIDER,
                'Connection-Id': CONNECTION_ID,
            },
            params: {
                model: 'SalesforceLead',
                limit: 5,
            },
        });
        console.log(`✅ Returned ${response1.data.records.length} records`);
        if (response1.data.records.length > 0) {
            console.log('Sample fields:', Object.keys(response1.data.records[0]).slice(0, 10));
        }
    } catch (error: any) {
        console.error('❌ Failed:', error.response?.data || error.message);
    }

    // Test 2: With delta cursor (as our code does)
    console.log('\nTest 2: Fetch with delta cursor (like our tool does)');
    try {
        const response2 = await axios.get('https://api.nango.dev/records', {
            headers: {
                'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
                'Provider-Config-Key': PROVIDER,
                'Connection-Id': CONNECTION_ID,
            },
            params: {
                model: 'SalesforceLead',
                limit: 100,
                delta: '', // Empty delta to get all
            },
        });
        console.log(`✅ Returned ${response2.data.records.length} records`);
    } catch (error: any) {
        console.error('❌ Failed:', error.response?.data || error.message);
    }

    // Test 3: Check what happens with invalid field filter
    console.log('\nTest 3: Attempt filter with field selection (if Nango supports it)');
    try {
        const response3 = await axios.get('https://api.nango.dev/records', {
            headers: {
                'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
                'Provider-Config-Key': PROVIDER,
                'Connection-Id': CONNECTION_ID,
            },
            params: {
                model: 'SalesforceLead',
                limit: 5,
                fields: 'Id,Name,Email', // This might cause issues
            },
        });
        console.log(`✅ Returned ${response3.data.records.length} records`);
    } catch (error: any) {
        console.error('❌ Failed:', error.response?.data || error.message);
    }
}

testFetch().catch(console.error);
