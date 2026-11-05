# ARAUJO IMPORTS — catálogo e operação

O cadastro permanece em `server/catalog.config.js`, com preços próprios em `variants[].priceCents` e tamanhos em `products[].sizes`. Identidade visual, imagens e animações de troca de cor permanecem na UI original.

Pré-pedidos validam dados e estoque, sem cobrança ou reserva. O frete consulta APIs oficiais com todas as unidades, usando uma embalagem por unidade e margem interna configurável de R$ 4,00 por pedido. Dimensões/pesos devem corresponder às unidades embaladas reais antes de habilitar a integração. A prévia local não apresenta tarifas fictícias.

Consulte o [README](README.md) para instalação, variáveis e testes, [CORRIGIR-ERROS-RENDER.md](CORRIGIR-ERROS-RENDER.md) para validação do ingress e implantação autorizada e [LEIA-ME-CORREIOS.md](LEIA-ME-CORREIOS.md) para contrato, autenticação e regras de transporte. Não execute migrações, seed ou deploy em produção sem autorização.
