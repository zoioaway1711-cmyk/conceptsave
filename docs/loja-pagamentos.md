# Loja — pagamentos online (Pix e Cripto)

Pix (pix-checkout) e USDT na rede Tron (crypto-checkout) são cobrados no próprio site e
confirmados automaticamente por webhook assinado (HMAC-SHA256). Cartão e boleto continuam
manuais (a equipe entra em contato). Os frascos continuam bloqueados para compra no servidor.

- Código: `lib/loja-pix.ts`, `lib/loja-crypto.ts`, `lib/loja-payments.ts`,
  `app/loja/_components/online-payment.tsx`
- Rotas: `POST /api/loja/orders/:id/payment`, `GET /api/loja/orders/:id/receipt`,
  `POST /api/loja/webhooks/pix`, `POST /api/loja/webhooks/crypto`
- Banco: migração `drizzle/0016_loja_payments.sql`
- Guias dos provedores: fora do Git (`docs-privados/`, ignorado)

## Secrets do Worker (`site-creator-vinext-starter`)

| Secret | Origem | Sem ele |
| --- | --- | --- |
| `PIX_API_KEY` (pk_…) | dono do pix-checkout | Pix volta ao fluxo manual |
| `PIX_STORE_WEBHOOK_SECRET` (whsec_…) | dono do pix-checkout | Pix volta ao fluxo manual |
| `CRYPTO_API_KEY` (ck_live_…) | `node scripts/crypto-signup.mjs` | Cripto some do checkout |
| `CRYPTO_WEBHOOK_SECRET` | `node scripts/crypto-signup.mjs` | Cripto some do checkout |
| `LOJA_TEST_BUYER_EMAIL` (opcional) | você | modo teste desligado |

Modo teste: pedidos com o e-mail de `LOJA_TEST_BUYER_EMAIL` são cobrados R$ 20,00 fixos
(Pix e Cripto), marcados como TESTE no Telegram e no painel. Apague o secret ao terminar.

## Colocar no ar (ordem importa)

1. Backup: `npx wrangler d1 export verificafarma-db --remote --config wrangler.d1.jsonc --output ~/Documents/API/backup-antes-pagamentos.sql`
   (sem `--config` o wrangler 4.92 responde "Authentication error [code: 10000]")
2. Migração: `npx wrangler d1 migrations apply verificafarma-db --remote --config wrangler.d1.jsonc`
3. Pix: `npx wrangler secret put PIX_API_KEY --name site-creator-vinext-starter` e
   `npx wrangler secret put PIX_STORE_WEBHOOK_SECRET --name site-creator-vinext-starter`
4. Cripto: `node scripts/crypto-signup.mjs --dry-run` e depois `node scripts/crypto-signup.mjs`
5. Teste (opcional): `npx wrangler secret put LOJA_TEST_BUYER_EMAIL --name site-creator-vinext-starter`
6. No servidor do pix-checkout, configurar o webhook: `https://saveconcept.com.br/api/loja/webhooks/pix`
   (o do cripto já foi registrado no passo 4: `https://saveconcept.com.br/api/loja/webhooks/crypto`)
7. Deploy: `npm run build` e `npx wrangler deploy --config dist/server/wrangler.json`
8. Só DEPOIS do deploy, os acessórios (migração 0017, com as imagens que o deploy publicou):
   `npx wrangler d1 migrations apply verificafarma-db --remote --config wrangler.d1.jsonc`

## Produtos de teste (migração 0017)

Cinco acessórios com preço baixo de propósito, para testar pagamentos reais:

| Produto | Preço | Pix | Cripto |
| --- | --- | --- | --- |
| Lenços com Álcool 70% (10 sachês) | R$ 5,00 | ✅ | — |
| Coletor de Perfurocortantes 1,5 L | R$ 10,00 | ✅ | — |
| Seringas 1ml 31G (10 un.) | R$ 20,00 | ✅ | ✅ |
| Bolsa Térmica com Gel | R$ 30,00 | ✅ | ✅ |
| Agulhas para Caneta 32G (100 un.) | R$ 50,00 | ✅ | ✅ |

O Cripto só aceita pedidos a partir de R$ 20,00; abaixo disso a opção aparece desabilitada no checkout. Ao terminar os testes, ajuste os
preços em Painel → Loja → Catálogo. Antes de vender seringas/agulhas, confirme a
regularização ANVISA do fabricante e troque as ilustrações por fotos reais.

## Depois do teste

- Painel → Loja → Pedidos: cancelar os pedidos de teste (devolve o estoque reservado).
- `npx wrangler secret delete LOJA_TEST_BUYER_EMAIL --name site-creator-vinext-starter`
- Painel → Loja → Configurações: revisar a "nota de pagamento" (hoje diz que não há cobrança automática).
- Mover `~/Documents/API/crypto-checkout-credenciais.txt` para um gerenciador de senhas e apagar o arquivo.

## Quando algo precisa de gente

Pix retido (`held`), valor pago diferente do cobrado, USDT a menos (`underpaid`/`mismatch`),
pagamento em pedido cancelado ou em duplicidade: o pedido NÃO é liberado, a cobrança fica
"Em análise" no painel e chega um alerta no Telegram.
