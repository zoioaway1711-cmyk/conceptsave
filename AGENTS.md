# Instruções do projeto VerificaFarma

## Idioma e comunicação

- Responda sempre em português do Brasil.
- Explique comandos de terminal de forma simples e em etapas.
- Use nomes técnicos em inglês somente quando forem nomes reais de arquivos, bibliotecas, APIs ou comandos.
- Antes de encerrar, informe claramente o que foi alterado e como testar.

## Objetivo do produto

- Este projeto é o portal VerificaFarma da Save Concept.
- Preserve a identidade visual azul, branca, moderna, limpa, responsiva e com efeitos discretos de transparência, blur e movimento.
- Preserve os fluxos existentes de autenticação por serial/QR Code, painel administrativo, perfis, verificações e benefícios.
- Não remova funcionalidades existentes sem autorização explícita.
- Nunca inclua credenciais, tokens, senhas reais ou dados de produção no código.

## Estrutura importante

- `app/`: páginas, layout e rotas de API.
- `components/`: componentes React e interface.
- `components/ui/`: componentes reutilizáveis.
- `db/` e `drizzle/`: banco de dados e migrações.
- `lib/`: autenticação e utilitários.
- `public/`: imagens, PWA e versão estática legada.

## Comandos obrigatórios

- Instalar: `npm ci`
- Desenvolvimento: `npm run dev`
- Verificação: `npm run lint`
- Build final: `npm run build`
- O projeto exige Node.js 22.x.

## Trabalho com agentes

- Em tarefas grandes, delegue partes independentes aos agentes especializados do projeto.
- Use `frontend_save` para layout, responsividade, React, Tailwind, Shadcn e Framer Motion.
- Use `backend_save` para rotas de API, autenticação, D1/Drizzle, seriais, QR Code e regras de benefícios.
- Use `revisor_save` para inspeção final, segurança, regressões, lint e build.
- O agente principal coordena os resultados e mantém a decisão final.
- Evite dois agentes editando o mesmo arquivo simultaneamente. Faça exploração e revisão em paralelo; centralize alterações conflitantes no agente principal.
- Para mudanças relevantes, aguarde os agentes necessários, integre os resultados e execute `npm run lint` e `npm run build`.

## Critério de conclusão

- A alteração solicitada funciona no fluxo real.
- A interface continua responsiva em celular e desktop.
- Nenhuma credencial foi adicionada ao repositório.
- `npm run lint` e `npm run build` foram executados; qualquer falha deve ser corrigida ou relatada com precisão.

