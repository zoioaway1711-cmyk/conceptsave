# Publicar Save Concept na Vercel

Esta versão usa **Next.js + PostgreSQL**, com rotas Node.js. Não depende mais de Cloudflare Workers/D1 para executar o portal ou as APIs. O tema claro/escuro, leitor QR e efeitos visuais foram preservados.

## 1. Criar o projeto e o banco

Importe o repositório na Vercel. Selecione o preset **Next.js**, Node.js 22 e mantenha os comandos de `vercel.json`: instalação `npm ci`, build `npm run build`. Não use a pasta `dist` como saída nem exportação estática; o projeto precisa das funções de servidor.

Conecte um PostgreSQL (por exemplo, Neon ou Supabase via Vercel Marketplace). Prefira a URL com pooling para as funções e banco na mesma região da aplicação. O banco é um serviço separado: fazer upload do ZIP não cria o banco automaticamente.

Configure estas variáveis no projeto, com valores distintos entre Production e Preview:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | URL PostgreSQL do provedor, com usuário, senha, banco e TLS conforme a configuração oficial do serviço |
| `ADMIN_USER` | Usuário do painel |
| `ADMIN_PASSWORD` | Senha exclusiva, longa e aleatória do painel |

Nunca use prefixo `NEXT_PUBLIC_` nessas variáveis. Não copie `.local`, `.wrangler`, `.env` ou `.env.local` para o repositório. A senha local não é enviada automaticamente para a Vercel.

As sessões agora são tokens aleatórios com hash no PostgreSQL; `SESSION_SECRET` da versão antiga não é mais necessário. Não defina `ALLOW_LOCAL_DB` na Vercel. Sem `DATABASE_URL`, a aplicação hospedada recusa o fallback local.

## 2. Preparar as tabelas

Na sua máquina, configure a URL do banco que deseja preparar no arquivo **`.env.local`** (ignorado pelo Git):

```dotenv
DATABASE_URL=postgresql://USUARIO:SENHA@HOST/BANCO?sslmode=require
```

Use o valor completo fornecido pelo seu provedor. Depois:

```sh
npm ci
npm run db:migrate
```

As migrações têm controle de versão e transação; reexecutar não apaga os registros. Não rode uma migração em produção sem backup e homologação. O esquema está em `database/001_initial.sql`.

Se quiser importar o catálogo que acompanhava este projeto, execute **uma vez**:

```sh
npm run db:seed
```

Esse comando importa os produtos de `database/catalog-seed.json` e não sobrescreve seriais existentes. Revise o catálogo antes de utilizá-lo como registro oficial. Os códigos que já estiveram no JavaScript público devem ser tratados como conhecidos, não como segredos.

Migrations e seed não rodam automaticamente durante o build da Vercel; isso evita que um Preview altere a base de produção.

## 3. Publicar e validar

Depois de preparar o banco e os segredos, faça o deploy/redeploy na Vercel. Verifique:

- `/api/health`: responde `{"ok":true}` com o banco conectado.
- `/admin`: autentica com as variáveis definidas no projeto.
- Login por serial cadastrado e ativo: gera registro de login e primeira ativação quando ainda não creditado.
- Repetir a consulta: registra o acesso, mas não duplica pontos.
- Painel: filtros, detalhes, CSV, histórico por perfil e bloqueio de usuário.
- Logout: invalida a sessão também no banco.

Não houve publicação externa nesta revisão: o projeto e os testes locais estão preparados, mas conexão com sua conta, banco remoto e domínio dependem da configuração acima.

## IP e localização na Vercel

O servidor lê os cabeçalhos da borda Vercel (`x-vercel-forwarded-for`, `x-vercel-ip-*`) somente quando executa nesse ambiente. Dados de IP, país/cidade e resultado de autenticidade enviados no corpo pelo navegador são ignorados.

O painel apresenta IP público, país, região, cidade e coordenadas aproximadas quando disponibilizados, navegador/sistema inferidos do User-Agent, domínio e endpoint acessado, referência sem parâmetros, horário UTC e identificador da requisição. Método de leitura e metadados opcionais do dispositivo são declarações do cliente e assim devem ser interpretados.

A Vercel não garante cidade/coordenadas em toda requisição. Ausência vira “não disponível”. Não há busca em serviços externos de geolocalização, GPS ou tentativa de obter IP privado da rede. VPNs, proxies e operadoras podem apontar para outra cidade. Em desenvolvimento local os cabeçalhos geográficos são ignorados.

Os eventos antigos não ganham localização retroativamente. A pasta D1 antiga `.wrangler` permanece intacta; não é o banco PostgreSQL e não é importada automaticamente. A migração desses registros precisa de uma exportação e revisão separadas, pois a versão anterior aceitava dados de autenticidade e pontos do cliente.

## Operação e segurança

Ative HTTPS, MFA na conta Vercel/banco, firewall/rate limiting também na borda, backups com recuperação pontual no PostgreSQL, alertas de erro e consumo. Teste a restauração dos backups. Defina retenção de dados de auditoria compatível com a finalidade; não há limpeza automática de histórico nesta versão.

O login por serial foi preservado por compatibilidade: **quem conhece um serial de acesso pode entrar no perfil associado**. A assinatura/sessão no servidor não transforma um código curto em prova de identidade. Para identificar pessoas de forma forte, adote contas individuais com e-mail/passkey e um segredo separado de ativação de uso único. O painel mostra perfis por serial, não nomes ou endereços pessoais inferidos.

Referências oficiais:

- [Vercel: bancos e armazenamento](https://vercel.com/docs/storage)
- [Vercel: cabeçalhos de IP e geolocalização](https://vercel.com/docs/headers/request-headers)
