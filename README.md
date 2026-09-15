# Save Concept — Vercel + PostgreSQL

Portal de autenticidade com temas claro/escuro, QR Code, validação central de seriais, histórico de acessos, benefícios e administração.

## Rodar no computador

Use Node.js 22.13 ou superior. Dentro da pasta do projeto:

```sh
npm run local
```

O comando instala dependências ausentes, prepara um PostgreSQL local (PGlite) e importa o catálogo sem sobrescrever produtos. Depois inicia Next.js na porta 8787.

- Portal: http://127.0.0.1:8787/index.html
- Admin: http://127.0.0.1:8787/admin
- Usuário padrão local: `admin`
- Senha: arquivo `.local/.admin-password`. Ao migrar da versão anterior, a senha de `.wrangler/.admin-password` é reaproveitada.

```sh
cat .local/.admin-password
```

`ADMIN_USER` e `ADMIN_PASSWORD` em `.env.local` ou no ambiente substituem esses valores. Mantenha o terminal aberto; Ctrl+C encerra. Se a porta estiver ocupada, encerre o processo anterior antes de iniciar.

Os dados locais novos ficam em `.local/postgres`. Desligue o servidor antes de copiar `.local` como backup, pois PGlite tem um único processo escritor. Não rode o CLI de migração local ao mesmo tempo que o servidor local. `.wrangler` contém o banco antigo D1, preservado sem modificações e sem importação automática.

Se `.env.local` contiver `DATABASE_URL`, o comando usa esse banco e **não roda migração/seed automaticamente**. Para prepará-lo, execute conscientemente `npm run db:migrate` e, se desejado, `npm run db:seed`. Evite apontar o desenvolvimento para a base de produção.

## Publicar

Veja [VERCEL.md](./VERCEL.md). Agora `npm run build` gera Next.js e `npm start` inicia seu servidor; Cloudflare/D1 não participa das APIs atuais. Nunca publique apenas `public` como site estático: a validação depende das APIs.

## O painel inclui

- Registro de logins autorizados/negados, consultas, primeira ativação e repetições.
- IP público, cidade/estado/país e coordenadas aproximadas quando fornecidos pela Vercel.
- Navegador, sistema, tipo de dispositivo, origem, domínio, endpoint, referência sem parâmetros e ID da requisição.
- Busca, filtros por ação/resultado/período, páginas de 50 eventos, exportação CSV da página e detalhes de cada acesso.
- Perfis centrais, últimas 100 ocorrências por perfil, bloqueio com revogação de sessão, níveis, atribuição e revogação de seriais.
- Pontos e benefícios calculados pelo servidor; um serial não é creditado novamente ou atribuído a dois perfis.

O banco registra apenas os dados disponíveis. Localização é aproximada por IP; navegador e método de leitura não são prova de identidade. Consulte as limitações em [SEGURANCA-E-HOSPEDAGEM.md](./SEGURANCA-E-HOSPEDAGEM.md).

## Testar

```sh
npm test
npm run lint
npm run build
```

`npm test` cria e remove um banco temporário isolado, sem acessar dados de produção. Testa transações, sessão, autorização, duplicidade, benefícios, limites de acesso e cabeçalhos geográficos simulados.

Com o servidor local ativo e credenciais locais padrão:

```sh
node tests/security-smoke.mjs
npx playwright install chromium
node tests/browser-smoke.mjs
```

Os testes HTTP/navegador usam o ambiente local e registram acessos de teste. Não os execute apontando para produção.

## Estrutura

- `app/api`: APIs Next.js para Vercel.
- `db/client.ts`: PostgreSQL com pool; fallback PGlite somente local.
- `database/*.sql`: migrações PostgreSQL.
- `lib/sessions.ts`: sessões revogáveis com hash no banco.
- `lib/verification-service.ts`: autoria das ativações, pontos e resgates.
- `lib/request-context.ts`: IP/geografia observados no servidor e metadados sanitizados.
- `public/activity.js`: filtros e detalhes de auditoria.
- `public/theme.css`: temas claro/escuro preservando os efeitos anteriores.

Arquivos em `drizzle`, `legacy`, scripts Sites/Vite, `server.mjs` e funções Netlify pertencem à arquitetura anterior; não são usados no deploy Vercel.

## Monitoramento administrativo

A auditoria administrativa agora tem busca e paginação no painel, com atualização a cada 30 segundos enquanto a página estiver visível. Alterações de produtos registram o cadastro anterior e posterior na mesma transação. Pedidos de exibição/download de QR passam por `/api/admin/qr`, com destino corrigido para `/index.html?serial=…`. O registro confirma o pedido recebido, não que uma impressão ou download terminou.

O histórico inclui saídas da sessão, mudanças de idioma/consentimento e resgates concluídos, além das verificações e logins existentes. Operações com sessão de cliente válida têm uma referência derivada do cookie, separada do token de autenticação; ela serve para correlacionar a sessão sem expor a credencial. Eventos antigos não recebem esses detalhes retroativamente. O login inicial pode não ter referência, pois o cookie é criado após a autorização.

Isso não é vigilância de toda a navegação: fechamento de aba, ações offline, cópias de QR e alterações físicas de ampolas não são detectáveis por este portal. Os QR continuam baseados no serial, sem assinatura digital ou segredo de ativação separado. IP e cookie não comprovam identidade pessoal; nenhuma identificação persistente entre navegadores foi adicionada. Os dados opcionais continuam condicionados ao consentimento.

## Códigos para atendimento com o vendedor

Ao validar produtos, o servidor emite automaticamente um código por bônus elegível (3, 5 e 10 produtos) e por rank a partir de Prata. Cada código é único e não é regenerado por recarregar a página, rebaixar/subir novamente ou repetir uma consulta. Perfis qualificados existentes recebem os códigos na próxima validação/login ou atualização administrativa. A emissão fica na auditoria (`bonus_code_issued` / `rank_code_issued`), pesquisável pelo código ou ID.

Não há resgate no portal: o cliente apresenta o código ao vendedor, que deve conferir o perfil e sua elegibilidade atual no admin. O site não confirma entrega ou utilização pelo vendedor. Códigos suspensos continuam no histórico. Um rank concedido manualmente pelo admin também habilita seu código.

Aplique `npm run db:migrate` com o servidor local desligado; `npm run local` prepara a migração automaticamente quando usa PGlite. Na Vercel, aplique a migração antes de publicar.

Configure `SELLER_WHATSAPP` em `.env.local` / Vercel, com DDI + DDD + número sem símbolos. O botão só aparece com sessão válida, perfil desbloqueado e pelo menos um produto ativo. O contato padrão é +55 (11) 97957-5223. Defina a variável como vazia para ocultar o botão. Este contato é único para o portal; não existe associação de um vendedor diferente a cada serial nesta versão.

A marca d'água é visual e não impede cópias. No menu do ID, rank e benefícios são informativos; Sair continua funcional.

## Ciclos de bônus por nível

A migração `003_bonus_cycles.sql` preserva os códigos existentes como nível 1. Cada par nível/marco (3, 5, 10 novas ativações) gera no máximo um código por perfil. Os ciclos começam em 0, 10, 20, 30 e 50 produtos ativos, seguindo os limites dos ranks. No nível 2, por exemplo, os cartões renovam ao chegar a 10 produtos; os novos códigos liberam em 13, 15 e 20 produtos. Não há regeneração ilimitada no mesmo nível. Rebaixamento suspende elegibilidade; subir novamente não duplica códigos.

Novas emissões: nível 1, frete grátis / 10% / 15%; nível 2, frete grátis / 15% / 20%; nível 3, 5% vitalício / 20% / 25%; nível 4, 7% vitalício / 25% / 30%; nível 5, 10% vitalício / 30% / 1 produto grátis. Os três marcos continuam em 3, 5 e 10 novas ativações por ciclo. Descontos não cumulativos. Vale apenas o maior desconto vitalício confirmado, limitado a 10%. O vendedor confirma sua ativação uma vez e aplica o desconto nos pedidos futuros; não há checkout no site. O produto grátis é concedido uma única vez no ciclo Diamante. Títulos de códigos já emitidos são preservados.

Em Clientes → Gerenciar → Bônus e resgates, o administrador confirma a utilização após o atendimento do vendedor. A confirmação é auditada, idempotente e bloqueada para clientes. Abrir o WhatsApp não confirma utilização. O cliente continua solicitando o prêmio diretamente ao vendedor; o histórico mantém códigos usados e suspensos.

## Horário da ativação por localização

A migração `004_activation_timezone.sql` adiciona fuso e cidade da primeira ativação. Na Vercel, o servidor valida `x-vercel-ip-timezone` com Intl e salva o fuso IANA fornecido pela borda, sem aceitar o fuso enviado pelo cliente como prova de localização. O instante permanece em UTC. O dashboard do produto exibe esse instante no fuso salvo, incluindo a indicação do deslocamento; os detalhes de auditoria exibem tanto UTC quanto o horário no fuso associado ao IP. Horário de verão segue a data do evento.

Sem fuso disponível, em desenvolvimento local, em atribuições administrativas e em registros anteriores à migração, o produto aparece em UTC com indicação de ausência de localização. Consultas posteriores não alteram o fuso da primeira ativação. A localização por IP é aproximada e pode refletir VPN ou rede da operadora.

Referência: https://vercel.com/docs/headers/request-headers#x-vercel-ip-timezone
