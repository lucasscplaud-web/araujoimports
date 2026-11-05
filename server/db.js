import pg from 'pg';
import { createHash } from 'node:crypto';
import { orderRequestSchema, resolveCart, canonicalOrderPayload, ClientError } from './validation.js';
const { Pool } = pg;

export function createDatabasePool(env = process.env) {
  if (!env.DATABASE_URL) return null;
  const max = Number(env.DB_POOL_SIZE ?? 10);
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('DB_POOL_SIZE_INVALID');
  if (env.PG_SSL && !['true', 'false'].includes(env.PG_SSL)) throw new Error('PG_SSL_INVALID');
  let connectionString = env.DATABASE_URL;
  if (env.PG_SSL === 'true') {
    // pg parses URL options AFTER ssl config. Explicit verified TLS must also
    // override URL modes such as no-verify/disable and libpq compatibility.
    let url;
    try {
      url = new URL(connectionString);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
    } catch { throw new Error('DATABASE_URL_INVALID'); }
    url.searchParams.delete('ssl');
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.set('sslmode', 'verify-full');
    connectionString = url.toString();
  }
  const pool = new Pool({ connectionString, max,
    idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
    ssl: env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  return pool;
}
export const db = createDatabasePool();

export function isDatabaseUnavailableError(error) {
  return ['42P01', '42703', '3F000', 'DATABASE_SCHEMA_NOT_READY', 'DATABASE_NOT_CONFIGURED',
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03',
    '53300'].includes(error?.code) || /^08[A-Z0-9]{3}$/.test(error?.code || '');
}
function requireDatabase(pool) {
  if (!pool) throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_NOT_CONFIGURED' });
}
export async function checkInventory(cart, pool = db) {
  requireDatabase(pool);
  const result = await pool.query('SELECT sku, available_quantity FROM public.inventory WHERE sku = ANY($1::text[])',
    [cart.items.map(item => item.sku)]);
  const found = new Map(result.rows.map(row => [row.sku, row.available_quantity]));
  return cart.items.every(item => (found.get(item.sku) ?? 0) >= item.quantity);
}

// A request records interest only: no stock reservation, purchase or payment.
export async function insertOrderRequest({ id, idempotencyKey, contactName, email, cart: requestedCart }, pool = db) {
  requireDatabase(pool);
  // Rebuild every commercial field at the persistence boundary too: internal
  // callers cannot substitute SKU, names, prices, total or the payload hash.
  const input = orderRequestSchema.safeParse({ idempotencyKey, contactName, email,
    items: Array.isArray(requestedCart?.items) ? requestedCart.items.map(item => item && ({
      productId: item.productId, variantId: item.variantId, size: item.size, quantity: item.quantity })) : undefined });
  if (!input.success) throw new ClientError('DADOS_INVALIDOS');
  const cart = resolveCart(input.data.items);
  idempotencyKey = input.data.idempotencyKey.toLowerCase();
  const payloadHash = createHash('sha256').update(canonicalOrderPayload({
    items: cart.items, contactName: input.data.contactName, email: input.data.email
  })).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Same-key retries are serialized before inventory checks, even if stock
    // changed since the first request. Hash collisions only add contention.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [idempotencyKey]);
    const prior = await client.query('SELECT id, payload_hash FROM public.order_requests WHERE idempotency_key = $1', [idempotencyKey]);
    if (prior.rows.length) {
      await client.query('COMMIT');
      return { id: prior.rows[0].id, repeated: true, matching: prior.rows[0].payload_hash === payloadHash };
    }
    // One read for the cart. Stable ordering avoids deadlocks with inventory
    // updates; SHARE locks keep quantities stable until this transaction ends.
    const stock = await client.query(`SELECT sku, available_quantity FROM public.inventory
      WHERE sku = ANY($1::text[]) ORDER BY sku FOR SHARE`, [cart.items.map(item => item.sku)]);
    const available = new Map(stock.rows.map(row => [row.sku, row.available_quantity]));
    if (cart.items.some(item => (available.get(item.sku) ?? 0) < item.quantity)) {
      await client.query('ROLLBACK');
      return { unavailable: true };
    }
    await client.query(`INSERT INTO public.order_requests
      (id, idempotency_key, payload_hash, contact_name, email, total_cents, currency)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, idempotencyKey, payloadHash, input.data.contactName, input.data.email, cart.totalCents, cart.currency]);
    await client.query(`INSERT INTO public.order_request_items
      (order_id, product_id, variant_id, product_name, variant_name, size_label, quantity, unit_price_cents)
      SELECT $1::uuid, * FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::integer[], $8::bigint[])`,
    [id, cart.items.map(i => i.productId), cart.items.map(i => i.variantId), cart.items.map(i => i.name),
      cart.items.map(i => i.variantName), cart.items.map(i => i.size), cart.items.map(i => i.quantity),
      cart.items.map(i => i.unitPriceCents)]);
    await client.query('COMMIT');
    return { id, repeated: false, matching: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function seedInventory(products, pool = db) {
  requireDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const product of products) {
      for (const variant of product.variants) {
        for (const size of product.sizes) {
          const result = await client.query(`INSERT INTO public.inventory
            (sku, product_id, variant_id, size_label, available_quantity)
            VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO NOTHING`,
          [`${product.id}:${variant.id}:${size}`, product.id, variant.id, size, variant.stockPerSize]);
          inserted += result.rowCount;
        }
      }
    }
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
