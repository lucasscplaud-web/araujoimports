import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, getPublicCatalog } from '../server/catalog.js';
import { resolveCart, cartSchema } from '../server/validation.js';

test('catálogo público nunca retorna estoque interno', () => {
  const result = JSON.stringify(getPublicCatalog());
  assert.equal(result.includes('stockPerSize'), false);
  assert.equal(result.includes('DATABASE_URL'), false);
  assert.ok(catalog.products.length >= 1);
});
test('servidor calcula valores independentemente do client', () => {
  const cart = resolveCart([{ productId: 'arc-runner', variantId: 'arc-red', size: '40', quantity: 2 }]);
  assert.equal(cart.totalCents, 97980);
});
test('payload extra de preço é rejeitado por validação estrita', () => {
  assert.equal(cartSchema.safeParse({ items: [{ productId: 'arc-runner', variantId: 'arc-red', size: '40', quantity: 1, priceCents: 1 }] }).success, false);
});
test('variante que não pertence ao produto é rejeitada', () => {
  assert.throws(() => resolveCart([{ productId: 'arc-runner', variantId: 'tee-black', size: '40', quantity: 1 }]));
});
test('quantidades agregadas acima do máximo são rejeitadas', () => {
  assert.throws(() => resolveCart([
    { productId: 'arc-runner', variantId: 'arc-red', size: '40', quantity: 8 },
    { productId: 'arc-runner', variantId: 'arc-red', size: '40', quantity: 8 }
  ]));
});
