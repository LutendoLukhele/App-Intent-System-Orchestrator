#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  const migrationPath = path.join(__dirname, '../migrations/001_cortex.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  try {
    console.log('Running migration: 001_cortex.sql...\n');
    
    // Split into individual statements more carefully
    const lines = migrationSql.split('\n');
    const statements = [];
    let currentStatement = '';
    let inDollarQuote = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip pure comment or empty lines ONLY when not in dollar quotes
      if (!inDollarQuote && (!trimmed || trimmed.startsWith('--'))) {
        continue;
      }
      
      currentStatement += line + '\n';
      
      // Check for dollar quote delimiters
      if (trimmed.includes('$$')) {
        inDollarQuote = !inDollarQuote;
      }
      
      // End of statement if line ends with ; and we're not in dollar quotes
      if (!inDollarQuote && line.trimEnd().endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt && !stmt.startsWith('--')) {
          statements.push(stmt);
        }
        currentStatement = '';
      }
    }
    
    // Handle any remaining statement
    if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
      statements.push(currentStatement.trim());
    }

    console.log(`Found ${statements.length} statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 70).replace(/\n/g, ' ') + '...';
      console.log(`[${i + 1}/${statements.length}] ${preview}`);
      
      try {
        // Use raw string execution without tagged template
        const result = await sql.query(statement);
        console.log(`    ✅ Success\n`);
      } catch (error) {
        console.error(`    ❌ Failed: ${error.message}\n`);
        throw error;
      }
    }
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    process.exit(1);
  }
}

runMigration();
