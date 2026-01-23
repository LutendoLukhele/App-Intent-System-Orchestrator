const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function checkProviders() {
  try {
    const providers = await sql`
      SELECT DISTINCT provider, COUNT(*) as count
      FROM connections
      GROUP BY provider
      ORDER BY provider
    `;
    
    console.log('Current providers in database:');
    providers.forEach(p => {
      console.log(`  - ${p.provider}: ${p.count} connection(s)`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkProviders();
