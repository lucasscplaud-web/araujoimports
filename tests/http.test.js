import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers/http.js';
import { createApp } from '../server/app.js';

const item = { productId: 'arc-runner', variantId: 'air-max-white', size: '40', quantity: 2 };
const order = { items: [item], contactName: 'João Silva', email: 'joao@example.com', idempotencyKey: 'a1283fc0-e1b6-4b29-98ea-01efb1628898' };

test('HTTP usa preços das variações e não publica SKU/estoque interno', async t => {
  const api = await serve(t, { database: {}, inventoryCheck: async () => true });
  const response = await api.post('/api/checkout/quote', { items: [item] });
  assert.equal(response.status, 200);
  assert.equal(response.body.totalCents, 105980);
  assert.equal(response.body.available, true);
  assert.equal('sku' in response.body.items[0], false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const forged = await api.post('/api/checkout/quote', { items: [{ ...item, priceCents: 1 }] });
  assert.equal(forged.status, 400);
});

test('pré-pedido valida contato/seleções antes da persistência e responde sem cobrança', async t => {
  let persisted;
  const api = await serve(t, { database: {}, orderInsert: async data => {
    persisted = data;
    return { id: data.id, matching: true, repeated: false };
  } });
  const good = await api.post('/api/order-requests', { ...order, email: ' JOAO@example.com ' });
  assert.equal(good.status, 201);
  assert.equal(good.body.status, 'REQUESTED');
  assert.equal(persisted.cart.totalCents, 105980);
  assert.equal(persisted.email, 'joao@example.com');
  assert.equal((await api.post('/api/order-requests', { ...order, contactName: '..' })).status, 400);
  assert.equal((await api.post('/api/order-requests', { ...order, email: 'sem-email' })).status, 400);
  assert.equal((await api.post('/api/order-requests', { ...order, items: [{ ...item, size: 'GG' }] })).status, 400);
  assert.equal((await api.post('/api/order-requests', { ...order, totalCents: 1 })).status, 400);
});

test('estoque indisponível e idempotência preservam contrato HTTP', async t => {
  for (const [outcome, status, code] of [
    [{ unavailable: true }, 409, 'ESTOQUE_INDISPONIVEL'],
    [{ matching: false }, 409, 'CHAVE_IDEMPOTENCIA_REUTILIZADA'],
    [{ id: order.idempotencyKey, repeated: true, matching: true }, 200, undefined]
  ]) {
    const api = await serve(t, { database: {}, orderInsert: async () => outcome });
    const response = await api.post('/api/order-requests', order);
    assert.equal(response.status, status);
    assert.equal(response.body.error, code);
  }
});

test('42P01 e conexão indisponível retornam 503; logs e resposta não vazam detalhes', async t => {
  for (const code of ['42P01', 'ECONNREFUSED']) {
    const secret = 'senha-teste-NAO-PUBLICAR';
    const api = await serve(t, { database: {}, orderInsert: async () => {
      throw Object.assign(new Error(`SQL SELECT ${secret}`), { code, query: secret });
    } });
    const response = await api.post('/api/order-requests', order);
    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'SERVICO_INDISPONIVEL');
    assert.equal(JSON.stringify({ body: response.body, logs: api.logs }).includes(secret), false);
    assert.equal(JSON.parse(api.logs[0]).code, code);
    assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  }
});

test('same-origin, JSON e tamanho continuam protegidos', async t => {
  const api = await serve(t);
  assert.equal((await api.post('/api/checkout/quote', { items: [item] }, { Origin: 'https://outro.test' })).status, 403);
  assert.equal((await api.post('/api/checkout/quote', { items: [item] }, { 'Content-Type': 'text/plain' })).status, 415);
  const invalid = await fetch(api.base + '/api/checkout/quote', { method: 'POST', headers: { Origin: 'http://shop.test', 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  const large = await api.post('/api/checkout/quote', { data: 'x'.repeat(21000) });
  assert.equal(large.status, 413);
});

test('frete recebe somente seleções resolvidas e CEP estrito', async t => {
  let received;
  const api = await serve(t, { shippingQuote: async (items, cep) => {
    received = { items, cep }; return { options: [{ serviceId: 'PAC', name: 'Correios — PAC',
      days: 3, carrierCents: 2000, marginCents: 400, totalCents: 2400,
      lines: [{ name: 'AIR MAX PLUS', quantity: 2, costCents: 2000 }] }] };
  } });
  assert.equal((await api.post('/api/shipping/quote', { items: [item], cep: 12345678 })).status, 400);
  assert.equal((await api.post('/api/shipping/quote', { items: [item], cep: '01001000', marginCents: 0 })).status, 400);
  const quote = await api.post('/api/shipping/quote', { items: [item], cep: '01001000' });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.options[0].totalCents, 2400);
  assert.equal('marginCents' in quote.body.options[0], false);
  assert.equal('carrierCents' in quote.body.options[0], false);
  assert.deepEqual(quote.body.options[0].lines, [{ name: 'AIR MAX PLUS', quantity: 2 }]);
  assert.equal(received.items[0].unitPriceCents, 52990);
  assert.equal(received.items[0].quantity, 2);
});

test('prontidão falha com resposta genérica', async t => {
  const api = await serve(t, { readiness: async () => { throw Object.assign(new Error('segredo'), { code: '42P01' }); } });
  const response = await fetch(api.base + '/api/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable' });
});

test('produção exige store distribuído e falha de store não libera operação', async t => {
  assert.throws(() => createApp({ env: { NODE_ENV: 'production', TRUST_PROXY: '0', PUBLIC_ORIGIN: 'https://shop.test' }, database: {} }), /Redis/);
  const brokenStore = { localKeys: false, init() {}, async increment() { throw new Error('Redis unavailable'); },
    async decrement() {}, async resetKey() {} };
  let reached = false;
  const api = await serve(t, { stores: { requests: brokenStore }, database: {},
    inventoryCheck: async () => { reached = true; return true; } });
  const response = await api.post('/api/checkout/quote', { items: [item] });
  assert.equal(response.status, 500);
  assert.equal(reached, false);
  assert.equal(response.body.error, 'ERRO_INTERNO');
});
