// scripts/update-connection.ts
// Update the connection ID to the working one

import { neon } from '@neondatabase/serverless';
import Redis from 'ioredis';

const sql = neon('postgresql://neondb_owner:npg_DZ9VLGrHc7jf@ep-hidden-field-advbvi8f-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require');
const redis = new Redis('redis://default:ewgkpSkF91VxHqMdZJ5mqHRpqaOut6jB@redis-15785.c276.us-east-1-2.ec2.redns.redis-cloud.com:15785');

const USER_ID = '7CSWY89B4sT7nj3ixd9mvgcJPSm2';
const OLD_CONNECTION_ID = 'bb40121a-ebaf-4739-b56f-9da1f4e936d3';
const NEW_CONNECTION_ID = '285ed357-8b82-41a9-aae1-bd0d84fe7e3a';
const PROVIDER = 'google-mail-ynxw';

async function updateConnection() {
  console.log('🔧 Updating Gmail connection to working one...\n');

  // 1. Check current database state
  console.log('📊 Current database state:');
  const before = await sql`
    SELECT user_id, provider, connection_id, enabled, created_at, last_poll_at 
    FROM connections 
    WHERE user_id = ${USER_ID} AND provider = ${PROVIDER}
  `;
  console.log(before);

  // 2. Check Redis state
  console.log('\n🔍 Current Redis state:');
  const activeConn = await redis.get(`active-connection:${USER_ID}`);
  console.log('Active connection:', activeConn);
  const oldOwner = await redis.get(`connection-owner:${OLD_CONNECTION_ID}`);
  console.log(`Owner of ${OLD_CONNECTION_ID}:`, oldOwner);
  const newOwner = await redis.get(`connection-owner:${NEW_CONNECTION_ID}`);
  console.log(`Owner of ${NEW_CONNECTION_ID}:`, newOwner);

  // 3. Update database with new connection ID
  console.log('\n✏️ Updating database...');
  const result = await sql`
    UPDATE connections 
    SET 
      connection_id = ${NEW_CONNECTION_ID},
      enabled = true,
      error_count = 0,
      last_poll_at = NOW()
    WHERE user_id = ${USER_ID} AND provider = ${PROVIDER}
    RETURNING *
  `;
  console.log('✅ Updated:', result);

  // 4. Update Redis caches
  console.log('\n🔄 Updating Redis caches...');
  
  // Set active connection to new one
  await redis.set(`active-connection:${USER_ID}`, NEW_CONNECTION_ID);
  console.log('✅ Set active-connection');
  
  // Set connection owner
  await redis.setex(`connection-owner:${NEW_CONNECTION_ID}`, 3600, USER_ID);
  console.log('✅ Set connection-owner');
  
  // Delete old connection owner cache
  await redis.del(`connection-owner:${OLD_CONNECTION_ID}`);
  console.log('✅ Deleted old connection-owner cache');

  // Invalidate user's tool cache
  const toolCacheKeys = await redis.keys(`user-tools:${USER_ID}*`);
  if (toolCacheKeys.length > 0) {
    await redis.del(...toolCacheKeys);
    console.log(`✅ Invalidated ${toolCacheKeys.length} tool cache keys`);
  }

  // 5. Verify final state
  console.log('\n✅ Final state:');
  const after = await sql`
    SELECT user_id, provider, connection_id, enabled, created_at, last_poll_at 
    FROM connections 
    WHERE user_id = ${USER_ID} AND provider = ${PROVIDER}
  `;
  console.log('Database:', after);

  const newActiveConn = await redis.get(`active-connection:${USER_ID}`);
  console.log('Redis active-connection:', newActiveConn);

  console.log('\n🎉 Connection updated successfully!');
  console.log(`   Old (expired): ${OLD_CONNECTION_ID}`);
  console.log(`   New (working): ${NEW_CONNECTION_ID}`);

  await redis.quit();
}

updateConnection().catch(console.error);
