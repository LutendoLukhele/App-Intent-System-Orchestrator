// scripts/fix-gmail-connection.ts
// Fix the Gmail connection ID for the specific user

import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_DZ9VLGrHc7jf@ep-hidden-field-advbvi8f-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require');

const USER_ID = '7CSWY89B4sT7nj3ixd9mvgcJPSm2';
const CORRECT_CONNECTION_ID = 'bb40121a-ebaf-4739-b56f-9da1f4e936d3';
const PROVIDER = 'google-mail-ynxw';

async function fixGmailConnection() {
  console.log('🔧 Fixing Gmail connection...\n');

  // Check current state
  const before = await sql`
    SELECT connection_id, provider, user_id 
    FROM connections 
    WHERE user_id = ${USER_ID} AND provider = ${PROVIDER}
  `;

  console.log('Current state:');
  console.log(before);

  if (before.length === 0) {
    console.log('❌ No connection found for this user/provider');
    return;
  }

  // Update the connection ID
  const result = await sql`
    UPDATE connections 
    SET connection_id = ${CORRECT_CONNECTION_ID}
    WHERE user_id = ${USER_ID} AND provider = ${PROVIDER}
    RETURNING *
  `;

  console.log('\n✅ Updated connection:');
  console.log(result);

  // Verify
  const after = await sql`
    SELECT connection_id, provider, user_id 
    FROM connections 
    WHERE user_id = ${USER_ID} AND provider = ${PROVIDER}
  `;

  console.log('\nNew state:');
  console.log(after);

  if (after[0]?.connection_id === CORRECT_CONNECTION_ID) {
    console.log('\n✅ Connection ID successfully updated!');
  } else {
    console.log('\n❌ Update verification failed');
  }
}

fixGmailConnection()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
