const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function fixSalesforceProvider() {
  try {
    console.log('🔧 Fixing Salesforce provider key...');
    
    // Update provider from 'salesforce' to 'salesforce-ybzg'
    const result = await sql`
      UPDATE connections 
      SET provider = 'salesforce-ybzg' 
      WHERE provider = 'salesforce'
      RETURNING id, provider, connection_id
    `;
    
    console.log(`✅ Updated ${result.length} connection(s)`);
    
    if (result.length > 0) {
      console.log('\nUpdated connections:');
      result.forEach(conn => {
        console.log(`  - ID: ${conn.id}, Provider: ${conn.provider}, Connection ID: ${conn.connection_id}`);
      });
    }
    
    // Verify the fix
    const verification = await sql`
      SELECT provider, COUNT(*) as count 
      FROM connections 
      WHERE provider LIKE 'salesforce%'
      GROUP BY provider
    `;
    
    console.log('\n✅ Verification:');
    verification.forEach(row => {
      console.log(`  - ${row.provider}: ${row.count} connection(s)`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixSalesforceProvider();
