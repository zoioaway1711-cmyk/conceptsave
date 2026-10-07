---
name: verificar-site
description: Use when the user asks whether the VerificaFarma / Save Concept site is up, down, slow or broken ("o site está no ar?", "caiu?", "fora do ar", "verifica o site", "monitorar", "ficar verificando"), after a deploy, or when a domain (saveconcept.com.br, saveconcept.online, workers.dev) returns errors.
---

# Verificar se o site está no ar

## Visão geral

O site tem camadas: **Worker na Cloudflare (origem, com D1)** → **domínio** (saveconcept.com.br via DNS/proxy). Um "200 na home" não prova nada sobre o banco nem diz *onde* está a falha. Use o script, que testa cada camada, confere o conteúdo (não só o status), repete uma vez antes de declarar falha e diz qual camada caiu.

## Verificação única

Rode o script primeiro — ele já cobre o que curls manuais cobririam. Curl/dig só depois, para investigar um item que falhou.

```bash
node .claude/skills/verificar-site/check-site.mjs
```

Saída: ✅/❌ por item, tempo de resposta e uma linha `→` com o diagnóstico. Exit 0 = tudo crítico no ar; 1 = algo crítico fora. Use `--json` para ler o resultado em script.

| Item | Crítico | Se falhar, aponta para |
|---|---|---|
| Worker direto `/api/health` | sim | origem: deploy, CPU, D1, toggle workers.dev |
| `saveconcept.com.br/api/health` | sim | domínio/DNS/proxy (se o Worker direto está ok) |
| Portal `/index.html` (contém `login-gate`) | sim | domínio ou deploy quebrado |
| Loja `/loja` (contém links de produto) | sim | domínio, cache de página ou CPU |
| `/api/contato` (contém `wa.me`) | não | número de WhatsApp vazio no painel |
| `saveconcept.online` | não | nameservers do registrador (fora desde 2026-10-05) |

Responda ao usuário com o veredito geral, a tabela de itens que falharam e o diagnóstico. Não invente causa além do que o diagnóstico e os sinais mostram.

## Ficar verificando (monitoramento contínuo)

Escolha conforme quanto tempo deve durar:

| Pedido | Como |
|---|---|
| Enquanto esta sessão estiver aberta | `/loop 10m /verificar-site` — a cada rodada rode o script; se o exit for 1, avise o usuário (PushNotification, se disponível) com o diagnóstico; se tudo ok, rodada silenciosa |
| No terminal do usuário, sem Claude | `node .claude/skills/verificar-site/check-site.mjs --watch 300` (Ctrl+C para parar) |
| Mesmo com o computador desligado | rotina agendada na nuvem (skill `schedule`), rodando o mesmo script |

Intervalo mínimo razoável: 5 min. Não use intervalos de segundos — gera tráfego e não acrescenta nada.

## Erros comuns

- **Declarar "fora do ar" com uma falha só.** O script já repete após 3 s; uma falha isolada em rodadas de monitoramento só vira alerta se repetir na rodada seguinte.
- **Testar só a home.** Ela redireciona para `/index.html` e pode responder 200 com o banco fora. O `/api/health` é que consulta o D1.
- **Chutar caminhos** (`/admin` não existe; o painel tem caminho próprio e não deve ser exposto em relatórios).
- **Tratar `saveconcept.online` como queda do site.** É domínio secundário com problema conhecido de DNS; o principal é saveconcept.com.br.
- **Corrigir algo durante a verificação.** Esta skill é só leitura: sem deploy, sem mexer em DNS ou secrets. Se algo caiu, relate e pergunte antes de agir.
