import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { loadMigrations, runMigrations, assertDatabaseReady } from '../server/migrations.js';
import { checkInventory, insertOrderRequest, seedInventory, createDatabasePool } from '../server/db.js';
import { resolveCart } from '../server/validation.js';
import { catalog } from '../server/catalog.js';

// PGlite executes PostgreSQL SQL locally in WASM. It is not a network/pool or
// multiconnection concurrency test; production advisory lock contention needs PG.
async function database(t) {
  const engine = new PGlite();
  await engine.waitReady;
  const pool = {
    async query(sql, parameters) {
      const result = parameters ? await engine.query(sql, parameters) : (await engine.exec(sql)).at(-1);
      return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
    },
    async connect() { return { query: pool.query.bind(pool), release() {} }; }
  };
  t.after(() => engine.close());
  return { engine, pool };
}
const line = { productId: 'arc-runner', variantId: 'air-max-white', size: '40', quantity: 2 };
const request = (overrides = {}) => ({ id: randomUUID(), idempotencyKey: randomUUID(),
  contactName: 'Maria Araújo', email: 'maria@example.com', cart: resolveCart([line]), ...overrides });

test('fresh database reproduces 42P01; explicit migrations fix it and are idempotent', async t => {
  const { pool } = await database(t);
  await assert.rejects(assertDatabaseReady(pool), { code: '42P01' });
  assert.deepEqual(await runMigrations(pool), ['001_initial', '002_integrity']);
  assert.equal(await assertDatabaseReady(pool), true);
  assert.deepEqual(await runMigrations(pool), []);
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM public.inventory')).rows[0].n), 0);
  const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
  assert.ok(indexes.rows.some(i => i.indexname === 'order_request_items_order_idx'));
});

test('migrations adopt a legacy schema without changing existing stock; checksums detect edits', async t => {
  const { pool, engine } = await database(t);
  const migrations = await loadMigrations();
  await engine.exec(migrations[0].sql);
  await pool.query(`INSERT INTO public.inventory (sku, product_id, variant_id, size_label, available_quantity)
    VALUES ($1,$2,$3,$4,$5)`, ['arc-runner:air-max-white:40', 'arc-runner', 'air-max-white', '40', 3]);
  await runMigrations(pool);
  assert.equal((await pool.query('SELECT available_quantity FROM public.inventory')).rows[0].available_quantity, 3);
  await assert.rejects(runMigrations(pool, migrations.map(m => ({ ...m, checksum: '0'.repeat(64) }))),
    { code: 'MIGRATION_CHECKSUM_MISMATCH' });
  assert.equal(await assertDatabaseReady(pool), true);
});

test('invalid legacy data aborts all migration changes and keeps original records', async t => {
  const { pool, engine } = await database(t);
  const migrations = await loadMigrations();
  await engine.exec(migrations[0].sql);
  await pool.query(`INSERT INTO public.inventory (sku, product_id, variant_id, size_label, available_quantity)
    VALUES ($1,$2,$3,$4,$5)`, ['legacy-sku', 'arc-runner', 'air-max-white', '40', 3]);
  await assert.rejects(runMigrations(pool), { code: '23514' });
  assert.equal((await pool.query('SELECT available_quantity FROM public.inventory')).rows[0].available_quantity, 3);
  assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
});

test('missing tables remain detectable even if the migration ledger exists', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  await pool.query('DROP TABLE public.order_request_items');
  await assert.rejects(assertDatabaseReady(pool), { code: '42P01' });
});

test('migration checksums are independent of checkout CRLF line endings', async () => {
  for (const migration of await loadMigrations()) {
    assert.equal(migration.sql.includes('\r\n'), false);
    const windowsCheckout = migration.sql.replaceAll('\n', '\r\n');
    const normalizedChecksum = createHash('sha256').update(windowsCheckout.replace(/\r\n/g, '\n')).digest('hex');
    assert.equal(migration.checksum, normalizedChecksum);
  }
});

test('legacy adoption refuses missing or weakened core integrity contracts and rolls back', async t => {
  const scenarios = {
    'missing parent FK': 'ALTER TABLE public.order_request_items DROP CONSTRAINT order_request_items_order_id_fkey',
    'missing primary key': 'ALTER TABLE public.order_request_items DROP CONSTRAINT order_request_items_pkey',
    'missing idempotency uniqueness': 'ALTER TABLE public.order_requests DROP CONSTRAINT order_requests_idempotency_key_key',
    'nullable identity column': 'ALTER TABLE public.inventory ALTER COLUMN variant_id DROP NOT NULL',
    'incompatible commercial type': 'ALTER TABLE public.order_requests ALTER COLUMN total_cents TYPE numeric',
    'missing stock bound': 'ALTER TABLE public.inventory DROP CONSTRAINT inventory_available_quantity_check',
    'same-name weakened check': `ALTER TABLE public.order_request_items DROP CONSTRAINT order_request_items_quantity_check;
      ALTER TABLE public.order_request_items ADD CONSTRAINT order_request_items_quantity_check CHECK (true)`,
    'missing serial default': 'ALTER TABLE public.order_request_items ALTER COLUMN id DROP DEFAULT',
    'same-name wrong index': `DROP INDEX public.order_requests_created_idx;
      CREATE INDEX order_requests_created_idx ON public.order_requests(email)`
  };
  for (const [name, alter] of Object.entries(scenarios)) {
    await t.test(name, async t => {
      const { pool, engine } = await database(t);
      await engine.exec((await loadMigrations())[0].sql);
      await pool.query(`INSERT INTO public.inventory (sku, product_id, variant_id, size_label, available_quantity)
        VALUES ($1,$2,$3,$4,$5)`, ['arc-runner:air-max-white:40', 'arc-runner', 'air-max-white', '40', 3]);
      await engine.exec(alter);
      await assert.rejects(runMigrations(pool), { code: 'DATABASE_SCHEMA_NOT_READY' });
      assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
      assert.equal((await pool.query('SELECT available_quantity FROM public.inventory')).rows[0].available_quantity, 3);
    });
  }
});

test('readiness detects deleted FK even with a complete migration ledger; renamed constraints remain valid', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  await pool.query('ALTER TABLE public.order_request_items RENAME CONSTRAINT order_request_items_quantity_check TO custom_quantity_check');
  assert.equal(await assertDatabaseReady(pool), true);
  await pool.query('ALTER TABLE public.order_request_items DROP CONSTRAINT order_request_items_order_id_fkey');
  await assert.rejects(assertDatabaseReady(pool), { code: 'DATABASE_SCHEMA_NOT_READY' });
});

test('inventory seed is transactional, idempotent and never overwrites existing stock', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  const inserted = await seedInventory(catalog.products, pool);
  assert.ok(inserted > 0);
  await pool.query('UPDATE public.inventory SET available_quantity = 1 WHERE sku = $1', ['arc-runner:air-max-white:40']);
  assert.equal(await seedInventory(catalog.products, pool), 0);
  assert.equal(await checkInventory(resolveCart([line]), pool), false);
  assert.equal(await checkInventory(resolveCart([{ ...line, quantity: 1 }]), pool), true);
  const invalid = [{ ...catalog.products[0], id: 'invalid-product', variants: [
    { ...catalog.products[0].variants[0], stockPerSize: -1 }
  ] }];
  await assert.rejects(seedInventory(invalid, pool), { code: '23514' });
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM public.inventory WHERE product_id = $1', ['invalid-product'])).rows[0].n), 0);
});

test('preorder persists authoritative variation prices and contact, never browser totals or stock changes', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  await seedInventory(catalog.products, pool);
  const candidate = request({ email: 'MARIA@EXAMPLE.COM' });
  candidate.cart.totalCents = 1;
  candidate.cart.items[0].sku = 'forged:sku';
  candidate.cart.items[0].unitPriceCents = 1;
  candidate.payloadHash = 'forged';
  assert.deepEqual(await insertOrderRequest(candidate, pool), { id: candidate.id, repeated: false, matching: true });
  const saved = (await pool.query('SELECT * FROM public.order_requests')).rows[0];
  assert.equal(Number(saved.total_cents), 105980);
  assert.equal(saved.email, 'maria@example.com');
  assert.equal(saved.status, 'REQUESTED');
  const items = (await pool.query('SELECT * FROM public.order_request_items')).rows;
  assert.equal(items.length, 1);
  assert.equal(Number(items[0].unit_price_cents), 52990);
  assert.equal(items[0].quantity, 2);
  const available = (await pool.query('SELECT available_quantity FROM public.inventory WHERE sku = $1', ['arc-runner:air-max-white:40'])).rows[0].available_quantity;
  assert.equal(available, 10);
});

test('idempotent retries precede stock checks; changed contact and quantities conflict', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  await seedInventory(catalog.products, pool);
  const candidate = request();
  await insertOrderRequest(candidate, pool);
  await pool.query('UPDATE public.inventory SET available_quantity = 0');
  assert.deepEqual(await insertOrderRequest({ ...candidate, id: randomUUID(), idempotencyKey: candidate.idempotencyKey.toUpperCase() }, pool),
    { id: candidate.id, repeated: true, matching: true });
  assert.equal((await insertOrderRequest({ ...candidate, email: 'other@example.com' }, pool)).matching, false);
  assert.equal((await insertOrderRequest({ ...candidate, cart: resolveCart([{ ...line, quantity: 1 }]) }, pool)).matching, false);
  assert.deepEqual(await insertOrderRequest(request(), pool), { unavailable: true });
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM public.order_requests')).rows[0].n), 1);
});

test('order header and lines roll back together if line persistence fails', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  await seedInventory(catalog.products, pool);
  const candidate = request();
  const failingPool = { async connect() {
    const client = await pool.connect();
    return { ...client, async query(sql, params) {
      if (sql.startsWith('INSERT INTO public.order_request_items')) throw Object.assign(new Error('test failure'), { code: 'TEST' });
      return client.query(sql, params);
    } };
  } };
  await assert.rejects(insertOrderRequest(candidate, failingPool), { code: 'TEST' });
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM public.order_requests')).rows[0].n), 0);
  assert.equal((await insertOrderRequest(candidate, pool)).matching, true);
});

test('FK and commercial constraints reject orphan lines, negative stock and duplicate lines', async t => {
  const { pool } = await database(t);
  await runMigrations(pool);
  await seedInventory(catalog.products, pool);
  await assert.rejects(pool.query('UPDATE public.inventory SET available_quantity = -1'), { code: '23514' });
  await assert.rejects(pool.query(`INSERT INTO public.order_request_items
    (order_id, product_id, variant_id, product_name, variant_name, size_label, quantity, unit_price_cents)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), 'arc-runner', 'air-max-white', 'AIR MAX PLUS', 'Branco', '40', 1, 52990]), { code: '23503' });
  const candidate = request();
  await insertOrderRequest(candidate, pool);
  await assert.rejects(pool.query(`INSERT INTO public.order_request_items
    (order_id, product_id, variant_id, product_name, variant_name, size_label, quantity, unit_price_cents)
    SELECT order_id, product_id, variant_id, product_name, variant_name, size_label, quantity, unit_price_cents
    FROM public.order_request_items`), { code: '23505' });
  await pool.query('DELETE FROM public.order_requests WHERE id = $1', [candidate.id]);
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM public.order_request_items')).rows[0].n), 0);
});

test('pool rejects unsafe/invalid configuration before connecting', () => {
  assert.equal(createDatabasePool({}), null);
  assert.throws(() => createDatabasePool({ DATABASE_URL: 'postgres://invalid', DB_POOL_SIZE: 'NaN' }), /DB_POOL_SIZE_INVALID/);
  assert.throws(() => createDatabasePool({ DATABASE_URL: 'postgres://invalid', PG_SSL: 'insecure' }), /PG_SSL_INVALID/);
});

test('explicit verified TLS cannot be disabled by DATABASE_URL options', async () => {
  for (const query of ['sslmode=no-verify', 'sslmode=disable', 'ssl=0', 'ssl=no-verify',
    'uselibpqcompat=true&sslmode=require']) {
    const pool = createDatabasePool({ DATABASE_URL: `postgres://local-user:local-pass@localhost/local-db?${query}`, PG_SSL: 'true' });
    const client = new pool.Client(pool.options);
    assert.ok(client.connectionParameters.ssl);
    assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized, false);
    assert.equal(client.connectionParameters.ssl.checkServerIdentity, undefined);
    await pool.end();
  }
});
