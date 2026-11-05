# ARAUJO IMPORTS

E-commerce em HTML, CSS e JavaScript, com Node.js 20+, Express 5, PostgreSQL e Redis. O catálogo, os preços individuais por variação, os tamanhos por produto e as animações de troca de cores ficam preservados.

O fluxo registra **pré-pedidos `REQUESTED`**: não cobra, não reserva estoque, não compra frete e não gera etiquetas. A cotação dos Correios é informativa e independente do registro do pré-pedido.

## Desenvolvimento local

```sh
npm ci
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

No PowerShell, copie com `Copy-Item .env.example .env`. Abra [localhost:3000](http://localhost:3000). O Docker é opcional se PostgreSQL/Redis já estiverem disponíveis. Sem `DATABASE_URL`, somente em desenvolvimento, catálogo e carrinho continuam acessíveis; pré-pedidos ficam indisponíveis. Sem Redis, apenas em desenvolvimento, o limite usa memória.

`npm run preview` abre uma prévia local sem dependências npm em [127.0.0.1:3000](http://127.0.0.1:3000). Ela preserva preços por variação, mas não grava pedidos, não verifica estoque e não fornece fretes fictícios.

## Banco de dados

`npm run db:migrate` executa migrações versionadas, idempotentes e transacionais. A tabela `public.schema_migrations` registra versões e checksums; um advisory lock serializa execuções concorrentes. Não altere migrações já aplicadas: adicione uma nova versão.

As consultas usam estas tabelas no schema `public`:

| Tabela | Finalidade e integridade |
| --- | --- |
| `inventory` | SKU por produto/variação/tamanho, identidade única e quantidade não negativa. |
| `order_requests` | Contato, hash, chave UUID única, status, moeda e total calculado no servidor. |
| `order_request_items` | Snapshot das linhas; FK para o pedido, índices e limites comerciais. |

A ausência de qualquer uma dessas tabelas provoca `42P01` nas consultas correspondentes. A migração inicial cria as ausentes e adota o schema original; a segunda acrescenta constraints e índice de itens por pedido. Dados incompatíveis abortam a transação para revisão administrativa, sem apagar ou corrigir registros silenciosamente. O banco de produção não foi consultado para determinar quais relações faltam naquela instalação.

A aplicação verifica schema e versões antes de escutar HTTP; **não migra nem popula o banco automaticamente**. O seed é um comando separado, transacional, que insere somente SKUs ausentes sem sobrescrever estoque. `stockPerSize` do catálogo é uma carga inicial, não estoque real. Em produção, só execute seed após conferir quantidades reais e autorizar a operação explicitamente.

Pré-pedidos validam estoque em lote, com locks de leitura durante a transação. Pedidos e linhas são gravados atomicamente. Retentativas da mesma chave são serializadas; payload diferente resulta em conflito. Como não existe reserva, disponibilidade pode mudar após a solicitação.

## Variáveis de ambiente

Use [.env.example](.env.example). Nunca publique `.env`, URLs com credenciais ou tokens.

| Variável | Uso/padrão |
| --- | --- |
| `NODE_ENV` | `development` local; `production` exige PostgreSQL, Redis, origem HTTPS e proxy explícito. |
| `PORT` | `3000`; no Render, mantenha o valor fornecido pela plataforma. |
| `PUBLIC_ORIGIN` | Origem exata do site. Sem valor usa `RENDER_EXTERNAL_URL` no Render; localmente `http://localhost:PORT`. |
| `RENDER_EXTERNAL_URL` | Fornecida pelo Render; fallback da origem pública. Domínio personalizado exige `PUBLIC_ORIGIN` correspondente. |
| `TRUST_PROXY` | Inteiro de `0` a `8`. `0` significa acesso direto; obrigatório explicitamente em produção. Para proxy, use a quantidade verificada de saltos até o IP confiável do cliente. |
| `TRUSTED_PROXY_CIDRS` | IPs/CIDRs explícitos dos proxies conhecidos, separados por vírgula; obrigatório com `TRUST_PROXY>0`. Sem redes universais ou aliases amplos. |
| `DATABASE_URL` | Conexão PostgreSQL; obrigatória em produção. |
| `DB_POOL_SIZE` | Inteiro `1..100`, padrão `10`. Divida o orçamento de conexões entre todas as instâncias. |
| `PG_SSL` | `true` força TLS com certificado/hostname verificados, inclusive sobre opções conflitantes da URL; ausente usa a configuração do driver/URL. Nunca desabilite verificação de certificado para contornar erro. |
| `REDIS_URL` | Redis/Render Key Value para limites distribuídos; obrigatório em produção. Falha do store não libera requisições. |
| `ALLOW_PRODUCTION_SEED` | Padrão desabilitado; `true` só para uma carga manual de estoque autorizada. Nunca no comando de start/build. |
| `PREVIEW_PORT` | `3000`, somente para a prévia local. |
| `SHIPPING_ORIGIN_CEP` | CEP real de origem, oito dígitos. |
| `SHIPPING_MARGIN_CENTS` | `400` (R$ 4,00) uma vez por pedido/opção; inteiro `0..10000`, exclusivo do servidor. |
| `SHIPPING_PACKAGES_CONFIRMED` | Padrão desabilitado; `true` após medir cada unidade embalada e confirmar despacho separado por unidade. |
| `CORREIOS_USER` | Usuário idCorreios, para renovação automática. |
| `CORREIOS_ACCESS_CODE` | Código de acesso das APIs CWS, exclusivo do servidor. |
| `CORREIOS_POSTING_CARD` | Cartão de postagem para autenticação automática; exige as duas variáveis anteriores. |
| `CORREIOS_BEARER_TOKEN` | Alternativa às três credenciais automáticas; operador deve renovar o token estático. |
| `CORREIOS_CONTRACT`, `CORREIOS_DR` | Par opcional, ambos necessários se informado; confira os dados do contrato. |
| `CORREIOS_SERVICES` | `PAC,SEDEX`; habilite somente modalidades permitidas no contrato. |
| `CORREIOS_PAC_CODE`, `CORREIOS_SEDEX_CODE` | `03298`, `03220`; substitua pelos códigos autorizados para o contrato. |
| `CORREIOS_API_VERSION` | `v1`; `v3` somente após conferir endpoints no CWS do contrato. |
| `CORREIOS_TIMEOUT_MS` | `12000`, limite total `1000..30000` ms por cotação. |

Detalhes de autenticação, embalagem e limites estão em [LEIA-ME-CORREIOS.md](LEIA-ME-CORREIOS.md). As dimensões incluídas no projeto eram provisórias: sem confirmação física não são apresentadas como uma cotação válida.

## API e segurança

| Método | Rota | Comportamento |
| --- | --- | --- |
| GET | `/api/catalog` | Catálogo público, sem estoque interno. |
| GET | `/api/products/:slug` | Produto, variações e tamanhos próprios. |
| POST | `/api/checkout/quote` | Recalcula preço e verifica disponibilidade. |
| POST | `/api/shipping/quote` | Consulta real dos Correios para todos os volumes. |
| POST | `/api/order-requests` | Registra pré-pedido, sem cobrança/reserva. |
| GET | `/api/health` | Processo HTTP vivo. |
| GET | `/api/ready` | Prontidão do banco/schema e Redis, sem detalhes internos. |

POST exige JSON e `Origin` igual à origem pública. O navegador envia somente IDs, tamanho e quantidade; no pré-pedido, nome, e-mail e chave UUID. Campos de preço extras são rejeitados. O resolver e a persistência também reconstroem todos os dados comerciais a partir do catálogo. Queries são parametrizadas e tabelas explicitamente qualificadas com `public`.

O rate limiter mantém validações ativas, agrupa IPv6 e usa stores Redis distintos por limite. A confiança exige quantidade **e** endereço dos proxies, e a cadeia é validada antes do limite. Prefixos de IP falsificados à esquerda são ignorados; conexão direta que tenta se passar por proxy é recusada. Veja [o procedimento de validação no Render](CORRIGIR-ERROS-RENDER.md).

Helmet/CSP, limite de corpo, validação estrita e same-origin continuam ativos. Erros públicos são genéricos, com `X-Request-Id` para correlação. Logs não contêm corpo, contato, IP, SQL, URLs de banco ou token. Frete público mostra total e volumes; a margem interna permanece no backend. Ajuste retenção e controle de acesso dos logs em produção.

## Catálogo e manutenção

Edite `server/catalog.config.js`: cada produto mantém `sizes` e cada variação pode sobrescrever `priceCents`. Valores são inteiros em centavos. Imagens locais SVG/PNG/JPG/WebP ficam em `public/assets/products`. Use somente SVG confiável. Os campos `shipping` devem medir uma unidade **já embalada**, incluindo proteção e peso bruto; não são medidas apenas do produto.

`server/app.js` contém a aplicação testável; `server/index.js` configura infraestrutura e encerramento; `server/db.js` concentra persistência; `server/migrations.js` mantém o contrato do schema; `server/shipping.js` integra o provedor. A UI continua em `public`, sem acesso aos módulos internos.

## Verificações

```sh
npm run check
npm test
npm audit --omit=dev
```

Os testes cobrem proxy/IP falsificado, limite IPv4/IPv6, validação HTTP, preços/estoque/idempotência, `42P01`, migrações e rollback em PostgreSQL local WASM (PGlite), integração HTTP com persistência e Correios com respostas controladas. Fixtures de tarifas existem somente nos testes.

PGlite não substitui ensaio de concorrência entre conexões reais. Credenciais/contrato dos Correios, medidas físicas, ingress real do Render, PostgreSQL e Redis de produção exigem validação operacional separada. Nenhum comando de deploy, migração de produção, pagamento ou merge faz parte dos testes. O workflow CI executa testes em Node 20/22/24 sem segredos ou deploy.
