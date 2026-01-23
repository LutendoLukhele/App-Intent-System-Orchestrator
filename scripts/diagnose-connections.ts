// Check table structure and try update with transaction
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || '');

async function diagnoseAndFix() {
  try {
    console.log('🔍 Diagnosing table structure...\n');
    
    // Check table schema with proper SQL template
    const schema = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'connections'
      ORDER BY ordinal_position
    `;
    
    console.log('📋 connections table schema:');
    (schema as any[]).forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Check actual data
    console.log('\n📊 Current data in connections table:');
    const data = await sql`SELECT * FROM connections LIMIT 1`;
    if ((data as any[]).length > 0) {
      console.log('   First row keys:', Object.keys((data as any[])[0]));
      console.log('   Provider value:', (data as any[])[0].provider);
    }
    
    // Try direct UPDATE using proper SQL
    console.log('\n⏳ Attempting UPDATE...');
    
    const updateResult = await sql`
      UPDATE connections 
      SET provider = ${'google-mail-ynxw'}
      WHERE provider IN (${'google-mail'}, ${'gmail'})
    `;
    
    // Verify
    const after = await sql`SELECT DISTINCT provider FROM connections`;
    console.log('✅ After update, providers are:', (after as any[]).map(r => r.provider).join(', '));
    
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    console.error('Full error:', err);
  }
}

diagnoseAndFix();
