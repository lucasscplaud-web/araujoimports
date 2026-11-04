import { z } from 'zod';
import { storeConfig } from './catalog.config.js';

const variantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,64}$/),
  color: z.string().min(1).max(45),
  hex: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  image: z.string().regex(/^\/assets\/products\/[a-z0-9-]+\.(?:svg|png|jpe?g|webp)$/),
  priceCents: z.number().int().min(1).max(20_000_000).optional(),
  stockPerSize: z.number().int().min(0).max(100000)
}).strict();

const shippingSchema = z.object({
  width: z.number().positive().max(200),
  length: z.number().positive().max(200),
  height: z.number().positive().max(200),
  weight: z.number().positive().max(100)
}).strict();

const productSchema = z.object({
  shipping: shippingSchema,
  id: z.string().regex(/^[a-z0-9-]{2,64}$/),
  slug: z.string().regex(/^[a-z0-9-]{2,64}$/),
  name: z.string().min(2).max(90),
  kicker: z.string().max(100),
  category: z.string().min(2).max(60),
  description: z.string().max(900),
  tagline: z.string().max(120),
  priceCents: z.number().int().min(1).max(20_000_000),
  badge: z.string().max(20),
  featured: z.boolean(),
  sizes: z.array(z.string().min(1).max(8)).min(1).max(20),
  variants: z.array(variantSchema).min(1).max(20)
}).strict();

const configSchema = z.object({
  brand: z.string().min(1).max(40),
  shipping: z.object({ originPostalCode: z.string(), marginCents: z.number().int().min(0).max(10000) }).strict(),
  currency: z.literal('BRL'),
  announcement: z.string().max(120),
  categories: z.array(z.string().min(2).max(60)).max(30),
  products: z.array(productSchema).min(1).max(500)
}).strict();

const parsed = configSchema.parse(storeConfig);
const ids = new Set();
const slugs = new Set();
const variantIds = new Set();
for (const product of parsed.products) {
  if (ids.has(product.id) || slugs.has(product.slug)) throw new Error('IDs/slugs duplicados na configuração');
  if (!parsed.categories.includes(product.category)) throw new Error(`Categoria inválida: ${product.category}`);
  ids.add(product.id); slugs.add(product.slug);
  if (new Set(product.sizes).size !== product.sizes.length) throw new Error(`Tamanhos repetidos: ${product.id}`);
  for (const variant of product.variants) {
    if (variantIds.has(variant.id)) throw new Error(`Variante repetida: ${variant.id}`);
    variantIds.add(variant.id);
  }
}

// Apenas dados públicos necessários ao frontend; stockPerSize nunca é enviado.
export const publicProduct = (p) => ({
  id: p.id, slug: p.slug, name: p.name, category: p.category,
  kicker: p.kicker, description: p.description, tagline: p.tagline,
  priceCents: p.priceCents, badge: p.badge, featured: p.featured,
  sizes: [...p.sizes],
  variants: p.variants.map(({ id, color, hex, image, priceCents }) => ({ id, color, hex, image, priceCents }))
});
export const catalog = Object.freeze(parsed);
export const getProduct = (id) => catalog.products.find(p => p.id === id);
export const getProductBySlug = (slug) => catalog.products.find(p => p.slug === slug);
export const getVariant = (product, variantId) => product?.variants.find(v => v.id === variantId);
export function getPublicCatalog() {
  return {
    brand: catalog.brand, currency: catalog.currency,
    announcement: catalog.announcement,
    categories: catalog.categories,
    products: catalog.products.map(p => ({
      id: p.id, slug: p.slug, name: p.name, category: p.category,
      priceCents: p.priceCents, badge: p.badge, featured: p.featured,
      sizes: p.sizes, image: p.variants[0].image,
      variants: p.variants.map(({ id, color, hex, image, priceCents }) => ({ id, color, hex, image, priceCents }))
    }))
  };
}
