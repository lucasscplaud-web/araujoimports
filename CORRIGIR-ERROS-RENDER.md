# ARAUJO IMPORTS — diagnóstico e correção para Render

## 1. PUBLIC_ORIGIN
O servidor agora usa `PUBLIC_ORIGIN` se configurado; caso contrário, `RENDER_EXTERNAL_URL`, fornecida pelo Render, e por fim localhost para desenvolvimento.

Configure explicitamente `PUBLIC_ORIGIN=https://teste-site-u1qb.onrender.com` caso o seu site esteja nesse domínio. Não inclua barra final. Se usar domínio personalizado, atualize o valor.

## 2. Cotação dos Correios
A cotação real só funciona com `SHIPPING_ORIGIN_CEP` (8 dígitos), `CORREIOS_BEARER_TOKEN` válido e acesso autorizado à API de preço/prazo dos Correios. Os valores de exemplo do HTML offline não são cotações reais. Se não existir credencial, a rota retorna `FRETE_NAO_CONFIGURADO` (HTTP 503). Se as credenciais existirem, mas a API recusar ou falhar, a rota retorna `FRETE_INDISPONIVEL` (HTTP 503).

## 3. Pré-pedido
`DATABASE_URL` precisa apontar para PostgreSQL funcional e o schema/tabelas precisam ter sido criados por `npm run db:migrate` e carga inicial por `npm run db:seed`.
- Sem DATABASE_URL: `PEDIDOS_INDISPONIVEIS` (503).
- Tabelas inexistentes ou DB sem conexão: erro interno (500); verifique os Logs do Render.
- Este é um pré-pedido demonstrativo e não cobra clientes, calcula impostos ou reserva estoque.

## 4. Outras variáveis
- `REDIS_URL`: serviço Redis/Key Value acessível no ambiente de produção.
- `TRUST_PROXY=1`: apenas se o serviço estiver atrás do proxy confiável único do Render; não defina livremente com base em headers externos.
- `NODE_ENV=production` deve continuar em produção.

## 5. Como diagnosticar via navegador
Abra DevTools (F12) -> Network -> Fetch/XHR. Clique em Calcular e veja a requisição `/api/shipping/quote`: código HTTP e JSON de resposta, sem enviar aqui tokens/credenciais. Repita para `/api/checkout/quote` e `/api/order-requests`.

## 6. Atualização do projeto
Atualize os arquivos no repositório GitHub conectado ao Render e execute um novo deploy. A visualização HTML offline não depende da API e usa valores fictícios.
