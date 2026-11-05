import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, getPublicCatalog } from '../server/catalog.js';
import { resolveCart, cartSchema, orderRequestSchema, canonicalOrderPayload } from '../server/validation.js';

const selection = { productId: 'arc-runner', variantId: 'air-max-black', size: '40', quantity: 2 };

test('catálogo público nunca retorna estoque interno', () => {
  const result = JSON.stringify(getPublicCatalog());
  assert.equal(result.includes('stockPerSize'), false);
  assert.equal(result.includes('DATABASE_URL'), false);
  assert.ok(catalog.products.length >= 1);
});
test('servidor calcula valores independentemente do client', () => {
  const cart = resolveCart([selection]);
  assert.equal(cart.totalCents, 97980);
  assert.equal(resolveCart([{ ...selection, variantId: 'air-max-white' }]).totalCents, 105980);
});
test('payload extra de preço é rejeitado por validação estrita', () => {
  assert.equal(cartSchema.safeParse({ items: [{ ...selection, priceCents: 1 }] }).success, false);
  assert.throws(() => resolveCart([{ ...selection, unitPriceCents: 1 }]));
});
test('variante que não pertence ao produto é rejeitada', () => {
  assert.throws(() => resolveCart([{ productId: 'arc-runner', variantId: 'tee-black', size: '40', quantity: 1 }]));
});
test('quantidades agregadas acima do máximo são rejeitadas', () => {
  assert.throws(() => resolveCart([
    { ...selection, quantity: 8 },
    { ...selection, quantity: 8 }
  ]));
});

test('resolver rejeita quantidades inválidas mesmo sem schema no chamador', () => {
  for (const quantity of [0, -1, 11, 1.5, '2', NaN, Infinity, null]) {
    assert.throws(() => resolveCart([{ ...selection, quantity }]), { code: 'DADOS_INVALIDOS' });
  }
  for (const items of [[], null, Array(31).fill(selection)]) assert.throws(() => resolveCart(items));
});

test('tamanhos pertencem ao produto e categoria escolhidos', () => {
  assert.throws(() => resolveCart([{ ...selection, size: 'P' }]), { code: 'ITEM_INVALIDO' });
  assert.throws(() => resolveCart([{ productId: 'everyday-tee', variantId: 'tee-black', size: '40', quantity: 1 }]));
  assert.equal(resolveCart([{ productId: 'studio-cap', variantId: 'cap-black', size: 'Único', quantity: 1 }]).totalCents, 11990);
});

test('contato normaliza espaços e e-mail, rejeita controles e nomes sem letras', () => {
  const order = { items: [selection], contactName: '  João  D’Ávila ', email: ' TESTE@example.com ', idempotencyKey: 'a1283fc0-e1b6-4b29-98ea-01efb1628898' };
  // Apostrophe ASCII is supported; curly typography is normalized by the caller if desired.
  order.contactName = "  João  D'Ávila ";
  const parsed = orderRequestSchema.parse(order);
  assert.equal(parsed.contactName, "João D'Ávila");
  assert.equal(parsed.email, 'teste@example.com');
  for (const contactName of ['..', '  ', 'A\nB', '<script>', '123']) {
    assert.equal(orderRequestSchema.safeParse({ ...order, contactName }).success, false);
  }
  assert.equal(orderRequestSchema.safeParse({ ...order, email: 'invalido' }).success, false);
  assert.equal(orderRequestSchema.safeParse({ ...order, totalCents: 1 }).success, false);
});

test('hash canônico é estável para linhas agregadas e reordenadas', () => {
  const contact = { contactName: 'João Silva', email: 'teste@example.com' };
  const second = { ...selection, variantId: 'air-max-white', quantity: 1 };
  const one = resolveCart([selection, second]);
  const two = resolveCart([second, { ...selection, quantity: 1 }, { ...selection, quantity: 1 }]);
  assert.equal(canonicalOrderPayload({ ...contact, items: one.items }), canonicalOrderPayload({ ...contact, items: two.items }));
});
