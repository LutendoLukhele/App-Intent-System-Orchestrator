// Direct provider key update script
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || '');

async function updateProviders() {
  try {
    console.log('🔄 Starting direct provider key update...\n');
    
    // First check current state
    const before = await sql`SELECT DISTINCT provider FROM connections ORDER BY provider`;
    console.log('📊 Current providers in database:');
    before.forEach(row => console.log(`   - ${row.provider}`));
    
    // Run UPDATE
    console.log('\n⏳ Updating google-mail and gmail to google-mail-ynxw...');
    
    // Neon doesn't return row count easily, so we do it in 2 steps
    const beforeCount = await sql`
      SELECT COUNT(*) as count 
      FROM connections 
      WHERE provider IN ('google-mail', 'gmail')
    `;
    
    console.log(`   Found ${beforeCount[0]?.count} connections to update`);
    
    await sql.unsafe(`
      UPDATE connections 
      SET provider = 'google-mail-ynxw'
      WHERE provider = 'google-mail' OR provider = 'gmail'
    `);
    
    // Check after
    console.log('\n✅ Update completed');
    const after = await sql`SELECT DISTINCT provider FROM connections ORDER BY provider`;
    console.log('📊 Providers after update:');
    after.forEach(row => console.log(`   - ${row.provider}`));
    
    // Verify migration
    console.log('\n🔍 Verification:');
    const connStats = await sql`
      SELECT provider, COUNT(*) as count
      FROM connections
      GROUP BY provider
      ORDER BY provider
    `;
    
    connStats.forEach(row => {
      console.log(`   ${row.provider}: ${row.count} connections`);
    });
    
    process.exit(0);
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

updateProviders();
