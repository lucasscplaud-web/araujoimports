import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
const db = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  const sql = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  await db.query(sql);
  console.info('Schema criado/atualizado.');
} finally { await db.end(); }
