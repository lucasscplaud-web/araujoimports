# ARAUJO IMPORTS STORE — HTML + CSS + JavaScript + Node.js

E-commerce independente inspirado em duas referências visuais:
- Catálogo editorial claro com grade, filtros de categoria/tamanho/cor/preço, busca e ordenação;
- Página de produto escura, imagem principal gigante, cores/tamanhos, variações, e animação cruzada (uma imagem **sobe**, outra **entra por baixo**).

## Stack

- **Frontend:** HTML5, CSS3, JavaScript ES Modules, sem frameworks de UI;
- **Backend:** Node.js 20+ e Express 5;
- **Configuração:** `server/catalog.config.js` (não acessível como arquivo estático);
- **Banco:** PostgreSQL, driver `pg` com **parâmetros vinculados**;
- **Proteções:** Helmet/CSP, Zod, rate limiting no Redis em produção, requisições same-origin e mensagens de erro genéricas;
- **Imagens:** SVG autorais incluídos em `public/assets/products`, sem dependência de terceiros.

## Prévia imediata do site (sem npm, sem banco de dados)

Se você só quiser visualizar o catálogo, as animações, a sacola e a cotação local, rode:

```bash
node scripts/preview.mjs
```

Abra **http://127.0.0.1:3000**. Essa prévia de desenvolvimento **não registra pedidos nem processa pagamentos** e escuta somente no próprio computador.

## Iniciando no computador

**Pré-requisitos:** Node.js 20+, npm. Para registrar pré-pedidos: Docker Desktop ou PostgreSQL + Redis instalados.

```bash
npm install
cp .env.example .env
```

No Windows (CMD), use `copy .env.example .env`.

### Somente testar o visual / carrinho

Remova ou deixe vazia a variável `DATABASE_URL` no `.env` caso não tenha PostgreSQL. O catálogo, filtros, animações, carrinho e cotação continuarão operando; o envio de pré-pedido ficará desativado.

```bash
npm run dev
```

Acesse **http://localhost:3000**.

### Habilitando solicitações de pedido

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

O `db:seed` usa `stockPerSize` somente para **inserir SKUs ainda ausentes**; não sobrescreve estoque existente.

> **Importante:** Este projeto registra **pré-pedidos** (status `REQUESTED`), sem pagamento, sem frete e sem reserva de estoque. Não afirma que um pedido está pago ou confirmado. Um e-commerce de produção requer gateway de pagamento, callbacks/webhooks assinados, expiração de reserva, cálculo de frete, impostos, devoluções e fluxo administrativo.

## Cadastrar produto pela config

Abra `server/catalog.config.js`, dentro de `products`. Exemplo:

```js
{
  id: 'meu-tenis',
  slug: 'meu-tenis',
  name: 'MEU TÊNIS',
  kicker: 'RUNNING / STREET',
  category: 'Tênis',
  description: 'Descrição do produto.',
  tagline: 'MOVE THE WORLD.',
  priceCents: 29990,      // R$ 299,90
  badge: 'NEW',
  featured: true,
  sizes: ['39', '40', '41', '42'],
  variants: [
    {
      id: 'meu-tenis-vermelho',
      color: 'Vermelho',
      hex: '#ed3239',
      image: '/assets/products/meu-tenis-vermelho.svg',
      stockPerSize: 10
    }
  ]
}
```

Coloque a imagem em `public/assets/products/meu-tenis-vermelho.svg`. Ao adicionar outra variante, ela aparecerá como miniatura e poderá ser selecionada, com a animação de troca. **Para preservar a fluidez**, use imagens com transparência e enquadramento/posição similares nas variantes do mesmo produto. O validador restringe imagens a arquivos locais SVG, PNG, JPG/JPEG e WebP em `public/assets/products/`, evitando URLs arbitrárias ou protocolos perigosos. Use SVG apenas se for um arquivo confiável; para imagens enviadas por clientes, prefira conversão para WebP/PNG com verificação de conteúdo.

Para incorporar novas quantidades de estoque ao PostgreSQL execute novamente `npm run db:seed` (ele não altera SKUs já existentes). Para alterar estoque existente, crie uma operação administrativa autenticada ou atualize o banco sob controle administrativo. A quantia do `stockPerSize` em JS **não** substitui o estoque do banco durante solicitações.

## Estrutura

```text
avant-store/
├── public/
│   ├── index.html                 # HTML principal e templates visuais
│   ├── css/style.css             # Catálogo, produto, animações, responsividade
│   ├── js/app.js                 # SPA vanilla, busca, filtros, rotas, sacola, checkout
│   └── assets/products/*.svg     # Imagens locais por cor
├── server/
│   ├── catalog.config.js         # CADASTRO: produto, imagem, preço, categoria, variante
│   ├── catalog.js                # Validação da config e projeção pública
│   ├── validation.js             # Schemas de entrada + cálculo server-side
│   ├── db.js                     # PostgreSQL parametrizado e transações
│   └── index.js                  # HTTP, segurança, rotas e tratamento de erro
├── sql/schema.sql               # Schema idempotente
├── scripts/migrate.js           # Criar tabelas
├── scripts/seed.js              # Inserir inventário inicial
├── scripts/generate_assets.py   # Recriar SVGs demonstrativos
├── tests/catalog.test.js        # Testes de validação
├── docker-compose.yml           # PostgreSQL e Redis locais
├── .env.example
└── package.json
```

## Rotas HTTP

| Método | Rota | Retorno |
| --- | --- | --- |
| GET | `/api/catalog` | Resumo público mínimo de produtos |
| GET | `/api/products/:slug` | Detalhes públicos de **um** produto |
| POST | `/api/checkout/quote` | Itens e cotação recalculados **no servidor** |
| POST | `/api/order-requests` | Registra **pré-pedido**, sem pagamento |
| GET | `/api/health` | Status básico do processo |

Os POSTs aceitam JSON estrito com `Origin` do site. A resposta do servidor não contém segredos, quantidades detalhadas de estoque, rastreamento de erros nem a configuração integral.

## Modelo de segurança

- **Não há como impedir inspeção de HTML, CSS, JS, imagens, nomes e preços públicos**: todos são necessários ao navegador. Não exponha chaves, credenciais, custo interno, margem, tokens administrativos nem dados de outras pessoas.
- O cliente envia apenas `productId`, `variantId`, `size`, `quantity` e, no pré-pedido, os dados de contato. Qualquer campo extra inesperado é rejeitado por Zod.
- O backend **ignora preços do navegador** e resolve ID/variante/tamanho/preço diretamente em `server/catalog.config.js`.
- Usamos `$1`, `$2`, ... nas queries PostgreSQL. **Não** há interpolação de valores do usuário na query.
- O `Origin` é validado nas rotas POST. O proxy reverso deve fixar o host e encaminhar apenas cabeçalhos confiáveis. Não habilite CORS amplo.
- CSP de `helmet` bloqueia scripts/estilos de terceiros, inline script, iframes e destinos não permitidos. Conteúdos dinâmicos no frontend usam `textContent` e DOM APIs, sem interpretar conteúdo como HTML não confiável.
- O rate limiting em instâncias múltiplas requer Redis; sem `REDIS_URL` o servidor **não inicia em produção**. Em desenvolvimento, há fallback em memória.
- O identificador do cliente é extraído pela configuração `TRUST_PROXY` do Express; não habilite proxy confiável para todos sem controle sobre a camada de ingress.
- Idempotência em `order-requests` evita registros duplicados por reenvio (UUID), verificando hash do payload para impedir reaproveitamento indevido da mesma chave com conteúdo diferente.
- O pedido é apenas uma solicitação: **não reserva estoque e não captura pagamento**. Validação de disponibilidade no momento do pedido é informativa e pode mudar em seguida.
- Logs omitem PII/stack trace; mensagens genéricas chegam ao cliente. Configure logs seguros, mascaramento e retenção limitada em produção.

## Escalabilidade e produção

Este projeto é uma **base arquitetural**, não uma certificação de segurança nem um checkout pronto para transacionar dinheiro.

Antes de publicar, você deve:

1. Implantar **HTTPS** no proxy/reverse proxy, ajustar `PUBLIC_ORIGIN` para a URL real e definir `TRUST_PROXY` apenas para a topologia conhecida.
2. Usar credenciais reais/rotacionadas para PostgreSQL e Redis com redes privadas, backups, limites de conexão e métricas.
3. Integrar um provedor de pagamentos com checkout hospedado, assinatura de webhook, conferência do estado do pagamento do lado do servidor, idempotência no provedor e gestão de expiração/estorno.
4. Criar autenticação administrativa com MFA e RBAC, sem credenciais embutidas no frontend. Log de auditoria para mudanças de catálogo e estoque.
5. Adicionar termos, política de privacidade, base legal LGPD, frete, devolução, antifraude, monitoramento e notificações.
6. Executar testes E2E no navegador, testes concorrentes/estresse, revisão de dependências (`npm audit`) e análises DAST/SAST antes do go-live.
7. Para grandes catálogos, migrar a configuração para uma tabela administrada no banco e expor apenas views públicas filtradas/paginadas; colocar CDN na frente de assets imutáveis e cache para catálogo.

### Comandos

```bash
npm test          # testes de validação (após npm install)
npm run dev       # servidor com reinício automático
npm start         # servidor sem watch
```

## Preço individual por cor

Edite `server/catalog.config.js`, no array `variants` de cada produto:

```js
{ id: 'air-max-black', color: 'Preto', priceCents: 48990, /* ... */ },
{ id: 'air-max-white', color: 'Branco', priceCents: 52990, /* ... */ }
```

`priceCents` em variante é opcional: sem ele, usa-se o valor base do produto.
No backend, a cotação e o pedido usam o preço da variação selecionada,
resolvido exclusivamente no servidor; valores enviados pelo navegador são ignorados.

A versão offline possui dados demonstrativos no `js/offline-data.js`.


ATUALIZAÇÃO CORREIOS: consulte LEIA-ME-CORREIOS.md (site completo) / LEIA-ME-CORREIOS.txt (offline). O Melhor Envio foi substituído pelo adaptador dos Correios.
