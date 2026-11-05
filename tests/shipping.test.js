import test from 'node:test';
import assert from 'node:assert/strict';
import { createShippingService, __test } from '../server/shipping.js';
import { getProduct } from '../server/catalog.js';
import { resolveCart } from '../server/validation.js';

const env = { SHIPPING_ORIGIN_CEP: '01001000', SHIPPING_PACKAGES_CONFIRMED: 'true', CORREIOS_BEARER_TOKEN: 'private-test-token', CORREIOS_SERVICES: 'PAC,SEDEX' };
const items = resolveCart([
  { productId: 'arc-runner', variantId: 'air-max-black', size: '40', quantity: 2 },
  { productId: 'everyday-tee', variantId: 'tee-black', size: 'M', quantity: 3 }
]).items;
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const quiet = { warn() {} };
const standardResponse = url => response(url.includes('/preco/') ? { pcFinal: url.includes('03298') ? '10,00' : '20,00' } : { prazoEntrega: 5 });

test('Correios: cota todos os produtos e quantidades e aplica R$4 uma vez', async () => {
  const calls = [];
  const calculate = createShippingService({ env, logger: quiet, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return standardResponse(url);
  } });
  const quote = await calculate(items, '20040002');
  assert.equal(quote.demo, false);
  assert.deepEqual(quote.options.map(option => option.totalCents), [5400, 10400]);
  assert.equal(quote.options[0].carrierCents, 5000);
  assert.deepEqual(quote.options[0].lines.map(line => line.quantity), [2, 3]);
  const prices = calls.filter(call => call.url.pathname.includes('/preco/'));
  assert.equal(prices.length, 4);
  assert.deepEqual(prices.slice(0, 2).map(call => call.url.searchParams.get('psObjeto')), ['900', '250']);
  for (const { url, options } of calls) {
    assert.equal(url.host, 'api.correios.com.br');
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(url.searchParams.get('cepDestino'), '20040002');
  }
  assert.equal(JSON.stringify(quote).includes('private-test-token'), false);
});

test('Correios: margem e códigos do contrato são configuráveis; consultas idênticas são reutilizadas', async () => {
  const calls = [];
  const calculate = createShippingService({ env: { ...env, SHIPPING_MARGIN_CENTS: '700', CORREIOS_SERVICES: 'PAC', CORREIOS_PAC_CODE: '12345', CORREIOS_CONTRACT: '1234567890', CORREIOS_DR: '72' }, logger: quiet,
    fetchImpl: async url => { calls.push(new URL(url)); return response(url.includes('/preco/') ? { pcFinal: '15,90', coProduto: '12345' } : { prazoEntrega: '3' }); } });
  const quote = await calculate([items[0], { ...items[0], size: '41', quantity: 1 }], '20040002');
  assert.equal(quote.options[0].totalCents, 5470);
  assert.equal(quote.options[0].days, 3);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get('nuContrato'), '1234567890');
  assert.equal(calls[0].searchParams.get('nuDR'), '72');
  assert.match(calls[0].pathname, /12345$/);
});

test('Correios: falta de credencial, configuração inválida ou medidas não confirmadas não geram tarifa', async () => {
  let calls = 0;
  for (const invalid of [
    { ...env, CORREIOS_BEARER_TOKEN: '' },
    { ...env, SHIPPING_PACKAGES_CONFIRMED: 'false' },
    { ...env, SHIPPING_MARGIN_CENTS: '-1' },
    { ...env, CORREIOS_SERVICES: 'PAC,INVALIDO' },
    { ...env, CORREIOS_PAC_CODE: '../bad' },
    { ...env, CORREIOS_CONTRACT: '1234' },
    { ...env, CORREIOS_USER: 'partial-credentials' }
  ]) {
    await assert.rejects(createShippingService({ env: invalid, logger: quiet, fetchImpl: async () => { calls++; } })(items, '20040002'), error => error.status === 503);
  }
  assert.equal(calls, 0);
});

test('Correios: limites de embalagem e dados inválidos são rejeitados antes da consulta', async () => {
  let calls = 0;
  for (const shipping of [
    { length: 10, width: 10, height: 5, weight: 1 },
    { length: 11, width: 5, height: 5, weight: 1 },
    { length: 20, width: 20, height: 0.3, weight: 1 },
    { length: 101, width: 20, height: 20, weight: 1 },
    { length: 100, width: 100, height: 1, weight: 1 },
    { length: 20, width: 20, height: 20, weight: 30.001 },
    { length: 20, width: 20, height: 20, weight: 0 }
  ]) {
    const calculate = createShippingService({ env, logger: quiet, productLookup: id => ({ ...getProduct(id), shipping }), fetchImpl: async () => { calls++; } });
    await assert.rejects(calculate([items[0]], '20040002'), { code: 'EMBALAGEM_INVALIDA' });
  }
  const calculate = createShippingService({ env, logger: quiet, fetchImpl: async () => { calls++; } });
  await assert.rejects(calculate(items, '123'), { code: 'CEP_INVALIDO' });
  await assert.rejects(calculate([{ ...items[0], quantity: 0 }], '20040002'), { code: 'ITEM_INVALIDO' });
  await assert.rejects(calculate([{ ...items[0], variantId: 'tee-black' }], '20040002'), { code: 'ITEM_INVALIDO' });
  assert.equal(calls, 0);
});

test('Correios: modalidade só aparece se todos os volumes forem cotados; prazo nunca é inventado', async () => {
  const calculate = createShippingService({ env, logger: quiet, fetchImpl: async url => {
    if (url.includes('03298') && url.includes('psObjeto=250')) return response({ txErro: 'not available' }, 400);
    if (url.includes('/prazo/')) return response({ prazoEntrega: null });
    return response({ pcFinal: '12,00' });
  } });
  const quote = await calculate(items, '20040002');
  assert.equal(quote.options.length, 1);
  assert.equal(quote.options[0].serviceId, 'SEDEX');
  assert.equal(quote.options[0].days, null);
  assert.equal(quote.options[0].totalCents, 6400);
});

test('Correios: falhas, rejeição de token e respostas malformadas falham com erro genérico e logs sem segredos', async () => {
  for (const provider of [
    async () => response({ secret: 'sensitive' }, 401),
    async () => response({ pcFinal: '10,00', txErro: 'sensitive' }),
    async () => response({ pcFinal: '10,00', coProduto: 'wrong-service' }),
    async () => response({ pcFinal: '0,00' }),
    async () => response([]),
    async () => { throw new Error('sensitive password url'); }
  ]) {
    const logs = [];
    const calculate = createShippingService({ env, logger: { warn: (...args) => logs.push(args) }, fetchImpl: provider });
    await assert.rejects(calculate(items, '20040002'), { code: 'FRETE_INDISPONIVEL', status: 503 });
    assert.equal(JSON.stringify(logs).includes('sensitive'), false);
    assert.equal(JSON.stringify(logs).includes(env.CORREIOS_BEARER_TOKEN), false);
  }
});

test('Correios: token automático compartilhado é renovado perto do vencimento e após um único 401', async () => {
  let time = Date.now();
  let tokens = 0;
  let rejectNext = false;
  const automaticEnv = { ...env, CORREIOS_USER: 'test-user', CORREIOS_ACCESS_CODE: 'secret-test-code', CORREIOS_POSTING_CARD: '1234567890', CORREIOS_CONTRACT: '1234567890', CORREIOS_DR: '72' };
  const calculate = createShippingService({ env: automaticEnv, logger: quiet, now: () => time, fetchImpl: async (url, options) => {
    if (url.includes('/token/')) {
      tokens++;
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { numero: '1234567890', contrato: '1234567890', dr: 72 });
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-user:secret-test-code').toString('base64')}`);
      return response({ token: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(time / 1000) + 3600, nonce: tokens })).toString('base64url')}.signature` });
    }
    if (rejectNext) { rejectNext = false; return response({}, 401); }
    return standardResponse(url);
  } });
  await calculate(items, '20040002');
  assert.equal(tokens, 1);
  await calculate(items, '20040002');
  assert.equal(tokens, 1);
  time += 3_550_000;
  await calculate(items, '20040002');
  assert.equal(tokens, 2);
  rejectNext = true;
  await calculate(items, '20040002');
  assert.equal(tokens, 3);
});

test('Correios: repetidos 401 não causam loop de renovação', async () => {
  let tokens = 0;
  const calculate = createShippingService({ env: { ...env, CORREIOS_USER: 'user', CORREIOS_ACCESS_CODE: 'code', CORREIOS_POSTING_CARD: '1234567890', CORREIOS_SERVICES: 'PAC' }, logger: quiet, fetchImpl: async url => {
    if (url.includes('/token/')) { tokens++; return response({ token: 'opaque-token', expiraEm: new Date(Date.now() + 3600000).toISOString() }); }
    return response({}, 401);
  } });
  await assert.rejects(calculate([items[0]], '20040002'), { code: 'FRETE_INDISPONIVEL' });
  assert.equal(tokens, 2);
});

test('Correios: concorrência de rede permanece limitada entre cotações simultâneas', async () => {
  let active = 0;
  let maximum = 0;
  const calculate = createShippingService({ env, logger: quiet, fetchImpl: async url => {
    active++; maximum = Math.max(active, maximum);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return standardResponse(url);
  } });
  await Promise.all(Array.from({ length: 5 }, () => calculate(items, '20040002')));
  assert.ok(maximum <= 4);
  assert.equal(active, 0);
});

test('Correios: timeout interrompe a consulta e não produz opção fictícia', async () => {
  let aborted = 0;
  const calculate = createShippingService({ env: { ...env, CORREIOS_SERVICES: 'PAC', CORREIOS_TIMEOUT_MS: '1000' }, logger: quiet,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      const keepAlive = setTimeout(() => resolve(response({ pcFinal: '10,00' })), 2000);
      signal.addEventListener('abort', () => { aborted++; clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
    }) });
  await assert.rejects(calculate([items[0]], '20040002'), { code: 'FRETE_INDISPONIVEL' });
  assert.equal(aborted, 1);
});

test('Correios: resposta de autenticação sem validade comprovada é rejeitada', async () => {
  let providerCalls = 0;
  const calculate = createShippingService({ env: { ...env, CORREIOS_SERVICES: 'PAC', CORREIOS_USER: 'user', CORREIOS_ACCESS_CODE: 'code', CORREIOS_POSTING_CARD: '1234567890' }, logger: quiet,
    fetchImpl: async url => { providerCalls++; assert.ok(url.includes('/token/')); return response({ token: 'opaque-token', expiraEm: '2099-01-01T00:00:00' }); } });
  await assert.rejects(calculate([items[0]], '20040002'), { code: 'FRETE_INDISPONIVEL' });
  assert.equal(providerCalls, 1);
});

test('Correios: valores monetários inválidos ou ambíguos são rejeitados', () => {
  assert.equal(__test.moneyToCents('1.234,56'), 123456);
  assert.equal(__test.moneyToCents('12.34'), 1234);
  assert.equal(__test.moneyToCents('12,3'), 1230);
  for (const invalid of ['1.234', 'abc', '-1,00', '1,000', '0', null, Infinity]) assert.equal(__test.moneyToCents(invalid), null);
  assert.ok(Number.isNaN(__test.tokenExpiry({ token: 'opaque', expiraEm: '2026-11-01T12:00:00' })));
});
