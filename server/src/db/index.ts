import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

// ── PostgreSQL connection pool ──
const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.maxConnections,
  application_name: 'agenthub-server',
});

// ── Ensure UTF-8 client encoding on every new connection ──
pool.on('connect', async (client) => {
  try {
    await client.query("SET client_encoding = 'UTF8'");
  } catch (err) {
    console.warn('[DB] Failed to set client_encoding:', err);
  }
});

// ── Drizzle ORM instance ──
export const db = drizzle(pool, { schema });

// ── Re-export schema for convenience ──
export * from './schema.js';

// ── Load custom agents from DB (called at startup) ──
export async function loadCustomAgents(): Promise<Array<{
  id: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  vendor: string;
  capabilities: string[];
  tagline: string;
  systemPrompt: string;
  isCustom: boolean;
  online: boolean;
}>> {
  try {
    const rows = await db.select().from(schema.agents).where(
      // Only load custom agents; built-in agents are hardcoded
      eq(schema.agents.isCustom, true)
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      avatarEmoji: r.avatarEmoji ?? '🤖',
      avatarColor: r.avatarColor ?? 'bg-gray-500',
      vendor: r.vendor ?? 'custom',
      capabilities: r.capabilities ?? [],
      tagline: r.tagline ?? '',
      systemPrompt: r.systemPrompt ?? '',
      isCustom: r.isCustom ?? true,
      online: true,
    }));
  } catch (err) {
    console.warn('[DB] Failed to load custom agents (table may not exist yet — run drizzle-kit push):', err);
    return [];
  }
}

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
