import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sqlClient = neon(process.env.DATABASE_URL);
export const db = drizzle(sqlClient);

export async function healthCheck() {
  try {
    const result = await sqlClient`SELECT 1 AS ok, now() AS timestamp`;
    return { ok: true, timestamp: result[0]?.timestamp };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
