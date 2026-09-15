# Publicar na Vercel

Importe o repositório e selecione Next.js. Build: npm run build.
Configure DATABASE_URL (PostgreSQL), ADMIN_USER, ADMIN_PASSWORD e SELLER_WHATSAPP.
Aplique as migrações ao banco com npm run db:migrate usando DATABASE_URL configurada no ambiente.
O catálogo inicial está vazio para não publicar seriais ativos. Cadastre os produtos no painel admin.
Para executar localmente: npm ci e npm run local.
Não envie .env.local ou o banco .local ao GitHub.
