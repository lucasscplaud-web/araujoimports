import 'dotenv/config';
import { Pool } from 'pg';
import { catalog } from '../server/catalog.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      for (const size of product.sizes) {
        const sku = `${product.id}:${variant.id}:${size}`;
        await pool.query(`INSERT INTO inventory (sku, product_id, variant_id, size_label, available_quantity)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO NOTHING`,
          [sku, product.id, variant.id, size, variant.stockPerSize]);
      }
    }
  }
  console.info('Estoque inicial criado (quantidades existentes preservadas).');
} finally { await pool.end(); }
