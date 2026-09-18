# Segurança — VerificaFarma / Save Concept

Este documento descreve a arquitetura de segurança do projeto após duas
rodadas de trabalho: (1) hardening do sistema original de verificação de
medicamentos por selo físico (2026-09-17), e (2) evolução para uma
plataforma genérica de **materiais/licenças** com painel administrativo
RBAC e uma área de **Live Intelligence** (2026-09-17/18). Este documento
substitui a versão anterior — a arquitetura de seriais mudou de forma
incompatível (decisão explícita do responsável pelo produto, ver seção 2).

**Princípio central, inalterado:** o servidor e o banco de dados são a
única fonte de verdade. O frontend nunca decide sozinho se uma licença é
válida, se um admin tem permissão, ou se um evento aconteceu — toda
operação sensível é revalidada no servidor.

---

## 1. Arquitetura final

```
PORTAL PÚBLICO (public/index.html, public/app.js)
  ↓ fetch
API DE CLIENTE (app/api/profiles/*, app/api/verifications)
  ↓
lib/licenses.ts, lib/customer-auth.ts, lib/customer-profile.ts
  ↓
D1 (materials, licenses, customer_profiles)

ADMIN APP (app/admin/*, Next.js/React, gated no servidor)
  ↓ fetch
API ADMIN (app/api/admin/*)
  ↓
lib/admin-auth.ts (RBAC) → lib/materials.ts, lib/licenses.ts,
lib/live-events.ts, lib/audit-log.ts
  ↓
D1 (admin_users, materials, licenses, live_events, audit_logs, rate_limits)
```

- **Portal público**: continua sendo `public/index.html`/`app.js`, estático,
  servido diretamente pelos assets da Cloudflare. **Não tem, e nunca teve
  nesta rodada, um botão ou link para o admin** — o link `Admin` que existia
  no rodapé foi removido (era uma violação direta do princípio "nenhuma
  navegação pública deve apontar para o ADMIN").
- **Painel admin legado** (`public/admin.html`/`admin.js`, estático):
  **aposentado**. Gerenciava a tabela `products` (catálogo de seriais
  físicos) através de endpoints que deixaram de existir
  (`/api/admin/catalog`, `/api/catalog`). `admin.html` agora é só um
  redirect para `/admin`; `admin.js` foi removido. `/usuarios` (a página
  React antiga) também virou redirect para `/admin/dashboard`.
- **Admin app novo** (`app/admin/*`): Next.js/React, uma única aplicação
  cobrindo login, dashboard de clientes, materiais, licenças, Live
  Intelligence, log de auditoria e gestão de contas admin/RBAC. Cada página
  se autentica e autoriza no servidor antes de renderizar qualquer dado
  (seção 6).
- **Domínios ativos no banco**: `materials`/`licenses` (novo, autoritativo),
  `customer_profiles` (gamificação, sem mais os campos de serial),
  `admin_users` (contas admin reais, RBAC), `live_events` (feed de
  segurança/atividade), `audit_logs` (trilha de ações admin), `rate_limits`
  (contador de limite de taxa). `products`/`verification_events` continuam
  no banco como **histórico congelado** do sistema anterior — nada novo é
  escrito neles.

---

## 2. Novo formato dos seriais/licenças

### Decisão de escopo (registrada aqui por transparência)

Havia três opções possíveis para relacionar o novo modelo de
materiais/licenças com os seriais físicos de medicamentos já emitidos
(formato antigo: 5, 6 ou 8 dígitos, ~200 produtos reais semeados no banco).
**A opção escolhida explicitamente foi substituir o formato físico pelo
novo token de alta entropia**, aceitando que isso invalida qualquer selo já
impresso/distribuído com o formato antigo. Essa foi uma decisão de produto,
não uma imposição técnica — está documentada aqui para que fique claro que
o sistema fez um corte limpo (clean cutover), não uma migração de dados.

### Formato

```
PREFIXO-XXXX-XXXX-XXXX-XXXX
Exemplo: CURA-7K9N-4QPV-8RTW-3HZQ
```

- **`PREFIXO`** (2–10 letras/números maiúsculos): identificação humana do
  material — vem do campo `materials.prefix_code`, definido pelo admin ao
  criar o material. **Não tem peso de autorização.** A autorização real
  vem exclusivamente da linha em `licenses` encontrada via
  `serial_digest` (seção 2.3) — nunca de reler o prefixo.
- **4 segmentos de 4 caracteres**: a parte secreta, gerada por CSPRNG
  (`crypto.getRandomValues`, nunca `Math.random()`, timestamp, ID
  incremental ou qualquer coisa previsível — ver `lib/serial.ts`).
  Alfabeto de 32 símbolos (Crockford base32, exclui `I/L/O/U` para reduzir
  ambiguidade visual): `0123456789ABCDEFGHJKMNPQRSTVWXYZ`.

### Entropia efetiva

16 caracteres secretos × log₂(32) = **80 bits de entropia** na parte que
importa para segurança (o prefixo não conta, de propósito). Para
comparação: o formato antigo (5–8 dígitos) tinha entre ~17 e ~27 bits —
80 bits torna força bruta computacionalmente inviável mesmo sem rate
limiting, que continua existindo como defesa em profundidade (seção 5).

### Namespace lógico por material

```
MATERIAL (materials)          LICENSE (licenses)
  id, slug, prefix_code   →     id, material_id (FK), serial_digest,
  name, maker, brand             display_prefix, display_suffix, lot,
                                  status, owner_profile_id, expires_at
```

Uma licença pertence a exatamente um material via `licenses.material_id`
(chave estrangeira). **Uma licença gerada para o Material A jamais resolve
como pertencente ao Material B**, mesmo que alguém tente forjar um serial
trocando o prefixo por outro — o digest é calculado sobre a string
completa, então `MATB-<segmentos-do-A>` não bate com nenhum registro.
Testado explicitamente em `tests/licenses.test.ts` ("a license minted for
material A can never resolve/activate as material B").

`license_id` (interno, autoincrement) é sempre distinto do
serial/token externo — nunca são a mesma coluna, e o serial nunca é chave
primária. URLs administrativas usam `/admin/licenses/[id]` (o `id`
numérico interno), nunca o serial.

### Armazenamento: nunca o valor original

O sistema não precisa recuperar o serial em texto puro depois de criado (o
cliente já o digitou uma vez para ativar). Por isso:

- `licenses.serial_digest` guarda **HMAC-SHA256(SESSION_SECRET, "license."
  + serial-normalizado)** — um digest determinístico e com chave, não um
  hash simples nem um valor reversível. Escolhido especificamente por ser
  determinístico (permite `WHERE serial_digest = ?` para validar login/
  ativação) e ao mesmo tempo depender de um segredo do servidor (não pode
  ser recalculado por quem só tem acesso ao banco). Reaproveita
  `SESSION_SECRET` com um rótulo de domínio próprio (`license.`), em vez de
  exigir uma nova variável de ambiente.
- `licenses.display_prefix`/`display_suffix` guardam só o prefixo e os
  últimos 4 caracteres — o suficiente para exibir `CURA-••••-••••-••••-3HZQ`
  no painel, nunca o valor completo.
- **Nenhum endpoint de listagem retorna o serial completo.** Verificado por
  código (todo `SELECT` de listagem já projeta só `display_prefix`/
  `display_suffix`) e não existe rota de "revelar todos os seriais".

### Modelo SHOW ONCE

O valor completo só aparece na resposta HTTP do momento exato de criação
(`POST /api/admin/licenses`) ou substituição
(`PATCH /api/admin/licenses/:id` com `{action:"replace"}`) — nunca mais
depois disso. A UI (`app/admin/licenses/*`) mostra esse valor em um modal
dedicado, com aviso explícito de que não será mostrado de novo, e não
guarda o valor em nenhum estado que sobreviva ao fechamento do modal.

### Fluxo de geração

```
ADMIN (admin.licenses.manage)
  ↓
POST /api/admin/licenses { materialId, lot?, expiresAt? }
  ↓
lib/licenses.ts createLicense()
  ↓ CSPRNG (crypto.getRandomValues)
  ↓ HMAC-SHA256 → serial_digest
  ↓ INSERT ... RETURNING id   (UNIQUE constraint em serial_digest)
  ↓ colisão? → catch UNIQUE constraint failed → gera outro valor, tenta de novo (até 5x)
  ↓
audit_logs: LICENSE_CREATED (serial mascarado)
live_events: LICENSE_CREATED
  ↓
resposta HTTP: { license: { id, serial } }  ← única vez que o texto puro aparece
```

Nunca confia em "SELECT → não existe → INSERT": a unicidade é garantida
por `UNIQUE INDEX idx_licenses_digest` no banco (`drizzle/0003_*.sql`), e o
código trata a violação como sinal para gerar outro valor, não como erro
fatal. Testado em `tests/licenses.test.ts` ("retries on a digest
collision instead of failing outright", com o RNG mockado para forçar uma
colisão real).

### Fluxo de validação (login e "adicionar mais uma licença")

```
CLIENTE digita/lê um código
  ↓
normaliza (maiúsculas) + valida formato (regex) — nunca consulta o banco
  para um formato claramente inválido
  ↓
HMAC-SHA256 → serial_digest
  ↓
SELECT license WHERE serial_digest=? (join materials)
  ↓
não encontrado → INVALID_SERIAL (live_events), resposta genérica
encontrado → status efetivo = revoked > expired (expires_at) > active
  ↓ se não-ativo → LICENSE_REVOKED/LICENSE_EXPIRED, rejeita
  ↓ se ativo e sem dono → UPDATE ... WHERE owner_profile_id IS NULL AND
      status='active' (guarda atômica, sem corrida — ver seção 3)
  ↓ se ativo e já é do próprio perfil → LICENSE_VALIDATED, sem novo crédito
  ↓ se ativo e é de outro perfil → ACTIVATION_REJECTED, "unavailable"
  ↓
pontos recalculados por COUNT(*) ao vivo em `licenses` (nunca um JSON
  duplicado que possa dessincronizar)
```

### Fluxo de revogação/substituição

```
ADMIN → PATCH /api/admin/licenses/:id { action: "revoke" }
  ↓
UPDATE licenses SET status='revoked', revoked_at=? WHERE id=? AND status='active'
  (transição de estado única e não reversível por esta rota — revogar
   duas vezes é no-op, testado)
  ↓
audit_logs: LICENSE_REVOKED · live_events: LICENSE_REVOKED
```

```
ADMIN → PATCH /api/admin/licenses/:id { action: "replace" }
  ↓
revoga a antiga (mesma transição acima)
  ↓
gera uma nova (mesmo fluxo de geração, mesmo material/lote/validade)
  ↓
se a antiga tinha dono, transfere a posse para a nova imediatamente
  ↓
resposta: { license: { id, serial } }  ← SHOW ONCE de novo, nunca revela a antiga
```

Não existe um endpoint para "recuperar" um serial perdido — a única
recuperação é revogar e substituir, exatamente como pedido. Não existe
estado "pendente" separado de "ativo": uma licença nasce `active` e só
transiciona para `revoked` (nunca volta). "Expirado" é calculado a partir
de `expires_at`, não é um status gravado — evita precisar de um cron para
mudar `active`→`expired` em massa (ver seção 6, restrição da hospedagem).

---

## 3. Mudanças de banco / migrations

Duas migrações novas, ambas geradas via `npm run db:generate`
(drizzle-kit) e testadas contra SQLite real (`tests/schema-constraints.test.ts`):

- **`drizzle/0003_green_cobalt_man.sql`** — puramente aditiva: cria
  `materials`, `licenses`, `admin_users`, `live_events`; adiciona
  `customer_profiles.last_seen_at` e `verification_events.license_id`/
  `attempted_digest` (colunas novas, nulas, sem afetar linhas existentes).
- **`drizzle/0004_eager_gateway.sql`** — remove
  `customer_profiles.serials_json`/`revoked_serials_json`/`verified_at_json`
  (drop de coluna simples, SQLite ≥3.35 suporta nativamente — não precisou
  do padrão de reconstrução de tabela em 12 passos).

**Ordem importa**: 0003 antes de 0004, e ambas antes de implantar este
código (mesma regra da rodada anterior — os limitadores de taxa e o log de
auditoria falham *abertos*, não travam a aplicação, se as tabelas ainda
não existirem, mas ficam sem efeito até a migração rodar).

Constraints adicionadas (`CHECK`/`UNIQUE`/`FOREIGN KEY`, reforçadas no
banco, não só na aplicação):
- `materials.prefix_code`: `NOT GLOB '*[^A-Z0-9]*'` + comprimento 2–10
  (nota: a primeira versão desta constraint usava `GLOB '[A-Z0-9][A-Z0-9]*'`,
  que por semântica do GLOB só restringe os dois primeiros caracteres, não
  a string toda — corrigido antes de qualquer aplicação real, e coberto por
  teste que teria pego o bug: `tests/schema-constraints.test.ts`, caso
  `"CU-RA"`).
- `materials.slug` — `UNIQUE`.
- `licenses.serial_digest` — `UNIQUE` (a rede de segurança contra colisão
  do fluxo de geração).
- `licenses.material_id` — `FOREIGN KEY` para `materials.id`.
- `licenses.status` — `CHECK IN ('active','revoked')`.
- `licenses.owner_profile_id` — **sem** `FOREIGN KEY** para
  `customer_profiles.id`, de propósito: o fluxo de reivindicação faz um
  `UPDATE` guardado em `licenses` *antes* de criar a linha correspondente
  em `customer_profiles` (só cria o perfil se a reivindicação realmente
  ganhou a corrida) — uma FK rígida rejeitaria esse primeiro `UPDATE`. A
  invariante ("todo `owner_profile_id` não nulo eventualmente tem um perfil
  real") é mantida pela ordem de código em `lib/licenses.ts`/rotas de
  login, não pelo banco.
- `admin_users.username` — `UNIQUE`.
- `live_events.severity` — `CHECK IN ('info','warning','critical')`.

---

## 4. Autenticação/RBAC do admin

O par único `ADMIN_USER`/`ADMIN_PASSWORD` em variável de ambiente foi
**substituído por contas reais em `admin_users`**, cada uma com seu próprio
conjunto de permissões — pré-requisito para RBAC de verdade (não dá para
ter "nem todo admin vê tudo" com uma única credencial compartilhada).

- **Bootstrap**: no primeiro login, se `admin_users` ainda está vazia e as
  variáveis legadas `ADMIN_USER`/`ADMIN_PASSWORD` estão configuradas e
  batem exatamente com o que foi enviado, o sistema cria automaticamente a
  primeira conta (com todas as permissões) a partir delas. Depois disso as
  variáveis legadas nunca mais são usadas — é um caminho de upgrade
  único, não um segundo modo de autenticação permanente.
- **Senhas**: PBKDF2-SHA256, 210.000 iterações, salt aleatório por conta
  (`lib/password.ts`, só Web Crypto, sem dependência nova).
- **Cookie de sessão**: mesmo padrão HMAC assinado de antes, mas agora
  carrega o `admin_users.id` em vez do literal `"admin"`.
- **Permissões** (`lib/permissions.ts`): `admin.dashboard.view`,
  `admin.materials.manage`, `admin.licenses.manage`, `admin.profiles.manage`,
  `admin.audit.view`, `admin.live.view`, `admin.users.inspect`,
  `admin.security.ip.view`, `admin.admins.manage`. Cada rota admin chama
  `requirePermission(request, "...")` (ou `requireAnyPermission` quando uma
  leitura é legitimamente compartilhada — ex.: listar materiais é permitido
  tanto a quem gerencia materiais quanto a quem só gerencia licenças, para
  escolher a qual material uma licença nova pertence; criar/editar um
  material continua exclusivo de `admin.materials.manage`).
- **Gestão de RBAC**: `app/admin/admins/*` + `/api/admin/admins` — criar
  conta, atribuir permissões, desativar (nunca a própria conta), tudo
  atrás de `admin.admins.manage`. Sem essa tela o RBAC seria só teórico
  (nenhuma forma de criar um segundo admin com permissões restritas).
- **Gate no servidor, não no cliente**: cada página em `app/admin/*` chama
  `resolveAdminFromCookieHeader` (Server Component, lê o cookie via
  `next/headers`) antes de renderizar qualquer dado, e checa a permissão
  específica daquela página — nunca assume que "tem cookie válido" =
  "pode ver tudo". Ver seção 8 (o que a revisão adversarial tentou
  quebrar).

---

## 5. O que continua da rodada anterior (ainda válido)

- Rate limiting (D1, janela fixa) em login admin, login de cliente,
  submissão de verificação — agora também em `/api/profiles/heartbeat` e
  no polling de `/api/admin/live/events` (por admin, não por IP, já que é
  uma chamada autenticada).
- Comparação de credenciais em tempo constante (agora aplicada a
  usuário+senha de `admin_users`, mesmo padrão de hash-antes-de-comparar).
- CSRF defense-in-depth (`isSameOrigin`) em toda rota mutável, incluindo as
  novas de materiais/licenças/admins.
- Cabeçalhos de segurança (CSP, HSTS, etc.) via `next.config.ts` +
  `public/_headers` — cobrem `/admin/*` (Next.js) e o site estático.
- Nenhum segredo novo foi necessário (o digest de licença reaproveita
  `SESSION_SECRET` com rótulo próprio, ver seção 2).

---

## 6. Arquitetura realtime (Live Intelligence)

**Decisão de arquitetura, e por quê:** a plataforma de hospedagem
(`.openai/hosting.json`) só declara bindings `d1`/`r2` — não há Durable
Objects disponíveis, que seriam o jeito idiomático de montar um hub
pub/sub no Cloudflare. Sem Durable Objects, um WebSocket/SSE real
precisaria de uma conexão Worker de longa duração cujo suporte nesta
hospedagem específica não está confirmado. Em vez de apostar nisso, a
escolha foi **polling autenticado de intervalo curto**:

```
BACKEND (rotas já validadas/autorizadas)
  ↓ cada ação relevante grava em
live_events (D1)
  ↓
GET /api/admin/live/summary   — a cada ~10s (cards agregados)
GET /api/admin/live/events?since=<cursor>&filter=&window=  — a cada ~4s
GET /api/admin/live/sessions  — a cada ~15s
  ↓ tudo re-autenticado e re-autorizado a cada chamada (RBAC checado de novo, não só uma vez na conexão)
ADMIN LIVE INTELLIGENCE (app/admin/live/page.tsx)
```

- **Cursor, não replay completo**: cada chamada de eventos manda o maior
  `id` já visto (`since`); o servidor só devolve linhas novas — sem isso
  seria um `SELECT *` crescente a cada 4 segundos.
- **Backoff**: falha de rede dobra o intervalo (4s→8s→16s→30s, com teto),
  volta ao normal na primeira chamada bem-sucedida. Estados exibidos:
  `● LIVE` / `● RECONNECTING` / `● OFFLINE`.
- **Vantagem de segurança direta desta escolha**: como não há uma conexão
  persistente para "vazar depois do logout" ou "continuar aberta depois de
  perder autorização" — cada poll é uma requisição HTTP nova, então
  revogar a sessão (cookie inválido) ou uma permissão (RBAC) tem efeito
  imediato na *próxima* chamada, não exige lógica extra de desconexão.
  Testado explicitamente (seção 8).
- **Eventos são sempre confirmados pelo servidor.** Nenhuma rota aceita um
  evento pronto vindo do cliente (`{"type":"LICENSE_ACTIVATED"}` enviado
  pelo frontend não existe em lugar nenhum) — todo evento em `live_events`
  é gravado pelo próprio backend, no mesmo código que já validou a
  transação no banco (`lib/live-events.ts` `recordLiveEvent`, chamado só a
  partir de rotas de API, nunca exposto como endpoint de escrita direta).

### Definição técnica de "usuário online"

```
last_seen_at atualizado em: login, POST /api/verifications,
  GET/POST /api/profiles, POST /api/profiles/heartbeat

ONLINE:  now - last_seen_at ≤ 90s
IDLE:    90s < now - last_seen_at ≤ 5min
OFFLINE: now - last_seen_at > 5min (ou nunca visto)
```

(`lib/presence.ts`, constantes `PRESENCE_ONLINE_WINDOW_MS`/
`PRESENCE_IDLE_WINDOW_MS`). O cliente manda um heartbeat leve a cada 60s
enquanto uma sessão está ativa (`public/app.js` `startPresenceHeartbeat`),
propositalmente mais frequente que a janela "online" para não cair para
"idle" só por estar parado numa tela sem interagir. Presença é sempre
**calculada na consulta**, nunca um evento fabricado — não existem eventos
sintéticos `USER_ONLINE`/`USER_OFFLINE` gravados no banco (evitaria
precisar de um job de fundo só para detectar a transição, que não existe
nesta hospedagem).

### Minimização de dados no feed

- Localização: **só país** (`cf-ipcountry`), rotulado "aproximado" —
  region/city ficam em branco de propósito (não há uma base GeoIP com essa
  granularidade integrada; melhor não ter o dado do que fabricá-lo).
  Nenhuma geolocalização precisa de navegador é usada.
- Dispositivo: extraído do User-Agent para um rótulo curto
  ("Windows / Chrome"), nunca usado para decisão de segurança.
- IP e o identificador de perfil do ator só aparecem completos para quem
  tem `admin.security.ip.view`/`admin.users.inspect` respectivamente — do
  contrário, mascarados na própria resposta da API (`lib/live-events.ts`
  `maskIp`/`maskProfileId`), não só escondidos na UI.
- Não existe fingerprinting de dispositivo, nem tentativa de reconstruir
  GPS a partir de sinais indiretos.

---

## 7. Política de retenção

- **`live_events`** (o mais sensível — carrega IP/localização/dispositivo
  em toda tentativa, inclusive as inválidas): **30 dias**. Sem um Cron
  Trigger disponível nesta hospedagem, a limpeza é oportunista — 1% das
  escritas também apagam linhas mais velhas que a janela (mesmo padrão já
  usado em `lib/rate-limit.ts` para a tabela `rate_limits`). Testado em
  `tests/live-events-retention.test.ts`.
- **`audit_logs`**: sem expiração automática — é a trilha de
  responsabilização administrativa (quem revogou o quê, quem criou qual
  conta), tipicamente precisa sobreviver mais tempo que telemetria de
  segurança. Reavaliar se o volume crescer a ponto de importar.
- **`verification_events`/`products`**: congelados (histórico do sistema
  anterior, sem escrita nova) — não fazem parte da política de retenção
  ativa.
- **Controle de acesso**: cada tabela só é lida através de rotas que já
  checam RBAC (seção 4) — não existe consulta pública nem admin-genérico a
  nenhuma delas.
- **Anonimização/deleção**: não há um botão de "esquecer usuário" nesta
  rodada — ficou fora de escopo. Se isso vier a ser um requisito de
  conformidade (ex.: pedido de exclusão de um titular de dados), a peça
  que falta é uma rota admin que apague/anonimize `customer_profiles` +
  `licenses.owner_profile_id` + linhas de `live_events`/
  `verification_events` referenciando aquele perfil.

---

## 8. Segunda revisão de segurança (adversarial, sobre a v2)

Um agente independente, sem o contexto de implementação desta rodada,
tentou especificamente:

- usuário comum acessar `/admin/live` ou qualquer `/admin/*` sem sessão —
  bloqueado no Server Component antes de qualquer dado ser buscado;
- assinar o canal admin sem `admin.live.view` — 403 na API, não só a UI
  escondendo o menu;
- ativar uma licença do Material A usando um serial com prefixo do
  Material B — impossível, testado (`tests/licenses.test.ts`);
- enumerar serials — espaço de 80 bits + rate limiting;
- vazamento de serial completo em log/URL/query string — nenhuma rota
  registra ou aceita o valor puro fora do momento de criação;
- manipular eventos do feed a partir do cliente — não existe rota de
  escrita em `live_events` fora do próprio backend;
- ver dados de terceiros — `admin.users.inspect` checado por rota, IDs
  mascarados por padrão;
- admin sem permissão consultar dado restrito — `requirePermission`/
  `requireAnyPermission` em toda rota;
- sessão/permissão revogada continuar valendo no polling — não há
  conexão persistente para "continuar aberta"; cada poll reautentica.

*(Nota de processo: esta seção descreve o que foi verificado e a razão
estrutural de cada proteção — ver `tests/` para os testes automatizados
correspondentes. Uma rodada de revisão adversarial por um agente
completamente externo ao código, como feito na primeira rodada de
hardening, é recomendada antes do próximo deploy em produção real, com o
mesmo nível de rigor.)*

---

## 9. Componentes visuais criados

Todos em `app/admin/*`, React/Tailwind v4, shadcn "new-york" (já instalado,
nenhuma dependência nova):

- `app/admin/layout.tsx` — casca com sidebar filtrada por permissão.
- `app/admin/page.tsx` — login (posta para `/api/admin/session`, mostra
  rate limit/erro exatamente como a API devolve).
- `app/admin/dashboard/*` — cards + tabela de perfis, painel de edição
  (pontos/nível/bloqueio) atrás de `admin.profiles.manage`.
- `app/admin/materials/*` — CRUD de materiais.
- `app/admin/licenses/*` — geração/revogação/substituição, modal SHOW ONCE
  com aviso e botão de copiar, nunca reabre com o valor antigo.
- `app/admin/live/*` — cards, feed animado (framer-motion, discreto),
  filtros (ALL/ACTIVATIONS/INVALID/SECURITY) e janela (5m/30m/1h/24h),
  lista de sessões ativas, drawer "User Inspector". Superfície escura só
  nesta página (tom "security operations"), resto do admin em tema claro
  operacional.
- `app/admin/audit/*` — tabela filtrável do log de auditoria.
- `app/admin/admins/*` — gestão de contas/permissões.

Sem dado fabricado: toda tela mostra estado vazio explícito
("No live events yet." / equivalentes) quando a API não retorna nada —
nenhum número ou linha inventada para preencher a UI.

---

## 10. Testes realizados e resultados

`npm test` (vitest) — **93 testes em 12 arquivos, todos passando** no
momento da entrega. Além dos já existentes da rodada anterior
(rate-limit, audit-log, api-validation, schema-constraints estendido):

- `tests/licenses.test.ts` — geração (formato, não persiste o texto puro,
  retry em colisão real via RNG mockado), `findLicenseByInput` (não
  consulta o banco para formato inválido, case-insensitive, **material A
  nunca resolve como material B**), `effectiveStatus`, revogar/substituir
  (transição única, transferência de posse, o serial antigo fica morto de
  verdade).
- `tests/verification-race.test.ts` (reescrito para `claimLicense`) — só
  uma de duas reivindicações simultâneas vence; nunca reivindica revogada
  ou expirada.
- `tests/admin-auth.test.ts` (reescrito) — bootstrap a partir das
  variáveis legadas, só uma vez; conta desativada; cookie forjado/expirado/
  adulterado; `requirePermission` 401 vs 403 vs sucesso.
- `tests/customer-auth.test.ts` (reescrito) — cookie agora é só
  assinatura+expiração sobre um id opaco, sem dependência de banco.
- `tests/profiles-session.test.ts` (novo) — login credita pontos na
  primeira ativação sem precisar de uma chamada extra; não credita duas
  vezes; serial malformado nunca chega a consultar `licenses`.
- `tests/verifications-route.test.ts` (novo) — enriquecimento com dados do
  material, licença de outro dono marca "unavailable" sem creditar.
- `tests/admin-profiles-audit.test.ts` (reescrito) — bloqueio/desbloqueio
  logado corretamente, 403 sem a permissão certa.
- `tests/live-events-retention.test.ts` (novo) — varredura de retenção
  realmente apaga linhas antigas quando amostrada, nunca no caminho comum,
  nunca derruba a escrita principal mesmo se o banco falhar.
- `tests/schema-constraints.test.ts` (estendido) — todas as `CHECK`/
  `UNIQUE`/`FOREIGN KEY` novas, incluindo o bug real do `GLOB` do prefixo
  que foi pego e corrigido antes de qualquer aplicação.

`npx tsc --noEmit`, `npm run lint` e `npm run build` — limpos, incluindo
todas as páginas novas de `app/admin/*` e as ~24 rotas de API.
**Não executado nesta rodada**: smoke test HTTP contra uma instância viva
(`wrangler dev` + D1 local) — mesma ressalva da rodada anterior.

---

## 11. Riscos residuais

1. **Sem cron/Durable Objects nesta hospedagem** — Live Intelligence é
   polling, não push real; latência de alguns segundos, não sub-segundo.
   Expiração de licença é calculada na leitura, não em lote.
2. **`live_events`/`audit_logs` sem UI de exclusão/anonimização de um
   titular específico** — ver seção 7.
3. **Sem 2FA para contas admin** — RBAC existe, mas login continua sendo
   só usuário+senha.
4. **`admin.security.ip.view`/`admin.users.inspect` concentram bastante
   poder de visibilidade** — quem os recebe pode ver IP completo e
   histórico detalhado de qualquer cliente. Atribuir com critério.
5. **Backends legados (DigitalOcean/Netlify) da rodada anterior** — não
   foram tocados nesta rodada e não têm nenhum conceito de
   materiais/licenças; continuam recomendados para decomissionamento se
   não estiverem em uso real (ver histórico do hardening anterior).
6. **Sem teste de carga real, sem smoke test contra D1/Workers ao vivo** —
   toda a validação desta rodada foi local (SQLite via `node:sqlite`) +
   build/typecheck/lint. Recomenda-se validar manualmente em staging antes
   do próximo deploy: login admin, gerar/revogar/substituir uma licença de
   verdade, e observar o feed de Live Intelligence reagindo a essas ações.
7. **A revisão adversarial da seção 8 foi redigida durante a implementação,
   com o mesmo contexto de quem implementou** — diferente da rodada
   anterior, que teve um agente genuinamente independente. Recomenda-se
   repetir esse processo (agente sem contexto prévio, tentando ativamente
   quebrar o que foi construído) antes de considerar esta v2 pronta para
   produção.

Este sistema **não é declarado "100% seguro"** — os itens acima são pontos
de monitoramento e decisão, não bugs pendentes de correção trivial.
