import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getPublicCatalog, getProductBySlug, publicProduct } from './catalog.js';
import { ClientError, cartSchema, orderRequestSchema, resolveCart } from './validation.js';
import { db, checkInventory, insertOrderRequest, isDatabaseUnavailableError } from './db.js';
import { calculateShipping } from './shipping.js';
import { createProxyPolicy } from './proxy.js';
import { logFailure } from './logging.js';

export function createApp({ env = process.env, stores = {}, logger = console,
  database = db, inventoryCheck = checkInventory, orderInsert = insertOrderRequest,
  shippingQuote = calculateShipping, readiness = async () => Boolean(database) } = {}) {
  const app = express();
  const here = dirname(fileURLToPath(import.meta.url));
  const publicDir = resolve(here, '../public');
  const port = Number(env.PORT || 3000);
  const production = env.NODE_ENV === 'production';
  // O Render fornece RENDER_EXTERNAL_URL. A configuração explícita tem prioridade.
  // Não aceitar Origin arbitrário do cliente como mecanismo de confiança.
  const originValue = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || (production ? '' : `http://localhost:${port}`);
  const parsedOrigin = new URL(originValue);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.username || parsedOrigin.password ||
      parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash ||
      (production && parsedOrigin.protocol !== 'https:')) throw new Error('PUBLIC_ORIGIN inválida');
  const publicOrigin = parsedOrigin.origin;
  const proxyPolicy = createProxyPolicy(env);
  app.set('trust proxy', proxyPolicy.trust);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    next();
  });

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

  if (production && (!stores.requests || !stores.orders)) throw new Error('Redis é obrigatório em produção');

  const requestLimiter = rateLimit({
    windowMs: 60_000, limit: 24, standardHeaders: 'draft-8', legacyHeaders: false,
    ...(stores.requests ? { store: stores.requests } : {}),
    message: { error: 'MUITAS_REQUISICOES' }
  });
  const orderLimiter = rateLimit({
    windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
    // Stores distintos: não compartilhe um único store com dois limitadores.
    ...(stores.orders ? { store: stores.orders } : {}),
    message: { error: 'MUITAS_REQUISICOES' }
  });

  function originGuard(req, res, next) {
    try { proxyPolicy.validate(req); } catch (error) { return next(error); }
    const origin = req.get('origin');
    if (!origin || origin.replace(/\/$/, '') !== publicOrigin) return res.status(403).json({ error: 'ORIGEM_NAO_AUTORIZADA' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'TIPO_NAO_SUPORTADO' });
    next();
  }
  const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/ready', noStore, safe(async (_req, res) => {
    try {
      const ready = await readiness();
      return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
    } catch (error) {
      logFailure(logger, 'readiness_failed', error);
      return res.status(503).json({ status: 'unavailable' });
    }
  }));
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
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.cep !== 'string' || !/^[0-9]{8}$/.test(raw.cep))
      return res.status(400).json({ error:'CEP_INVALIDO' });
    const cartInput=cartSchema.safeParse({items:raw.items});
    if (!cartInput.success || Object.keys(raw).some(k=>!['cep','items'].includes(k)))
      return res.status(400).json({ error:'DADOS_INVALIDOS' });
    const cart=resolveCart(cartInput.data.items);
    const quote=await shippingQuote(cart.items,raw.cep);
    // Only the customer-facing total leaves the server, never the internal margin.
    res.json({ demo: false, note: quote.note, options: quote.options.map(option => ({
      serviceId: option.serviceId, name: option.name, days: option.days, totalCents: option.totalCents,
      lines: option.lines.map(({ name, quantity }) => ({ name, quantity }))
    })) });
  }));
  app.post('/api/checkout/quote', noStore, originGuard, requestLimiter, safe(async (req, res) => {
    const input = cartSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'DADOS_INVALIDOS' });
    const quote = resolveCart(input.data.items);
    // O preço é público, mas sua autoridade vem exclusivamente do catálogo no servidor.
    const available = database ? await inventoryCheck(quote, database) : null;
    const publicItems = quote.items.map(({ sku: _sku, ...item }) => item);
    res.json({ items: publicItems, subtotalCents: quote.subtotalCents, totalCents: quote.totalCents,
      currency: quote.currency, available, note: 'Cotação informativa. Valores e estoque são revalidados no servidor.' });
  }));
  app.post('/api/order-requests', noStore, originGuard, orderLimiter, safe(async (req, res) => {
    if (!database) return res.status(503).json({ error: 'PEDIDOS_INDISPONIVEIS' });
    const input = orderRequestSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'DADOS_INVALIDOS' });
    const cart = resolveCart(input.data.items);
    const outcome = await orderInsert({
      id: randomUUID(), idempotencyKey: input.data.idempotencyKey,
      contactName: input.data.contactName,
      email: input.data.email, cart
    }, database);
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
  app.use((error, req, res, _next) => {
    // Não enviar query, stack trace, erro SQL, variáveis de ambiente ao client.
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.code });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'PAYLOAD_MUITO_GRANDE' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'JSON_INVALIDO' });
    logFailure(logger, 'request_failed', error, req.requestId);
    const unavailable = isDatabaseUnavailableError(error) || error.message === 'The client is closed';
    res.status(unavailable ? 503 : 500).json({ error: unavailable ? 'SERVICO_INDISPONIVEL' : 'ERRO_INTERNO' });
  });
  return app;
}
