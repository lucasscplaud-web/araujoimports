import { getProduct, getVariant, catalog } from './catalog.js';
import { ClientError } from './validation.js';

// Apenas o servidor fala com o serviço de preço e prazo dos Correios.
const POSTAL = /^\d{8}$/;
const API_PRICE = 'https://api.correios.com.br/preco/v1/nacional';
const API_DEADLINE = 'https://api.correios.com.br/prazo/v1/nacional';
const SERVICES = Object.freeze({
  PAC: { name: 'PAC', code: '03298' },
  SEDEX: { name: 'SEDEX', code: '03220' }
});

function moneyToCents(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const val = String(raw).trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(val) && !/^\d+(?:\.\d{1,2})?$/.test(val)) return null;
  const normalized = val.includes(',') ? val.replaceAll('.', '').replace(',', '.') : val;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

async function correiosGet(url, token) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`CORREIOS_HTTP_${response.status}`);
  return response.json();
}

function queryForLine(product, cep, code) {
  const {width, height, length, weight} = product.shipping;
  const params = new URLSearchParams({
    cepOrigem: process.env.SHIPPING_ORIGIN_CEP,
    cepDestino: cep,
    psObjeto: String(Math.max(1, Math.ceil(weight * 1000))), // kg -> gramas
    tpObjeto: '2',
    comprimento: String(length), largura: String(width), altura: String(height)
  });
  return `${API_PRICE}/${code}?${params}`;
}

async function priceForLine(item, destination, service, token) {
  const product = getProduct(item.productId);
  const variant = getVariant(product, item.variantId);
  if (!product || !variant) throw new ClientError('ITEM_INVALIDO');
  const data = await correiosGet(queryForLine(product, destination, service.code), token);
  const unitCents = moneyToCents(data.pcFinal);
  if (unitCents === null || data.txErro) throw new Error('CORREIOS_COTACAO_INVALIDA');
  // Política temporária: cada unidade equivale a uma encomenda independente.
  // Multiplicação explicita a quantidade; não supõe consolidação de pacotes.
  return {
    name: item.name, quantity: item.quantity,
    costCents: unitCents * item.quantity
  };
}

async function deadlineForService(destination, service, token) {
  const params = new URLSearchParams({
    cepOrigem: process.env.SHIPPING_ORIGIN_CEP, cepDestino: destination
  });
  const data = await correiosGet(`${API_DEADLINE}/${service.code}?${params}`, token);
  const days = Number(data.prazoEntrega);
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : null;
}

export async function calculateShipping(items, cep) {
  if (!POSTAL.test(cep)) throw new ClientError('CEP_INVALIDO');
  const token = process.env.CORREIOS_BEARER_TOKEN;
  if (!POSTAL.test(process.env.SHIPPING_ORIGIN_CEP || '') || !token)
    throw new ClientError('FRETE_NAO_CONFIGURADO', 503);
  if (items.length < 1 || items.length > 30) throw new ClientError('DADOS_INVALIDOS');

  const enabled = (process.env.CORREIOS_SERVICES || 'PAC,SEDEX')
    .split(',').map(s=>s.trim().toUpperCase()).filter(s=>SERVICES[s]);
  const uniqueServices = [...new Set(enabled)];
  if (!uniqueServices.length) throw new ClientError('FRETE_NAO_CONFIGURADO', 503);

  const marginCents = catalog.shipping.marginCents;
  const results = await Promise.allSettled(uniqueServices.map(async id => {
    const service = SERVICES[id];
    // Cota uma linha por vez para controlar a relação SKU / quantidade e atribuir erro correto.
    // Uma linha tem dimensão e peso definidos no catálogo, nunca recebidos do browser.
    const lines = [];
    for (const line of items) lines.push(await priceForLine(line, cep, service, token));
    // O prazo é informativo: se indisponível, não inventar tempo de entrega.
    let days = null;
    try { days = await deadlineForService(cep, service, token); } catch { /* prazo não disponível */ }
    const carrierCents = lines.reduce((sum, line) => sum + line.costCents, 0);
    return {
      serviceId:id, name:`Correios — ${service.name}`, days,
      carrierCents, marginCents, totalCents: carrierCents + marginCents, lines
    };
  }));
  const options = results.filter(r=>r.status === 'fulfilled').map(r=>r.value)
    .sort((a,b)=>a.totalCents-b.totalCents);
  if (!options.length) throw new ClientError('FRETE_INDISPONIVEL', 503);
  return { options, demo:false, note:'Cotação temporária: cada unidade é orçada separadamente. Margem de R$ 4,00 por pedido; medidas provisórias.' };
}

export const __test = { moneyToCents };
