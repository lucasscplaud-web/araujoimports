import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { serve } from './helpers/http.js';
import { runMigrations } from '../server/migrations.js';
import { seedInventory } from '../server/db.js';
import { catalog } from '../server/catalog.js';

test('HTTP → PostgreSQL: schema ausente, migração, pedido atômico e reenvio idempotente', async t => {
  const engine = new PGlite();
  await engine.waitReady;
  t.after(() => engine.close());
  const pool = { async query(sql, parameters) {
    const result = parameters ? await engine.query(sql, parameters) : (await engine.exec(sql)).at(-1);
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  }, async connect() { return { query: pool.query.bind(pool), release() {} }; } };
  const api = await serve(t, { database: pool });
  const items = [
    { productId: 'arc-runner', variantId: 'air-max-black', size: '40', quantity: 1 },
    { productId: 'arc-runner', variantId: 'air-max-white', size: '41', quantity: 2 }
  ];
  const payload = { items, contactName: 'Maria Araújo', email: 'maria@example.com',
    idempotencyKey: 'a1283fc0-e1b6-4b29-98ea-01efb1628898' };
  const missing = await api.post('/api/order-requests', payload);
  assert.equal(missing.status, 503);
  assert.equal(JSON.parse(api.logs[0]).code, '42P01');
  await runMigrations(pool);
  // Migrations must never invent inventory: before explicit local seed, no stock.
  const noStock = await api.post('/api/order-requests', payload);
  assert.equal(noStock.status, 409);
  await seedInventory(catalog.products, pool);
  const quote = await api.post('/api/checkout/quote', { items });
  assert.equal(quote.body.totalCents, 154970);
  const placed = await api.post('/api/order-requests', payload);
  assert.equal(placed.status, 201);
  const repeated = await api.post('/api/order-requests', payload);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.requestId, placed.body.requestId);
  const changed = await api.post('/api/order-requests', { ...payload, email: 'outro@example.com' });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error, 'CHAVE_IDEMPOTENCIA_REUTILIZADA');
  const saved = (await pool.query('SELECT total_cents, status FROM public.order_requests')).rows;
  assert.equal(saved.length, 1);
  assert.equal(Number(saved[0].total_cents), 154970);
  assert.equal(saved[0].status, 'REQUESTED');
  assert.equal((await pool.query('SELECT quantity FROM public.order_request_items')).rows.length, 2);
});
