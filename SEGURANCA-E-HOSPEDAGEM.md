# Segurança da versão Vercel

A versão atual migra de D1 para PostgreSQL e usa Next.js no runtime Node.js. O guia de publicação vigente é [VERCEL.md](./VERCEL.md).

## Proteções implementadas

- Autenticação administrativa, comparação de credenciais por hash em tempo constante e limite persistente de tentativas.
- Sessões aleatórias HttpOnly, SameSite=Strict e Secure na Vercel; somente hashes dos tokens ficam no banco. Logout e bloqueio revogam sessões no servidor.
- APIs de perfil restritas à sessão correspondente. Pontos, nível, autenticidade e benefícios não são aceitos do navegador.
- Ativação transacional, propriedade única do serial e resgate idempotente por perfil/benefício, protegidos por restrições do PostgreSQL.
- Catálogo removido dos arquivos públicos. Administração altera a base central e as consultas seguintes usam o estado do servidor.
- Registros de data/hora, IP e localização derivados da requisição na borda Vercel; valores geográficos enviados pelo cliente são ignorados.
- Sanitização dos metadados, consentimento para dados opcionais, escape de texto no painel e proteção contra fórmulas nos CSVs.
- JSON limitado a 256 KiB, rejeição de origem cruzada, cabeçalhos de proteção e ausência de cache nas APIs/admin. Service worker não armazena respostas pessoais.
- SQL parametrizado, pool de conexões com limites, migrations versionadas e testes em PostgreSQL local isolado.

## Limitações que permanecem

O acesso do cliente continua por serial, por compatibilidade com o fluxo solicitado. Quem conhece o código pode acessar o perfil correspondente; não há confirmação de identidade pessoal. Os seriais curtos, especialmente os que estiveram no catálogo público da versão anterior, não devem ser tratados como senhas fortes. Contas individuais com e-mail/passkey e segredo aleatório de ativação separado são o próximo passo para autenticação forte.

Cidade e coordenadas são aproximadas, podem faltar ou refletir VPN/operadora. User-Agent, método de leitura e metadados opcionais podem ser alterados pelo cliente; não constituem evidência conclusiva de fraude. Nenhuma coleta de GPS ou endereço privado foi adicionada.

Os limites por IP reduzem abuso, mas não substituem WAF, limites globais/por conta, proteção contra ataques distribuídos, MFA da infraestrutura, monitoramento e backups com restauração testada. O catálogo é o registro administrativo do site; a consulta não substitui confirmação física de autenticidade.

Os dados antigos D1 ficam preservados na pasta anterior e não são importados automaticamente. A exportação histórica precisa identificar registros legados, pois antes o cliente podia enviar status e pontos livremente.

Histórico de eventos é paginado em blocos de 50; detalhes de perfil exibem os últimos 100. Dados opcionais de dispositivo respeitam a preferência de utilização; IP, User-Agent e geografia aproximada servem à auditoria de segurança e devem constar no aviso de privacidade. Defina uma política de retenção antes de operar em produção.

Não foi realizado pentest externo nem teste contra um banco Vercel remoto. O deploy só estará funcional após configurar PostgreSQL e segredos e executar as migrações. Testes locais não são garantia absoluta contra ataques.
