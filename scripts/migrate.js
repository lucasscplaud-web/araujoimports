import 'dotenv/config';
import { db } from '../server/db.js';
import { runMigrations, assertDatabaseReady } from '../server/migrations.js';
try {
  if (!db) throw Object.assign(new Error('DATABASE_URL not configured'), { code: 'DATABASE_NOT_CONFIGURED' });
  const applied = await runMigrations(db);
  await assertDatabaseReady(db);
  console.info(JSON.stringify({ event: 'database_migrated', applied }));
} catch (error) {
  console.error(JSON.stringify({ event: 'database_migration_failed', code: error.code || 'INTERNAL' }));
  process.exitCode = 1;
} finally { await db?.end(); }
