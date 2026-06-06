import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

// ── PostgreSQL connection pool ──
const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.maxConnections,
});

// ── Drizzle ORM instance ──
export const db = drizzle(pool, { schema });

// ── Re-export schema for convenience ──
export * from './schema.js';

// ── Health check ──
export async function dbHealthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ── Graceful shutdown ──
export async function closeDb(): Promise<void> {
  await pool.end();
}
