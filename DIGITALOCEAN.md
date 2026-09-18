# Publicação na DigitalOcean

Este projeto está preparado para funcionar como um serviço Node.js no App
Platform, com PostgreSQL para manter os registos de validação.

## Criar a aplicação

1. Na DigitalOcean, escolha **Create > App Platform**.
2. Ligue o repositório `zoioaway1711-cmyk/verifica-farma`.
3. A plataforma reconhecerá o ficheiro `.do/app.yaml`.
4. Confirme o serviço `web` e a base PostgreSQL `verifica-db`.

## Variáveis secretas

No serviço `web`, em **Settings > Environment Variables**, crie:

- `ADMIN_USER`: o login administrativo.
- `ADMIN_PASSWORD`: uma senha forte e exclusiva.
- `SESSION_SECRET`: uma sequência aleatória com pelo menos 32 caracteres.

Marque `ADMIN_PASSWORD` e `SESSION_SECRET` como **Encrypt**. A
`DATABASE_URL` é ligada automaticamente à base definida no app spec.

## Comandos

- Build: `npm ci`
- Run: `npm start`
- Health check: `/health`

O servidor entrega o conteúdo da pasta `dist` e mantém as rotas já usadas
pelo frontend em `/.netlify/functions/*`, portanto o mesmo código continua
compatível com a implantação atual.

## Domínio próprio

O frontend não guarda um domínio fixo. Quando um domínio for associado à
aplicação no App Platform, os novos QR Codes passam automaticamente a usar esse
endereço. Não é necessário alterar o código.

## Execução local

Copie `.env.example` para `.env`, remova `DATABASE_URL` e mantenha
`LOCAL_DATA_FILE=./data/verification-events.json`. Depois execute
`npm install` e `npm start`. O site abre em `http://localhost:8080`.
