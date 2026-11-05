import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getPublicCatalog } from '../server/catalog.js';

async function frontend(fetchImpl) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', disabled: false,
      replaceChildren() {}, append() {}, classList: { add() {}, remove() {} } });
    return nodes.get(selector);
  };
  const source = (await readFile(new URL('../public/js/app.js', import.meta.url), 'utf8'))
    .replace(/bootstrap\(\);\s*$/, 'globalThis.shop = { state, calculateShipping, clearShipping };');
  const context = vm.createContext({ Intl, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null },
    document: { querySelector: node, createElement: () => node(Symbol()) }, fetch: fetchImpl });
  vm.runInContext(source, context);
  const shop = context.shop;
  shop.state.catalog = getPublicCatalog();
  shop.state.cart = [{ productId: 'arc-runner', variantId: 'air-max-white', size: '40', quantity: 1 }];
  node('#shippingCep').value = '01001-000';
  return { shop, node };
}

test('frete atrasado não reaparece após mudança na sacola/CEP', async () => {
  let respond;
  let sent;
  const { shop, node } = await frontend(async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Promise(resolve => { respond = resolve; });
  });
  const pending = shop.calculateShipping();
  assert.equal(node('#shippingCalculate').disabled, true);
  shop.state.cart[0].quantity = 2;
  shop.clearShipping();
  respond({ ok: true, json: async () => ({ options: [{ serviceId: 'PAC', totalCents: 2400, lines: [] }] }) });
  await pending;
  assert.equal(sent.items[0].quantity, 1);
  assert.equal(sent.cep, '01001000');
  assert.equal(shop.state.shipping, null);
  assert.equal(node('#cartShipping').textContent, 'A calcular');
  assert.equal(node('#shippingCalculate').disabled, false);
});

test('falha de frete produz mensagem pública e permite nova consulta', async () => {
  const { shop, node } = await frontend(async () => ({ ok: false, status: 503,
    json: async () => ({ error: 'FRETE_INDISPONIVEL' }) }));
  await shop.calculateShipping();
  assert.equal(shop.state.shipping, null);
  assert.equal(node('#shippingCalculate').disabled, false);
  assert.match(node('#shippingStatus').textContent, /Frete indisponível/);
});
