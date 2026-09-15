# Hospedagem

A versão atual foi adaptada para Vercel + PostgreSQL. Siga [VERCEL.md](./VERCEL.md).

Se preferir um servidor Node.js em outra plataforma, use `npm run build` e `npm start` com `DATABASE_URL`, `ADMIN_USER` e `ADMIN_PASSWORD` configurados. A coleta confiável de IP e geografia nesta versão é específica da Vercel; outro proxy exige adaptação explícita, sem confiar arbitrariamente em cabeçalhos recebidos da internet. Não use o `server.mjs` legado.
