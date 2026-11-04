/**
 * SOMENTE PRÉVIA LOCAL, sem dependências npm. Escuta em 127.0.0.1.
 * Para produção, use npm install + npm start (Express, Redis, Zod e Postgres).
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeConfig as config } from '../server/catalog.config.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const projection = p => ({ id: p.id, slug: p.slug, name: p.name, category: p.category,
  kicker: p.kicker, tagline: p.tagline, description: p.description, badge: p.badge,
  featured: p.featured, priceCents: p.priceCents, sizes: p.sizes,
  variants: p.variants.map(({ id, color, hex, image }) => ({ id, color, hex, image })) });
const catalog = { brand: config.brand, currency: config.currency, announcement: config.announcement,
  categories: config.categories,
  products: config.products.map(p => { const { kicker: _k, tagline: _t, description: _d, ...publicCard } = projection(p);
    return { ...publicCard, image: p.variants[0].image }; }) };
const respond = (res, code, payload) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'" });
  res.end(JSON.stringify(payload));
};
const port = Number(process.env.PREVIEW_PORT || 3000);

http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  if (req.method === 'GET' && url.pathname === '/api/catalog') return respond(res, 200, catalog);
  if (req.method === 'GET' && url.pathname.startsWith('/api/products/')) {
    const slug = url.pathname.split('/').at(-1);
    const p = config.products.find(x => x.slug === slug);
    return respond(res, p ? 200 : 404, p ? projection(p) : { error: 'PRODUTO_NAO_ENCONTRADO' });
  }
  if (req.method === 'POST' && url.pathname === '/api/checkout/quote') {
    if (req.headers.origin !== `http://127.0.0.1:${port}` && req.headers.origin !== `http://localhost:${port}`)
      return respond(res, 403, { error: 'ORIGEM_NAO_AUTORIZADA' });
    let raw = '';
    for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 12000) return respond(res, 413, { error: 'PAYLOAD_MUITO_GRANDE' }); }
    try {
      const body = JSON.parse(raw);
      if (Object.keys(body).some(key => key !== 'items') || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw Error('INVALID');
      const merged = new Map();
      for (const item of body.items) {
        if (!item || Object.keys(item).some(k => !['productId','variantId','size','quantity'].includes(k))) throw Error('INVALID');
        const p = config.products.find(p => p.id === item.productId);
        const v = p?.variants.find(v => v.id === item.variantId);
        if (!p || !v || !p.sizes.includes(item.size) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw Error('INVALID');
        const key = `${p.id}:${v.id}:${item.size}`;
        const existing = merged.get(key);
        const quantity = (existing?.quantity || 0) + item.quantity;
        if (quantity > 10) throw Error('INVALID');
        merged.set(key, { productId:p.id,variantId:v.id,size:item.size,quantity, name:p.name,variantName:v.color,unitPriceCents:p.priceCents,lineCents:p.priceCents * quantity });
      }
      const items = [...merged.values()];
      const totalCents = items.reduce((s,i)=>s+i.lineCents,0);
      return respond(res, 200, { items, subtotalCents:totalCents,totalCents,currency:'BRL',available:null,
        note:'Prévia local sem verificação de estoque. Não use para transações reais.' });
    } catch { return respond(res, 400, {error:'DADOS_INVALIDOS'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/order-requests') return respond(res, 503, { error: 'PEDIDOS_INDISPONIVEIS' });
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return respond(res, 404, { error: 'NAO_ENCONTRADO' });
  let target;
  if (url.pathname === '/' || /^\/produto\/[a-z0-9-]+\/?$/.test(url.pathname)) target = 'index.html';
  else if (/^\/(?:css|js)\/[a-z0-9.-]+\.(?:css|js)$/.test(url.pathname) || /^\/assets\/products\/[a-z0-9-]+\.(?:svg|png|jpe?g|webp)$/.test(url.pathname) || url.pathname === '/favicon.svg') target = url.pathname.slice(1);
  else return respond(res, 404, { error: 'NAO_ENCONTRADO' });
  try {
    const file = await readFile(resolve(root, target));
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'" });
    res.end(file);
  } catch { respond(res, 404, {error:'NAO_ENCONTRADO'}); }
}).listen(port, '127.0.0.1', () => console.log(`PRÉVIA LOCAL: http://127.0.0.1:${port} (NÃO USAR EM PRODUÇÃO)`));
