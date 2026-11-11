import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../database/schema.sql');

export function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
}

export async function migrate(pool) {
  await pool.query(await fs.readFile(schemaPath, 'utf8'));
}
