/**
 * CATÁLOGO SERVER-SIDE — EDITE AQUI.
 * Os preços estão em centavos (R$ 279,90 = 27990). Nunca use float.
 * Os caminhos de imagens apontam para /public/assets/products/.
 * Os estoques servem somente para a PRIMEIRA carga (`npm run db:seed`),
 * e NÃO substituem as quantidades efetivas no PostgreSQL.
 */
export const storeConfig = {
  brand: 'ARAUJO IMPORTS',
  currency: 'BRL',
  announcement: 'FRETE PARA TODO O BRASIL  /  NOVA COLEÇÃO 2026',
  categories: ['Tênis', 'Camisetas', 'Jaquetas', 'Moletons', 'Calças', 'Acessórios'],
  shipping: {
    originPostalCode: process.env.SHIPPING_ORIGIN_CEP || '',
    marginCents: 400, // R$ 4,00 adicionados uma única vez por pedido
  },
  products: [
    {
      id: 'arc-runner', slug: 'arc-runner', name: 'AIR MAX PLUS',
      kicker: 'TÊNIS / EDIÇÕES DE CORES', category: 'Tênis',
      shipping: { width: 36, length: 25, height: 14, weight: 0.9 },
      description: 'Tênis com opções preta e branca. Escolha sua cor e veja o preço próprio de cada modelo.',
      tagline: 'CONFORTO E ESTILO EM CADA PASSO.', priceCents: 48990,
      badge: 'NOVO', featured: true,
      sizes: ['38','39','40','41','42','43','44'],
      variants: [
        { id: 'air-max-black', color: 'Preto', hex: '#141414', image: '/assets/products/air-max-black.png', priceCents: 48990, stockPerSize: 12 },
        { id: 'air-max-white', color: 'Branco', hex: '#f3f0e8', image: '/assets/products/air-max-white.png', priceCents: 52990, stockPerSize: 10 }
      ]
    },
    {
      id: 'everyday-tee', slug: 'everyday-tee', name: 'Camiseta Oversized Essencial',
      kicker: 'CAMISETAS / OVERSIZED', category: 'Camisetas',
      shipping: { width: 25, length: 20, height: 4, weight: 0.25 },
      description: 'Camiseta oversized em algodão de estrutura macia. Um essencial de peso para a rotina.',
      tagline: 'CONFORTO EM PRIMEIRO LUGAR.', priceCents: 15990, badge: 'NOVO', featured: false,
      sizes: ['P','M','G','GG'],
      variants: [
        { id: 'tee-cream', color: 'Natural', hex: '#e5dfce', image: '/assets/products/tee-cream.svg', stockPerSize: 24 },
        { id: 'tee-black', color: 'Preto', hex: '#252628', image: '/assets/products/tee-black.svg', stockPerSize: 24 },
        { id: 'tee-blue', color: 'Azul', hex: '#647991', image: '/assets/products/tee-blue.svg', stockPerSize: 12 }
      ]
    },
    {
      id: 'motion-jacket', slug: 'motion-jacket', name: 'Jaqueta Urbana',
      kicker: 'JAQUETAS / URBANO', category: 'Jaquetas',
      shipping: { width: 35, length: 30, height: 12, weight: 1.0 },
      description: 'Jaqueta de corte contemporâneo, acabamento funcional e caráter urbano.',
      tagline: 'FEITO PARA ACOMPANHAR VOCÊ.', priceCents: 37990, badge: 'LIMITADO', featured: false,
      sizes: ['P','M','G','GG'],
      variants: [
        { id: 'jacket-graphite', color: 'Grafite', hex: '#3b3b40', image: '/assets/products/jacket-graphite.svg', stockPerSize: 8 },
        { id: 'jacket-sand', color: 'Areia', hex: '#bcae98', image: '/assets/products/jacket-sand.svg', stockPerSize: 8 }
      ]
    },
    {
      id: 'pulse-hoodie', slug: 'pulse-hoodie', name: 'Moletom Premium',
      kicker: 'MOLETONS / PREMIUM', category: 'Moletons',
      shipping: { width: 33, length: 28, height: 12, weight: 0.85 },
      description: 'Moletom de gramatura alta com capuz volumoso, proporção moderna e conforto absoluto.',
      tagline: 'ESTILO EM TODAS AS ESTAÇÕES.', priceCents: 29990, badge: '', featured: false,
      sizes: ['P','M','G','GG'],
      variants: [
        { id: 'hoodie-grey', color: 'Cinza', hex: '#aeb1ac', image: '/assets/products/hoodie-grey.svg', stockPerSize: 19 },
        { id: 'hoodie-black', color: 'Preto', hex: '#24252a', image: '/assets/products/hoodie-black.svg', stockPerSize: 20 }
      ]
    },
    {
      id: 'urban-cargo', slug: 'urban-cargo', name: 'Calça Cargo Urbana',
      kicker: 'CALÇAS / CARGO', category: 'Calças',
      shipping: { width: 30, length: 24, height: 9, weight: 0.65 },
      description: 'Calça utilitária com bolsos estruturados e modelagem reta de caimento solto.',
      tagline: 'FEITO PARA A CIDADE.', priceCents: 26990, badge: '', featured: false,
      sizes: ['38','40','42','44','46'],
      variants: [
        { id: 'cargo-dark', color: 'Preto', hex: '#292b2d', image: '/assets/products/cargo-dark.svg', stockPerSize: 14 },
        { id: 'cargo-olive', color: 'Verde-oliva', hex: '#78795b', image: '/assets/products/cargo-olive.svg', stockPerSize: 12 }
      ]
    },
    {
      id: 'studio-cap', slug: 'studio-cap', name: 'Boné Clássico',
      kicker: 'ACESSÓRIOS / BONÉS', category: 'Acessórios',
      shipping: { width: 20, length: 20, height: 12, weight: 0.3 },
      description: 'Boné estruturado em sarja, aba curva, identidade discreta e ajuste confortável.',
      tagline: 'COMPLETE SEU VISUAL.', priceCents: 11990, badge: 'NOVO', featured: false,
      sizes: ['Único'],
      variants: [
        { id: 'cap-black', color: 'Preto', hex: '#292929', image: '/assets/products/cap-black.svg', stockPerSize: 36 },
        { id: 'cap-red', color: 'Vermelho', hex: '#c93b3b', image: '/assets/products/cap-red.svg', stockPerSize: 30 }
      ]
    },
    {
      id: 'arc-runner-02', slug: 'arc-runner-02', name: 'Tênis Runner 02',
      kicker: 'TÊNIS / ESPORTIVO', category: 'Tênis',
      shipping: { width: 36, length: 25, height: 14, weight: 0.9 },
      description: 'O retorno de um clássico contemporâneo, com cores intensas e tração para novos caminhos.',
      tagline: 'SEMPRE EM MOVIMENTO.', priceCents: 52990, badge: 'DROP 02', featured: false,
      sizes: ['38','39','40','41','42','43','44'],
      variants: [
        { id: 'arc2-blue', color: 'Azul-claro', hex: '#66b6f0', image: '/assets/products/arc-blue.svg', stockPerSize: 8 },
        { id: 'arc2-red', color: 'Vermelho', hex: '#e32d2f', image: '/assets/products/arc-red.svg', stockPerSize: 8 }
      ]
    },
    {
      id: 'daily-tee', slug: 'daily-tee', name: 'Camiseta Básica',
      kicker: 'CAMISETAS / BÁSICAS', category: 'Camisetas',
      shipping: { width: 25, length: 20, height: 4, weight: 0.25 },
      description: 'Uma camiseta para todos os momentos. Design depurado, qualidade no toque.',
      tagline: 'ESTILO TODOS OS DIAS.', priceCents: 13990, badge: '', featured: false,
      sizes: ['P','M','G','GG'],
      variants: [
        { id: 'daily-black', color: 'Preto', hex: '#252628', image: '/assets/products/tee-black.svg', stockPerSize: 26 },
        { id: 'daily-cream', color: 'Bege', hex: '#e5dfce', image: '/assets/products/tee-cream.svg', stockPerSize: 26 }
      ]
    },
    {
      id: 'layer-jacket', slug: 'layer-jacket', name: 'Jaqueta Casual',
      kicker: 'JAQUETAS / COLEÇÃO 01', category: 'Jaquetas',
      shipping: { width: 35, length: 30, height: 12, weight: 1.0 },
      description: 'Construção refinada e estética atemporal. A sobreposição definitiva.',
      tagline: 'LIBERDADE PARA SE VESTIR.', priceCents: 40990, badge: '', featured: false,
      sizes: ['P','M','G','GG'],
      variants: [
        { id: 'layer-sand', color: 'Areia', hex: '#bcae98', image: '/assets/products/jacket-sand.svg', stockPerSize: 7 },
        { id: 'layer-dark', color: 'Preto', hex: '#3b3b40', image: '/assets/products/jacket-graphite.svg', stockPerSize: 7 }
      ]
    }
  ]
};
