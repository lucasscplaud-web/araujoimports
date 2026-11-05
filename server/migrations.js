import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migrationFiles = [
  ['001_initial', '../sql/schema.sql'],
  ['002_integrity', '../sql/migrations/002_integrity.sql']
];
export async function loadMigrations() {
  return Promise.all(migrationFiles.map(async ([version, path]) => {
    // Git autocrlf must not change immutable migration identities across OSes.
    const sql = (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
    return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}
// Explicit operator command only. Application startup never writes a schema.
export async function runMigrations(pool, migrations) {
  migrations ??= await loadMigrations();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query('SELECT pg_advisory_xact_lock(1767188827)');
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query('SELECT version, checksum FROM public.schema_migrations ORDER BY version');
    const existing = new Map(applied.rows.map(row => [row.version, row.checksum]));
    const known = new Set(migrations.map(migration => migration.version));
    if ([...existing.keys()].some(version => !known.has(version))) {
      throw Object.assign(new Error('Unknown schema version'), { code: 'DATABASE_SCHEMA_NOT_READY' });
    }
    const executed = [];
    for (const migration of migrations) {
      if (existing.has(migration.version)) {
        if (existing.get(migration.version) !== migration.checksum) {
          throw Object.assign(new Error('Applied migration checksum changed'), { code: 'MIGRATION_CHECKSUM_MISMATCH' });
        }
        continue;
      }
      await client.query(migration.sql);
      await client.query('INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)',
        [migration.version, migration.checksum]);
      executed.push(migration.version);
    }
    await checkRequiredStructure(client);
    await client.query('COMMIT');
    return executed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
// Read-only: verify the ledger and schema contracts used by application SQL.
export async function assertDatabaseReady(pool) {
  if (!pool) throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_NOT_CONFIGURED' });
  const expected = await loadMigrations();
  const applied = await pool.query('SELECT version, checksum FROM public.schema_migrations ORDER BY version');
  if (applied.rows.length !== expected.length || expected.some((migration, index) =>
    applied.rows[index]?.version !== migration.version || applied.rows[index]?.checksum !== migration.checksum)) {
    throw Object.assign(new Error('Run the explicit migration command'), { code: 'DATABASE_SCHEMA_NOT_READY' });
  }
  await checkRequiredStructure(pool);
  return true;
}
async function checkRequiredStructure(pool) {
  await pool.query(`SELECT sku, product_id, variant_id, size_label, available_quantity, updated_at
    FROM public.inventory LIMIT 0`);
  await pool.query(`SELECT id, idempotency_key, payload_hash, contact_name, email, status,
    total_cents, currency, created_at FROM public.order_requests LIMIT 0`);
  await pool.query(`SELECT id, order_id, product_id, variant_id, product_name, variant_name,
    size_label, quantity, unit_price_cents FROM public.order_request_items LIMIT 0`);

  // IF NOT EXISTS only checks the relation name. Refuse incompatible legacy
  // tables rather than accepting columns without the original integrity rules.
  const requiredColumns = {
    inventory: { text: ['sku', 'product_id', 'variant_id', 'size_label'], integer: ['available_quantity'],
      'timestamp with time zone': ['updated_at'] },
    order_requests: { uuid: ['id', 'idempotency_key'], text: ['payload_hash', 'contact_name', 'email', 'status', 'currency'],
      bigint: ['total_cents'], 'timestamp with time zone': ['created_at'] },
    order_request_items: { bigint: ['id', 'unit_price_cents'], uuid: ['order_id'], integer: ['quantity'],
      text: ['product_id', 'variant_id', 'product_name', 'variant_name', 'size_label'] },
    schema_migrations: { text: ['version', 'checksum'], 'timestamp with time zone': ['applied_at'] }
  };
  const tableNames = Object.keys(requiredColumns);
  const columns = await pool.query(`SELECT c.relname AS table_name, c.relkind, a.attname,
    format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull,
    a.attidentity, pg_get_expr(d.adbin, d.adrelid) AS default_expression
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped`, [tableNames]);
  const foundColumns = new Map(columns.rows.map(row => [`${row.table_name}.${row.attname}`, row]));
  const incompatible = () => { throw Object.assign(new Error('Incompatible database structure'), { code: 'DATABASE_SCHEMA_NOT_READY' }); };
  for (const [table, types] of Object.entries(requiredColumns)) {
    for (const [type, names] of Object.entries(types)) {
      for (const name of names) {
        const column = foundColumns.get(`${table}.${name}`);
        if (!column || column.relkind !== 'r' || column.data_type !== type || !column.attnotnull) incompatible();
      }
    }
  }
  const defaults = { 'inventory.updated_at': 'now()', 'order_requests.created_at': 'now()',
    'order_requests.status': "'REQUESTED'::text", 'order_requests.currency': "'BRL'::text",
    'schema_migrations.applied_at': 'now()' };
  for (const [key, expression] of Object.entries(defaults)) {
    if (foundColumns.get(key)?.default_expression !== expression) incompatible();
  }
  const itemId = foundColumns.get('order_request_items.id');
  if (!itemId.attidentity && !itemId.default_expression?.startsWith('nextval(')) incompatible();

  // Match definitions, not names: renamed legitimate constraints still pass,
  // while a constraint replaced with CHECK (true) does not satisfy the contract.
  const requiredConstraints = {
    inventory: ['PRIMARY KEY (sku)', 'UNIQUE (product_id, variant_id, size_label)',
      'CHECK (available_quantity >= 0)',
      "CHECK (product_id ~ '^[a-z0-9-]{2,64}$'::text AND variant_id ~ '^[a-z0-9-]{2,64}$'::text AND char_length(size_label) >= 1 AND char_length(size_label) <= 8 AND sku = ((((product_id || ':'::text) || variant_id) || ':'::text) || size_label))"],
    order_requests: ['PRIMARY KEY (id)', 'UNIQUE (idempotency_key)', 'CHECK (total_cents > 0)',
      "CHECK (status = ANY (ARRAY['REQUESTED'::text, 'CANCELLED'::text, 'CONVERTED'::text]))",
      "CHECK (payload_hash ~ '^[a-f0-9]{64}$'::text AND char_length(btrim(contact_name)) >= 2 AND char_length(btrim(contact_name)) <= 90 AND char_length(email) >= 3 AND char_length(email) <= 254 AND total_cents >= 1 AND total_cents <= 50000000 AND currency = 'BRL'::text)"],
    order_request_items: ['PRIMARY KEY (id)', 'UNIQUE (order_id, product_id, variant_id, size_label)',
      'FOREIGN KEY (order_id) REFERENCES order_requests(id) ON DELETE CASCADE',
      'CHECK (quantity >= 1 AND quantity <= 10)', 'CHECK (unit_price_cents > 0)',
      "CHECK (product_id ~ '^[a-z0-9-]{2,64}$'::text AND variant_id ~ '^[a-z0-9-]{2,64}$'::text AND char_length(size_label) >= 1 AND char_length(size_label) <= 8 AND char_length(product_name) >= 2 AND char_length(product_name) <= 90 AND char_length(variant_name) >= 1 AND char_length(variant_name) <= 45 AND unit_price_cents >= 1 AND unit_price_cents <= 20000000)"],
    schema_migrations: ['PRIMARY KEY (version)', "CHECK (checksum ~ '^[a-f0-9]{64}$'::text)"]
  };
  const constraints = await pool.query(`SELECT c.relname AS table_name,
    pg_get_constraintdef(co.oid, true) AS definition FROM pg_constraint co
    JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    AND co.convalidated AND NOT co.condeferrable`, [tableNames]);
  const normalize = value => value.replace(/\s+/g, '').replaceAll('public.', '');
  const foundConstraints = new Set(constraints.rows.map(row => `${row.table_name}:${normalize(row.definition)}`));
  for (const [table, definitions] of Object.entries(requiredConstraints)) {
    for (const definition of definitions) {
      if (!foundConstraints.has(`${table}:${normalize(definition)}`)) incompatible();
    }
  }
  const indexes = await pool.query(`SELECT c.relname AS table_name,
    ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum ORDER BY k.position) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_am am ON am.oid = ic.relam
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
    AND am.amname = 'btree'`, [tableNames]);
  const requiredIndexes = { inventory: ['product_id', 'variant_id'], order_requests: ['created_at'],
    order_request_items: ['order_id'] };
  for (const [table, prefix] of Object.entries(requiredIndexes)) {
    if (!indexes.rows.some(row => row.table_name === table && prefix.every((name, index) => row.columns[index] === name))) incompatible();
  }
}
