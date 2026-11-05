import 'dotenv/config';
import { catalog } from '../server/catalog.js';
import { db, seedInventory } from '../server/db.js';
import { assertDatabaseReady } from '../server/migrations.js';
try {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw Object.assign(new Error('Explicit production seed authorization required'), { code: 'PRODUCTION_SEED_DISABLED' });
  }
  await assertDatabaseReady(db);
  const inserted = await seedInventory(catalog.products, db);
  console.info(JSON.stringify({ event: 'inventory_seeded', inserted, existingStockPreserved: true }));
} catch (error) {
  console.error(JSON.stringify({ event: 'inventory_seed_failed', code: error.code || 'INTERNAL' }));
  process.exitCode = 1;
} finally { await db?.end(); }
