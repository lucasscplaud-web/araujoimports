# ARAUJO IMPORTS — Cotação pelos Correios

O backend consulta exclusivamente as APIs oficiais; não há tabela de tarifas nem fallback fictício. O pré-pedido continua sem cobrança, reserva, etiqueta ou postagem. O frete é informativo e precisa ser revalidado antes de uma futura venda.

## Contrato e autenticação

É necessário ter contrato ativo e permissões de Preço/Prazo liberadas no CWS. Os parâmetros de consulta são CEPs, peso em gramas e medidas em centímetros; informar contrato exige DR. Confira a habilitação e os códigos no seu contrato. [Manual Preço](https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1), [Manual Prazo](https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo).

Preferencialmente configure renovação automática pelo cartão de postagem:

```dotenv
CORREIOS_USER=
CORREIOS_ACCESS_CODE=
CORREIOS_POSTING_CARD=
# Par opcional, mas ambos são necessários se informado:
CORREIOS_CONTRACT=
CORREIOS_DR=
```

`CORREIOS_ACCESS_CODE` é o código de acesso das APIs criado no CWS. Não use a senha do site. As três primeiras variáveis são um conjunto obrigatório nesse modo; configuração parcial é rejeitada. O token fica apenas na memória do servidor, compartilhado entre requisições, e renova 60 segundos antes do vencimento. Em HTTP 401 há uma única renovação e uma nova tentativa. A validade é lida de `exp` do JWT ou `expiraEm` com fuso explícito; validade desconhecida é rejeitada. O endpoint usa Basic conforme o [Manual Token](https://www.correios.com.br/atendimento/developers/manuais/manual-uso-da-api-token).

Como alternativa, deixe as três credenciais acima vazias e forneça `CORREIOS_BEARER_TOKEN`. Nesse modo, a renovação é responsabilidade do operador; token expirado não recebe fallback nem gera tarifa. Credenciais automáticas completas têm prioridade sobre o token estático. Nunca publique esses valores no Git, frontend ou logs.

## Demais variáveis

| Variável | Padrão e finalidade |
| --- | --- |
| `SHIPPING_ORIGIN_CEP` | Obrigatória; CEP de origem real com 8 dígitos. |
| `SHIPPING_MARGIN_CENTS` | `400`, isto é, R$ 4,00 adicionados uma vez ao total de cada opção de frete/pedido. Inteiro entre 0 e 10000. |
| `SHIPPING_PACKAGES_CONFIRMED` | Desabilitado por padrão. Defina `true` somente após confirmar as medidas e a política de embalagem descritas abaixo. |
| `CORREIOS_SERVICES` | `PAC,SEDEX`; lista estrita das modalidades que o contrato permite. Valores desconhecidos são erro de configuração. |
| `CORREIOS_PAC_CODE` | `03298`; substitua se o seu contrato exigir outro código PAC. |
| `CORREIOS_SEDEX_CODE` | `03220`; substitua se o seu contrato exigir outro código SEDEX. |
| `CORREIOS_API_VERSION` | `v1`; também aceita `v3`, somente se os endpoints correspondentes forem confirmados no Swagger do contrato/CWS. Os manuais públicos contêm referências a ambas as versões. |
| `CORREIOS_TIMEOUT_MS` | `12000`; prazo total por cotação, entre 1000 e 30000 ms, incluindo autenticação e fila de requisições. |

Nenhuma dessas variáveis ativa pagamento. Nenhuma migração altera as credenciais ou habilitações do contrato.

## Embalagem e quantidades

Os campos `shipping` em `server/catalog.config.js` devem representar **uma unidade já embalada para postagem**, incluindo caixa, proteção e peso bruto. As medidas que vieram no projeto eram declaradas provisórias. Elas não foram medidas nesta correção: até o operador confirmar os dados, o endpoint retorna `EMBALAGENS_NAO_CONFIRMADAS` (503).

A política implementada é **uma encomenda independente por unidade**, inclusive em quantidades maiores. Uma unidade vendida de tênis é um par embalado. Verifique que a loja realmente despacha dessa forma antes de habilitar. Se cor ou tamanho alterar a embalagem, o catálogo deve registrar essa diferença antes da habilitação. O sistema não inventa consolidação: somar pesos e lados de produtos sem conhecer o acondicionamento não determina uma caixa real.

São aplicados os limites de pacote padrão PAC/SEDEX: comprimento mínimo 11 cm, largura mínima 6 cm, altura mínima 0,4 cm, cada lado até 100 cm, soma até 200 cm e peso bruto até 30 kg. Não são habilitadas exceções de Grandes Formatos ou PAC estadual de 50 kg. O peso cúbico e o valor são decididos pela API, usando o pacote enviado. [Limites oficiais](https://www2.correios.com.br/sistemas/precosprazos/Formato.cfm), [Encomendas nacionais](https://www.correios.com.br/enviar/encomendas/nacional).

O backend consulta cada formato de pacote necessário e multiplica o preço retornado pela quantidade de volumes idênticos. Consultas idênticas só são reutilizadas dentro da mesma cotação. Uma modalidade aparece apenas quando todos os itens puderam ser cotados nela. A margem é somada uma única vez após todas as unidades. Há até quatro chamadas simultâneas por processo, fila limitada e timeout total; em múltiplas instâncias, respeite também os limites contratuais agregados.

## Falhas e validação

- `FRETE_NAO_CONFIGURADO` (503): origem, serviços ou credenciais ausentes/inconsistentes.
- `EMBALAGENS_NAO_CONFIRMADAS` (503): dados físicos ainda não confirmados.
- `EMBALAGEM_INVALIDA` (503): pacote fora dos limites suportados.
- `FRETE_INDISPONIVEL` (503): nenhuma modalidade teve cotação completa e válida. Logs internos registram evento, código e status HTTP, sem token, URL, CEP ou resposta do provedor.
- Se apenas o prazo falhar, o preço real continua disponível com prazo sob consulta; nunca se fabrica um número de dias.

`npm test` inclui testes com respostas simuladas do provedor para autenticação, renovação, parâmetros, quantidades, margem, concorrência, indisponibilidade e respostas inválidas. Esses valores são fixtures de teste, nunca exibidos como cotação. Testes reais de contrato, credenciais, CEPs e pesagem dependem do operador e não foram executados.
