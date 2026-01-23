// tests/cortex/1-infrastructure.test.ts
// Infrastructure tests - verify all components are connected

import { Redis } from 'ioredis';
import { neon } from '@neondatabase/serverless';
import axios from 'axios';
import { CONFIG } from '../../src/config';

describe('Cortex Infrastructure Tests', () => {
  let redis: Redis;
  let sql: any;

  beforeAll(async () => {
    redis = new Redis(CONFIG.REDIS_URL);
    sql = neon(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await redis.quit();
  });

  test('Redis connection works', async () => {
    const pong = await redis.ping();
    expect(pong).toBe('PONG');
  });

  test('PostgreSQL connection works', async () => {
    const result = await sql`SELECT 1 as test`;
    expect(result[0].test).toBe(1);
  });

  test('Nango API connection works', async () => {
    const response = await axios.get('https://api.nango.dev/connection', {
      headers: {
        'Authorization': `Bearer ${CONFIG.NANGO_SECRET_KEY}`,
      },
      validateStatus: () => true, // Accept any status for connection test
    });

    // Should get some response (even if no connections exist)
    expect(response.status).toBeLessThan(500);
  });

  test('Database table: connections exists', async () => {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'connections'
      ) as exists
    `;
    expect(result[0].exists).toBe(true);
  });

  test('Database table: units exists', async () => {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'units'
      ) as exists
    `;
    expect(result[0].exists).toBe(true);
  });

  test('Database table: runs exists', async () => {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'runs'
      ) as exists
    `;
    expect(result[0].exists).toBe(true);
  });

  test('Database table: run_steps exists', async () => {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'run_steps'
      ) as exists
    `;
    expect(result[0].exists).toBe(true);
  });

  test('Server health endpoint responds', async () => {
    const response = await axios.get('http://localhost:8080/health');
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('ok');
  });

  test('Groq API key is configured', () => {
    expect(CONFIG.GROQ_API_KEY).toBeDefined();
    expect(CONFIG.GROQ_API_KEY.length).toBeGreaterThan(10);
  });

  test('Nango secret key is configured', () => {
    expect(CONFIG.NANGO_SECRET_KEY).toBeDefined();
    expect(CONFIG.NANGO_SECRET_KEY.length).toBeGreaterThan(10);
  });
});
