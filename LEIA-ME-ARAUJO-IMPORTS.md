# ARAUJO IMPORTS — atualização

## Catálogo
Abra `server/catalog.config.js`: `name`, `category`, `sizes`, `variants[].priceCents`, `variants[].image` e `shipping` por produto.

- Tênis: números 38–44 (definidos no produto).
- Camisetas, jaquetas, moletons: P, M, G, GG.
- Calças: numeração própria.
- Bonés: Único.

## Frete real
A rota `POST /api/shipping/quote` recebe `{cep,items}` e recalcula as quantidades e preço do carrinho no servidor. Cada linha SKU (produto/variante/tamanho) é cotada separadamente com sua quantidade. Somamos serviços da mesma transportadora, sem inventar valores. O cálculo por linha pode ser mais caro que enviar tudo em um pacote; é o modelo solicitado.

Configure `.env` com `SHIPPING_ORIGIN_CEP`, `CORREIOS_BEARER_TOKEN` e `CORREIOS_SERVICES=PAC,SEDEX`. Consulte `LEIA-ME-CORREIOS.md` para pré-requisitos de contrato e permissões nas APIs oficiais. Em produção, revalide frete no fluxo de pagamento, persista a escolha do serviço e a cotação vinculada ao pedido e valide a geração de etiquetas. **O pré-pedido existente não cobra nem reserva frete ou estoque; não disponibilize checkout de pagamento antes dessas etapas.**

O endpoint consulta cada linha em paralelo e tem limite de requisições. Exige token; sem configuração, devolve `FRETE_NAO_CONFIGURADO`. As dimensões são exemplos: configure medidas/peso reais por produto.

## Prévia HTML
A prévia offline usa **valores fictícios e claramente rotulados** porque não há backend/transportadora. Não os use para cobrar clientes.


ATUALIZAÇÃO CORREIOS: consulte LEIA-ME-CORREIOS.md (site completo) / LEIA-ME-CORREIOS.txt (offline). O Melhor Envio foi substituído pelo adaptador dos Correios.
