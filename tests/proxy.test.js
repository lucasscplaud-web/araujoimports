import test from 'node:test';
import assert from 'node:assert/strict';
import { createProxyPolicy } from '../server/proxy.js';
import { serve } from './helpers/http.js';

const cart = { items: [{ productId: 'arc-runner', variantId: 'air-max-black', size: '40', quantity: 1 }] };
const proxyEnv = { NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://shop.test', TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '127.0.0.1/32' };

test('configuração recusa confiança universal, números inseguros e ausência de redes', () => {
  for (const TRUST_PROXY of ['true', 'false', '-1', '1.5', '100', 'loopback', '']) {
    assert.throws(() => createProxyPolicy({ TRUST_PROXY }));
  }
  assert.throws(() => createProxyPolicy({ NODE_ENV: 'production' }));
  assert.throws(() => createProxyPolicy({ TRUST_PROXY: '1' }));
  for (const TRUSTED_PROXY_CIDRS of ['0.0.0.0/0', '::/0', 'loopback', 'invalid', '10.0.0.0/33']) {
    assert.throws(() => createProxyPolicy({ TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS }));
  }
});

test('um proxy conhecido usa IP à direita; prefixes falsificados não contornam limite', async t => {
  const api = await serve(t, { env: proxyEnv });
  for (let i = 0; i < 24; i++) {
    const response = await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': `198.51.100.${i + 1}, 203.0.113.10` });
    assert.equal(response.status, 200);
  }
  assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '198.51.100.250, 203.0.113.10' })).status, 429);
  assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '203.0.113.11' })).status, 200);
});

test('dois proxies exigem ambos os saltos confiáveis e ignoram prefixo externo', async t => {
  const api = await serve(t, { env: { ...proxyEnv, TRUST_PROXY: '2', TRUSTED_PROXY_CIDRS: '127.0.0.1/32,10.1.2.3/32' } });
  assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '203.0.113.10' })).status, 400);
  assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '203.0.113.10, 10.1.2.4' })).status, 400);
  assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '192.0.2.1, 203.0.113.10, 10.1.2.3' })).status, 200);
});

test('conexão direta, proxy não confiável e IP inválido falham antes do limitador', async t => {
  const direct = await serve(t);
  assert.equal((await direct.post('/api/checkout/quote', cart)).status, 200);
  assert.equal((await direct.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '203.0.113.10' })).status, 400);
  const untrusted = await serve(t, { env: { ...proxyEnv, TRUSTED_PROXY_CIDRS: '10.1.2.3/32' } });
  assert.equal((await untrusted.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '203.0.113.10' })).status, 400);
  const proxy = await serve(t, { env: proxyEnv });
  for (const headers of [{}, { 'X-Forwarded-For': 'garbage' }, { 'X-Forwarded-For': '203.0.113.10:1234' }, { 'Forwarded': 'for=203.0.113.10' }]) {
    assert.equal((await proxy.post('/api/checkout/quote', cart, headers)).status, 400);
  }
});

test('endereços IPv6 do mesmo bloco permanecem no mesmo limite', async t => {
  const api = await serve(t, { env: proxyEnv });
  for (let i = 1; i <= 24; i++) {
    assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': `2001:db8:1::${i}` })).status, 200);
  }
  assert.equal((await api.post('/api/checkout/quote', cart, { 'X-Forwarded-For': '2001:db8:1::99' })).status, 429);
});
