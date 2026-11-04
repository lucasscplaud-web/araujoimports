# ARAUJO IMPORTS — Cotação pelos Correios

## Modo real (backend)
O módulo `server/shipping.js` usa as APIs oficiais de Preço e Prazo dos Correios.
A documentação oficial exige contrato com os Correios, acesso liberado à API Preços (serviço 38202) e à API Prazos (38210), e credenciais/tokens válidos.

No `.env` configure:
```
SHIPPING_ORIGIN_CEP=00000000
CORREIOS_BEARER_TOKEN=TOKEN_VALIDO_DOS_CORREIOS
CORREIOS_SERVICES=PAC,SEDEX
```
Os códigos PAC 03298 e SEDEX 03220 estão no adaptador. Verifique os códigos habilitados para seu contrato.
O token é mantido EXCLUSIVAMENTE no servidor. A integração atual espera um token válido;
antes de ir a produção, implemente renovação automática de token conforme o manual oficial.

Margem temporária de R$4,00: `server/catalog.config.js`, `shipping.marginCents: 400`.
A margem é aplicada uma vez por opção de frete/pedido, não em cada produto.
Cada linha utiliza `shipping: { width, length, height, weight }`, com medidas em cm e peso em kg.
As medidas atuais são provisórias e não garantem a cotação exata. Cada unidade é cotada como
uma encomenda independente, multiplicada pela quantidade. Quando as embalagens forem medidas,
implemente uma política de empacotamento real (consolidação, peso cúbico, limites dos Correios).

**ATENÇÃO:** o endpoint fornece apenas estimativa. `order-requests` registra um pré-pedido sem cobrança;
não grava a cotação como valor final em pagamento nem faz etiqueta/postagem. Quando criar checkout,
revalide no servidor o CEP, modalidade, conteúdo, preço e estoque.

## Prévia HTML
A versão offline usa valores fictícios identificados como SIMULAÇÃO PAC/SEDEX + R$4,00 por pedido.
Não consulta os Correios e não deve ser usada para cobrar frete.

Documentação: https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1
https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo
