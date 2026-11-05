import { getProduct, getVariant, catalog } from './catalog.js';
import { ClientError } from './validation.js';

const POSTAL = /^\d{8}$/;
const HOST = 'https://api.correios.com.br';
const SERVICES = { PAC: '03298', SEDEX: '03220' };

class CarrierError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

function moneyToCents(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{1,2}$/.test(value) && !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const normalized = value.includes(',') ? value.replaceAll('.', '').replace(',', '.') : value;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

// Limite compartilhado por processo. Uma requisição não abre dezenas de sockets.
function requestGate(max = 4) {
  let active = 0;
  const queue = [];
  return async (task, signal) => {
    signal.throwIfAborted();
    if (active >= max) {
      if (queue.length >= 100) throw new CarrierError('CORREIOS_BUSY');
      await new Promise((resolve, reject) => {
        const entry = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
        const abort = () => {
          const index = queue.indexOf(entry);
          if (index !== -1) queue.splice(index, 1);
          reject(signal.reason);
        };
        queue.push(entry);
        signal.addEventListener('abort', abort, { once: true });
      });
    } else active++;
    try { signal.throwIfAborted(); return await task(); }
    finally {
      const next = queue.shift();
      if (next) next.resolve();
      else active--;
    }
  };
}

function tokenExpiry(data) {
  // A leitura de exp do token recebido via HTTPS serve apenas para renovação,
  // nunca para autorizar usuários da loja.
  try {
    const payload = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64url').toString('utf8'));
    if (Number.isSafeInteger(payload.exp)) return payload.exp * 1000;
  } catch { /* Alguns contratos retornam token opaco com expiraEm. */ }
  if (typeof data.expiraEm === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(data.expiraEm)) return Date.parse(data.expiraEm);
  return NaN; // Não presumir duração ou fuso horário desconhecido.
}

function packageFor(product) {
  const value = product.shipping;
  if (!value || ![value.length, value.width, value.height, value.weight].every(Number.isFinite)) throw new ClientError('EMBALAGEM_INVALIDA', 503);
  const { length, width, height, weight } = value;
  // PAC/SEDEX padrão: limites de caixas/pacotes, sem Grandes Formatos.
  if (length < 11 || width < 6 || height < 0.4 || Math.max(length, width, height) > 100 || length + width + height > 200 || weight <= 0 || weight > 30) {
    throw new ClientError('EMBALAGEM_INVALIDA', 503);
  }
  return { comprimento: String(length), largura: String(width), altura: String(height), psObjeto: String(Math.ceil(weight * 1000)), tpObjeto: '2' };
}

export function createShippingService({ env = process.env, fetchImpl = globalThis.fetch, logger = console, productLookup = getProduct, now = Date.now } = {}) {
  const gate = requestGate();
  let cachedToken;
  let tokenPromise;

  function settings() {
    const ids = (env.CORREIOS_SERVICES ?? 'PAC,SEDEX').split(',').map(value => value.trim().toUpperCase());
    const services = [...new Set(ids)].map(id => ({ id, code: env[`CORREIOS_${id}_CODE`] ?? SERVICES[id] }));
    const marginCents = Number(env.SHIPPING_MARGIN_CENTS ?? catalog.shipping.marginCents);
    const timeout = Number(env.CORREIOS_TIMEOUT_MS ?? 12000);
    const version = env.CORREIOS_API_VERSION ?? 'v1';
    const credentials = [env.CORREIOS_USER, env.CORREIOS_ACCESS_CODE, env.CORREIOS_POSTING_CARD];
    const automatic = credentials.every(value => typeof value === 'string' && value.length > 0);
    if (!POSTAL.test(env.SHIPPING_ORIGIN_CEP ?? '') || !services.length || services.some(({ id, code }) => !Object.hasOwn(SERVICES, id) || !/^\d{5}$/.test(code)) ||
        !Number.isSafeInteger(marginCents) || marginCents < 0 || marginCents > 10000 || !Number.isInteger(timeout) || timeout < 1000 || timeout > 30000 || !['v1', 'v3'].includes(version) ||
        (credentials.some(Boolean) && !automatic) || (!automatic && !/^\S+$/.test(env.CORREIOS_BEARER_TOKEN ?? '')) ||
        (Boolean(env.CORREIOS_CONTRACT) !== Boolean(env.CORREIOS_DR)) ||
        (env.CORREIOS_CONTRACT && (!/^\d{1,20}$/.test(env.CORREIOS_CONTRACT) || !/^\d{1,2}$/.test(env.CORREIOS_DR))) ||
        (automatic && (!/^\d{1,20}$/.test(env.CORREIOS_POSTING_CARD) || /[:\r\n]/.test(env.CORREIOS_USER) || /[\r\n]/.test(env.CORREIOS_ACCESS_CODE)))) {
      throw new ClientError('FRETE_NAO_CONFIGURADO', 503);
    }
    if (env.SHIPPING_PACKAGES_CONFIRMED !== 'true') throw new ClientError('EMBALAGENS_NAO_CONFIRMADAS', 503);
    return { services, marginCents, timeout, version, automatic };
  }

  async function json(url, options, signal) {
    return gate(async () => {
      const response = await fetchImpl(url, { ...options, signal, redirect: 'error' });
      if (!response.ok) throw new CarrierError('CORREIOS_HTTP', response.status);
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CarrierError('CORREIOS_RESPONSE');
      return data;
    }, signal);
  }

  async function getToken(config, signal, rejected) {
    if (!config.automatic) return env.CORREIOS_BEARER_TOKEN;
    if (rejected && cachedToken?.token === rejected) cachedToken = undefined;
    if (cachedToken && cachedToken.expiresAt > now() + 60000) return cachedToken.token;
    if (!tokenPromise) {
      const body = { numero: env.CORREIOS_POSTING_CARD };
      if (env.CORREIOS_CONTRACT) Object.assign(body, { contrato: env.CORREIOS_CONTRACT, dr: Number(env.CORREIOS_DR) });
      tokenPromise = json(`${HOST}/token/v1/autentica/cartaopostagem`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${env.CORREIOS_USER}:${env.CORREIOS_ACCESS_CODE}`).toString('base64')}` }, body: JSON.stringify(body)
      }, signal).then(data => {
        const expiresAt = tokenExpiry(data);
        if (typeof data.token !== 'string' || !data.token || /\s/.test(data.token) || !Number.isFinite(expiresAt) || expiresAt <= now() + 60000) throw new CarrierError('CORREIOS_TOKEN_RESPONSE');
        cachedToken = { token: data.token, expiresAt };
        return data.token;
      }).finally(() => { tokenPromise = undefined; });
    }
    return tokenPromise;
  }

  async function authenticated(url, config, signal) {
    let token = await getToken(config, signal);
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await json(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }, signal); }
      catch (error) {
        if (error.status !== 401 || !config.automatic || attempt !== 0) throw error;
        token = await getToken(config, signal, token);
      }
    }
  }

  return async function calculateShipping(items, cep) {
    if (typeof cep !== 'string' || !POSTAL.test(cep)) throw new ClientError('CEP_INVALIDO');
    if (!Array.isArray(items) || !items.length || items.length > 30) throw new ClientError('DADOS_INVALIDOS');
    const config = settings();
    const packages = items.map(item => {
      const product = productLookup(item.productId);
      if (!product || !getVariant(product, item.variantId) || !product.sizes.includes(item.size) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new ClientError('ITEM_INVALIDO');
      return { name: product.name, quantity: item.quantity, dimensions: packageFor(product) };
    });
    const signal = AbortSignal.timeout(config.timeout);
    const options = await Promise.allSettled(config.services.map(async service => {
      try {
        // Reutiliza apenas consultas idênticas desta requisição. Cada unidade
        // continua sendo uma encomenda física separada, conforme a política.
        const prices = new Map();
        const lines = await Promise.all(packages.map(async parcel => {
          const params = new URLSearchParams({ cepOrigem: env.SHIPPING_ORIGIN_CEP, cepDestino: cep, ...parcel.dimensions });
          if (env.CORREIOS_CONTRACT) { params.set('nuContrato', env.CORREIOS_CONTRACT); params.set('nuDR', env.CORREIOS_DR); }
          const url = `${HOST}/preco/${config.version}/nacional/${service.code}?${params}`;
          if (!prices.has(url)) prices.set(url, authenticated(url, config, signal).then(data => {
            const cents = moneyToCents(data.pcFinal);
            if (cents === null || data.txErro || (data.coProduto && data.coProduto !== service.code)) throw new CarrierError('CORREIOS_PRICE_RESPONSE');
            return cents;
          }));
          const costCents = await prices.get(url) * parcel.quantity;
          if (!Number.isSafeInteger(costCents)) throw new CarrierError('CORREIOS_PRICE_RESPONSE');
          return { name: parcel.name, quantity: parcel.quantity, costCents };
        }));
        let days = null;
        try {
          const params = new URLSearchParams({ cepOrigem: env.SHIPPING_ORIGIN_CEP, cepDestino: cep });
          const data = await authenticated(`${HOST}/prazo/${config.version}/nacional/${service.code}?${params}`, config, signal);
          if (!data.txErro && (typeof data.prazoEntrega === 'number' || (typeof data.prazoEntrega === 'string' && /^\d+$/.test(data.prazoEntrega))) && (!data.coProduto || data.coProduto === service.code)) {
            const value = Number(data.prazoEntrega);
            if (Number.isInteger(value) && value >= 0 && value <= 365) days = value;
          }
        } catch (error) { logger.warn?.('shipping_deadline_unavailable', { service: service.id, code: error.code ?? 'CORREIOS_NETWORK' }); }
        const carrierCents = lines.reduce((sum, line) => sum + line.costCents, 0);
        if (!Number.isSafeInteger(carrierCents + config.marginCents)) throw new CarrierError('CORREIOS_PRICE_RESPONSE');
        return { serviceId: service.id, name: `Correios — ${service.id}`, days, carrierCents, marginCents: config.marginCents, totalCents: carrierCents + config.marginCents, lines };
      } catch (error) {
        logger.warn?.('shipping_quote_unavailable', { service: service.id, code: error.code ?? 'CORREIOS_NETWORK', ...(Number.isInteger(error.status) ? { status: error.status } : {}) });
        throw error;
      }
    }));
    const available = options.filter(result => result.status === 'fulfilled').map(result => result.value).sort((a, b) => a.totalCents - b.totalCents);
    if (!available.length) throw new ClientError('FRETE_INDISPONIVEL', 503);
    return { options: available, demo: false, note: 'Cotação dos Correios para envios separados: uma embalagem por unidade. Revalidar antes da postagem.' };
  };
}

export const calculateShipping = createShippingService();
export const __test = { moneyToCents, packageFor, tokenExpiry };
