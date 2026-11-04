import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { catalog, getPublicCatalog, getProductBySlug, publicProduct } from './catalog.js';
import { ClientError, cartSchema, orderRequestSchema, resolveCart, canonicalOrderPayload } from './validation.js';
import { db, checkInventory, insertOrderRequest } from './db.js';
import { calculateShipping } from './shipping.js';

const app = express();
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const publicOrigin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const trustProxy = process.env.TRUST_PROXY || '0';
app.set('trust proxy', trustProxy === '0' ? false : Number.isFinite(Number(trustProxy)) ? Number(trustProxy) : trustProxy);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"],
      connectSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'"], scriptSrc: ["'self'"], fontSrc: ["'self'"],
      formAction: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      upgradeInsecureRequests: production ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '20kb', strict: true }));

let redisClient;
let rateLimitStore;
if (process.env.REDIS_URL) {
  const { createClient } = await import('redis');
  const { RedisStore } = await import('rate-limit-redis');
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', () => { /* error caught by rate limit on request */ });
  try {
    await redisClient.connect();
    rateLimitStore = new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args), prefix: 'araujo:limit:' });
  } catch (error) {
    if (production) throw new Error('Em produção, Redis deve estar disponível para rate limit distribuído', { cause: error });
    console.warn('Redis indisponível: usando limite em memória apenas para desenvolvimento.');
  }
} else if (production) {
  throw new Error('REDIS_URL é obrigatório em produção (rate limiting distribuído)');
}

const requestLimiter = rateLimit({
  windowMs: 60_000, limit: 24, standardHeaders: 'draft-8', legacyHeaders: false,
  ...(rateLimitStore ? { store: rateLimitStore } : {}),
  message: { error: 'MUITAS_REQUISICOES' }
});
const orderLimiter = rateLimit({
  windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  // Stores distintos: não compartilhe um único store com dois limitadores.
  ...(rateLimitStore ? { store: new (rateLimitStore.constructor)({ sendCommand: (...args) => redisClient.sendCommand(args), prefix: 'araujo:orders:' }) } : {}),
  message: { error: 'MUITAS_REQUISICOES' }
});

function originGuard(req, res, next) {
  const origin = req.get('origin');
  if (!origin || origin !== publicOrigin) return res.status(403).json({ error: 'ORIGEM_NAO_AUTORIZADA' });
  if (!req.is('application/json')) return res.status(415).json({ error: 'TIPO_NAO_SUPORTADO' });
  next();
}
const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/catalog', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  res.json(getPublicCatalog());
});
app.get('/api/products/:slug', (req, res) => {
  const p = getProductBySlug(req.params.slug);
  if (!p) return res.status(404).json({ error: 'PRODUTO_NAO_ENCONTRADO' });
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  res.json(publicProduct(p));
});
app.post('/api/shipping/quote', noStore, originGuard, requestLimiter, safe(async (req,res)=>{
  const raw = req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !/^[0-9]{8}$/.test(raw.cep||''))
    return res.status(400).json({ error:'CEP_INVALIDO' });
  const cartInput=cartSchema.safeParse({items:raw.items});
  if (!cartInput.success || Object.keys(raw).some(k=>!['cep','items'].includes(k)))
    return res.status(400).json({ error:'DADOS_INVALIDOS' });
  const cart=resolveCart(cartInput.data.items);
  const quote=await calculateShipping(cart.items,raw.cep);
  res.json(quote);
}));
app.post('/api/checkout/quote', noStore, originGuard, requestLimiter, safe(async (req, res) => {
  const input = cartSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'DADOS_INVALIDOS' });
  const quote = resolveCart(input.data.items);
  // O preço é público, mas sua autoridade vem exclusivamente do catálogo no servidor.
  const available = db ? await checkInventory(quote) : null;
  const publicItems = quote.items.map(({ sku: _sku, ...item }) => item);
  res.json({ items: publicItems, subtotalCents: quote.subtotalCents, totalCents: quote.totalCents,
    currency: quote.currency, available, note: 'Cotação informativa. Valores e estoque são revalidados no servidor.' });
}));
app.post('/api/order-requests', noStore, originGuard, orderLimiter, safe(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'PEDIDOS_INDISPONIVEIS' });
  const input = orderRequestSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'DADOS_INVALIDOS' });
  const cart = resolveCart(input.data.items);
  const payloadHash = createHash('sha256').update(canonicalOrderPayload({
    items: cart.items, contactName: input.data.contactName, email: input.data.email
  })).digest('hex');
  const outcome = await insertOrderRequest({
    id: randomUUID(), idempotencyKey: input.data.idempotencyKey,
    payloadHash, contactName: input.data.contactName,
    email: input.data.email, cart
  });
  if (outcome.unavailable) return res.status(409).json({ error: 'ESTOQUE_INDISPONIVEL' });
  if (!outcome.matching) return res.status(409).json({ error: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  res.status(outcome.repeated ? 200 : 201).json({ requestId: outcome.id, status: 'REQUESTED',
    message: 'Pré-pedido recebido. Nenhuma cobrança foi realizada.' });
}));

app.use('/assets', express.static(resolve(publicDir, 'assets'), { maxAge: '7d', immutable: true, fallthrough: false }));
app.use('/css', express.static(resolve(publicDir, 'css'), { maxAge: '5m', fallthrough: false }));
app.use('/js', express.static(resolve(publicDir, 'js'), { maxAge: '5m', fallthrough: false }));
app.get('/favicon.svg', (_req, res) => res.sendFile(resolve(publicDir, 'favicon.svg')));
app.get(/^\/(?:$|produto\/[a-z0-9-]+\/?$)/, (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(resolve(publicDir, 'index.html'));
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'NAO_ENCONTRADO' }));
app.use((_req, res) => res.status(404).send('Página não encontrada'));
app.use((error, _req, res, _next) => {
  // Não enviar query, stack trace, erro SQL, variáveis de ambiente ao client.
  if (error instanceof ClientError) return res.status(error.status).json({ error: error.code });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'PAYLOAD_MUITO_GRANDE' });
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'JSON_INVALIDO' });
  console.error('Erro de servidor:', { name: error.name, code: error.code || 'INTERNAL' });
  res.status(500).json({ error: 'ERRO_INTERNO' });
});

app.listen(port, () => {
  console.info(`ARAUJO IMPORTS disponível em ${publicOrigin}`);
  if (!db) console.warn('DATABASE_URL ausente: catálogo e carrinho funcionam, mas pré-pedidos ficam indisponíveis.');
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await Promise.allSettled([db?.end(), redisClient?.quit()]);
    process.exit(0);
  });
}
