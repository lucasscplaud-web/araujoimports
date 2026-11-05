# ARAUJO IMPORTS — revisão e operação no Render

As alterações devem ser revisadas via PR. **Não executar deploy, seed ou migração em produção sem autorização.** Os passos abaixo são instruções para uma janela de implantação aprovada, não ações executadas nesta revisão.

## Proxy e rate limiting

O erro `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` ocorria porque o padrão anterior era `trust proxy=false`, embora o ingress enviasse `X-Forwarded-For`. Não resolva com `true` nem desabilitando validações do limiter.

A documentação do [Render](https://render.com/articles/how-render-handles-ddos-attacks) descreve Cloudflare e load balancers; isso **não prova um número fixo de saltos para esta instalação**. O [Express](https://expressjs.com/en/guide/behind-proxies/) exige conhecer a topologia e alerta sobre rotas de comprimentos diferentes. Não copie `TRUST_PROXY=1` sem verificar.

Em ambiente de homologação com a mesma topologia:

1. Identifique pelo ingress confiável o endereço de conexão (`socket.remoteAddress`) e a cadeia XFF normal. Use captura temporária restrita, sem publicar diagnóstico de IP/headers na API ou coletar dados de clientes reais desnecessariamente.
2. Determine quais endereços foram acrescentados pelos proxies que você controla/confia, lendo da direita para a esquerda. Confirme com Render os IPs/faixas estáveis. Não use IP de saída do serviço como se fosse endereço do ingress.
3. Defina `TRUST_PROXY=N` e `TRUSTED_PROXY_CIDRS` com esses proxies. O código exige ambos e verifica a quantidade e cada salto confiável. Não habilite redes universais nem todas as redes privadas por conveniência.
4. Compare o acesso pelo domínio `.onrender.com` e pelo domínio personalizado; verifique caminhos por CDN e rede privada. Se diferirem, use ingress que normalize a cadeia. Conexões que não correspondam ao contrato serão recusadas nas rotas POST.
5. Envie XFF arbitrário à esquerda em homologação e confirme que o IP selecionado/limite não muda. Teste conexão direta/sem XFF, cadeia curta, proxy desconhecido e IPv6. Os testes automatizados locais cobrem esses casos com proxies controlados, sem alegar que validaram o ingress real.

`TRUST_PROXY=0` é modo direto e rejeita headers de encaminhamento nas rotas POST. Em produção a configuração é explícita; se estiver ausente/inconsistente, a inicialização é recusada. Os endereços/saltos reais não foram medidos nesta revisão.

## Banco e 42P01

Os pontos afetados eram as leituras de `inventory` e a gravação/leitura de `order_requests`/`order_request_items` sem inicialização garantida. O comando `npm run db:migrate` cria/adota o schema original e aplica a migração de integridade, tudo em uma transação com lock e histórico de checksums. A aplicação verifica esse histórico antes de atender.

Para uma implantação autorizada: faça backup, confirme que `DATABASE_URL` é do banco correto, execute `npm ci` e `npm run db:migrate` com as mesmas opções de TLS do processo, revise a saída e só então inicie com `npm start`. Não inclua seed em build/start. Migração incompatível aborta e preserva registros para revisão administrativa.

Estoque vazio não é erro de schema: ausência de SKU/quantidade resulta em indisponibilidade. Para a primeira carga, confira estoque físico e `stockPerSize`; uma execução manual aprovada de seed em produção exige `ALLOW_PRODUCTION_SEED=true`. Esse seed nunca sobrescreve quantidades existentes. Não o execute automaticamente para fazer um erro desaparecer.

## Pré-pedido e frete

Nome/e-mail/seleções são validados; preço e total vêm do catálogo. Pré-pedido mantém status `REQUESTED`, sem pagamento/reserva/frete contratado. Falta de schema ou conectividade gera resposta genérica 503, com código seguro e ID de correlação nos logs.

Correios exige credenciais válidas, permissões e códigos do contrato, origem real e medidas de unidades embaladas confirmadas. Consulte [LEIA-ME-CORREIOS.md](LEIA-ME-CORREIOS.md). `SHIPPING_MARGIN_CENTS=400` mantém R$ 4,00 uma vez por pedido/opção. Sem condição real para consultar, o endpoint informa indisponibilidade e não fabrica tarifas.

## Configuração e verificação após autorização

Use a tabela completa no [README](README.md) e [.env.example](.env.example). Mantenha `NODE_ENV=production`, `PUBLIC_ORIGIN` com a origem HTTPS exata (ou `RENDER_EXTERNAL_URL` se não houver domínio próprio), PostgreSQL e Redis privados. Não compartilhe tokens, URLs autenticadas ou `.env` em chamados.

Build: `npm ci --omit=dev`. Start: `npm start`. Migração é um passo manual separado e aprovado. Não foi acrescentado comando que dispare deploy ou altere produção. `/api/health` informa processo; `/api/ready` verifica schema/serviços sem expor dados. Configure o health check de produção para `/api/ready` após preparar o banco.

Em homologação verifique catálogo, troca de cores, preços preto/branco, tamanhos por categoria, pré-pedido, reenvio idempotente, estoque indisponível e frete com múltiplas unidades. Tokens e medidas físicas, Redis distribuído e concorrência de PostgreSQL em rede continuam dependentes desse ambiente.
