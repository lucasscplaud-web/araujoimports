import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
export const db = connectionString ? new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_SIZE ?? 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined
}) : null;

export async function checkInventory(cart) {
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  const skus = cart.items.map(item => item.sku);
  const result = await db.query('SELECT sku, available_quantity FROM inventory WHERE sku = ANY($1::text[])', [skus]);
  const found = new Map(result.rows.map(row => [row.sku, row.available_quantity]));
  return cart.items.every(item => (found.get(item.sku) ?? 0) >= item.quantity);
}

// Pré-pedido: registra a solicitação; NÃO é compra, reserva ou pagamento.
export async function insertOrderRequest({ id, idempotencyKey, payloadHash, contactName, email, cart }) {
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Lookup usando queries parametrizadas; nunca concatenar entradas externas ao SQL.
    const prior = await client.query(
      'SELECT id, payload_hash FROM order_requests WHERE idempotency_key = $1', [idempotencyKey]);
    if (prior.rows.length) {
      await client.query('COMMIT');
      return { id: prior.rows[0].id, repeated: true, matching: prior.rows[0].payload_hash === payloadHash };
    }

    for (const item of cart.items) {
      const stock = await client.query(
        'SELECT available_quantity FROM inventory WHERE sku = $1', [item.sku]);
      if (!stock.rows.length || stock.rows[0].available_quantity < item.quantity) {
        await client.query('ROLLBACK');
        return { unavailable: true };
      }
    }

    await client.query(`INSERT INTO order_requests
      (id, idempotency_key, payload_hash, contact_name, email, total_cents, currency)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, idempotencyKey, payloadHash, contactName, email, cart.totalCents, cart.currency]);

    for (const item of cart.items) {
      await client.query(`INSERT INTO order_request_items
        (order_id, product_id, variant_id, product_name, variant_name, size_label, quantity, unit_price_cents)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, item.productId, item.variantId, item.name, item.variantName, item.size, item.quantity, item.unitPriceCents]);
    }
    await client.query('COMMIT');
    return { id, repeated: false, matching: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      const prior = await db.query('SELECT id, payload_hash FROM order_requests WHERE idempotency_key = $1', [idempotencyKey]);
      if (prior.rows.length) return { id: prior.rows[0].id, repeated: true, matching: prior.rows[0].payload_hash === payloadHash };
    }
    throw error;
  } finally { client.release(); }
}
