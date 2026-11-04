BEGIN;
CREATE TABLE IF NOT EXISTS inventory (
    sku TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    size_label TEXT NOT NULL,
    available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, variant_id, size_label)
);
CREATE TABLE IF NOT EXISTS order_requests (
    id UUID PRIMARY KEY,
    idempotency_key UUID NOT NULL UNIQUE,
    payload_hash TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED','CANCELLED','CONVERTED')),
    total_cents BIGINT NOT NULL CHECK (total_cents > 0),
    currency TEXT NOT NULL DEFAULT 'BRL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_request_items (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    size_label TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0)
);
CREATE INDEX IF NOT EXISTS order_requests_created_idx ON order_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_product_idx ON inventory (product_id, variant_id);
COMMIT;
