-- Never rewrite or remove existing records. Invalid legacy rows abort the
-- complete migration transaction for an operator to review.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_identity_check'
    AND conrelid = 'public.inventory'::regclass) THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_identity_check CHECK (
      product_id ~ '^[a-z0-9-]{2,64}$' AND variant_id ~ '^[a-z0-9-]{2,64}$'
      AND char_length(size_label) BETWEEN 1 AND 8
      AND sku = product_id || ':' || variant_id || ':' || size_label);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_requests_payload_check'
    AND conrelid = 'public.order_requests'::regclass) THEN
    ALTER TABLE public.order_requests ADD CONSTRAINT order_requests_payload_check CHECK (
      payload_hash ~ '^[a-f0-9]{64}$'
      AND char_length(btrim(contact_name)) BETWEEN 2 AND 90
      AND char_length(email) BETWEEN 3 AND 254
      AND total_cents BETWEEN 1 AND 50000000 AND currency = 'BRL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_request_items_payload_check'
    AND conrelid = 'public.order_request_items'::regclass) THEN
    ALTER TABLE public.order_request_items ADD CONSTRAINT order_request_items_payload_check CHECK (
      product_id ~ '^[a-z0-9-]{2,64}$' AND variant_id ~ '^[a-z0-9-]{2,64}$'
      AND char_length(size_label) BETWEEN 1 AND 8
      AND char_length(product_name) BETWEEN 2 AND 90
      AND char_length(variant_name) BETWEEN 1 AND 45
      AND unit_price_cents BETWEEN 1 AND 20000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_request_items_line_unique'
    AND conrelid = 'public.order_request_items'::regclass) THEN
    ALTER TABLE public.order_request_items ADD CONSTRAINT order_request_items_line_unique
      UNIQUE (order_id, product_id, variant_id, size_label);
  END IF;
END $$;
-- Order lines snapshot catalog data; removing a discontinued stock entry must
-- not delete commercial history. The parent order is protected by its FK.
CREATE INDEX IF NOT EXISTS order_request_items_order_idx ON public.order_request_items (order_id);
