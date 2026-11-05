import { z } from 'zod';
import { getProduct, getVariant } from './catalog.js';

const itemSchema = z.object({
  productId: z.string().regex(/^[a-z0-9-]{2,64}$/),
  variantId: z.string().regex(/^[a-z0-9-]{2,64}$/),
  size: z.string().trim().min(1).max(8),
  quantity: z.number().int().min(1).max(10)
}).strict();

export const cartSchema = z.object({
  items: z.array(itemSchema).min(1).max(30)
}).strict();

export const orderRequestSchema = cartSchema.extend({
  contactName: z.string().trim().max(90).transform(s => s.normalize('NFC').replace(/ +/g, ' '))
    .pipe(z.string().min(2).max(90).regex(/^[\p{L}\p{M} .'-]+$/u).refine(s => /\p{L}/u.test(s))),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  idempotencyKey: z.uuid()
}).strict();

export class ClientError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export function resolveCart(rawItems) {
  const parsed = cartSchema.shape.items.safeParse(rawItems);
  if (!parsed.success) throw new ClientError('DADOS_INVALIDOS');
  const merged = new Map();
  for (const item of parsed.data) {
    const product = getProduct(item.productId);
    const variant = getVariant(product, item.variantId);
    if (!product || !variant || !product.sizes.includes(item.size)) throw new ClientError('ITEM_INVALIDO', 400);
    const sku = `${product.id}:${variant.id}:${item.size}`;
    const prev = merged.get(sku);
    const quantity = (prev?.quantity ?? 0) + item.quantity;
    if (quantity > 10) throw new ClientError('LIMITE_POR_ITEM', 400);
    merged.set(sku, {
      sku, productId: product.id, variantId: variant.id, size: item.size,
      name: product.name, variantName: variant.color, quantity,
      unitPriceCents: variant.priceCents ?? product.priceCents,
      lineCents: (variant.priceCents ?? product.priceCents) * quantity
    });
  }
  const items = [...merged.values()];
  const totalCents = items.reduce((acc, item) => acc + item.lineCents, 0);
  if (totalCents <= 0 || totalCents > 50_000_000) throw new ClientError('LIMITE_DE_PEDIDO', 400);
  return { items, subtotalCents: totalCents, totalCents, currency: 'BRL' };
}

// O hash deve ser calculado com linhas canonizadas para a idempotência ser estável.
export function canonicalOrderPayload({ items, contactName, email }) {
  return JSON.stringify({
    email, contactName,
    items: items.map(({ sku, quantity }) => ({ sku, quantity })).sort((a,b)=>a.sku.localeCompare(b.sku))
  });
}
