# Loja Save Concept — revisão regulatória do catálogo

> Levantamento técnico feito durante o desenvolvimento da loja (`/loja`), em 24/09/2026.
> **Não é parecer jurídico.** Serve de roteiro para validação com advogado e responsável técnico
> (farmacêutico) antes de a loja receber pedidos reais.

## Decisão já aplicada no código

Por decisão do responsável pelo projeto (os frascos **não têm registro/autorização** para venda ao
consumidor e o rótulo diz "USO EM PESQUISA LABORATORIAL APENAS"):

- **Frascos e kits** (Tirzepatida 60mg, Retatrutida 60mg, Kit Duo) ficam visíveis apenas para
  consulta: sem botão de compra, sem "Compre junto", sem dados de oferta no Google (JSON-LD sem
  `Offer`), e **o servidor recusa** pedidos com esses itens (`POST /api/loja/orders` →
  `not_purchasable`), não só a interface.
- Em 30/09/2026 entraram três peptídeos como **vitrine de estudo** (BPC-157 5mg, TB-500 5mg,
  GHK-Cu 50mg — migração `0018_loja_peptides.sql`), na categoria `frascos`: mesmo bloqueio acima,
  sem avaliações, sem "Compre junto", sem posologia/via de aplicação e com imagem marcada como
  "IMAGEM ILUSTRATIVA". Eles também não têm registro na ANVISA, então entram na mesma validação
  jurídica dos frascos. No mesmo dia, a migração `0019_loja_peptides_more.sql` acrescentou mais seis
  no mesmo regime (Epitalon 50mg, Semax 10mg, Selank 10mg, KPV 10mg, MOTS-c 10mg, DSIP 5mg). Ficaram
  de fora os ligados a GH/IGF/hormônios, os que existem como medicamento de prescrição
  (semaglutida, tesamorelina, bremelanotida/PT-141, elamipretida/SS-31) e o Melanotan.
- **Correção (30/09/2026, migração `0021`):** as fotos do responsável mostraram que o rótulo real de
  GHK-Cu, DSIP, Epitalon, KPV, Selank e Semax diz **"uso subcutâneo"**, e não "uso em pesquisa
  laboratorial" como a loja dizia (do MOTS-c não há foto). A loja deixou de afirmar esse rótulo para
  esses sete: o texto diz só que não têm registro na ANVISA e não são vendidos pelo site, e as
  ilustrações não trazem mais a frase. BPC-157 e TB-500 mantêm a frase, porque o rótulo real diz isso.
  Os banners enviados (com promessas de efeito e "uso subcutâneo") **não** foram publicados.
- **Fotos (migrações `0020` e `0022`):** BPC-157, TB-500, GHK-Cu, KPV, DSIP, Epitalon, Selank e Semax
  usam a foto do responsável recortada só no frasco (sem a caixa e os painéis com promessas de
  efeito). O rótulo aparece como é de verdade — nos seis últimos, com "uso subcutâneo", o que
  reforça o ponto 3 da tabela abaixo para a validação jurídica. MOTS-c segue com ilustração.
- Somente **Kit de Aplicação Premium** e **Diluente Bacteriostático** podem ser pedidos online.
- A chave de controle é o campo `purchasable` em `app/loja/_lib/catalog.ts`.

## Pontos que precisam de validação antes de receber pedidos

| # | Onde | Texto / situação | Risco | Recomendação |
|---|------|------------------|-------|--------------|
| 1 | Diluente Bacteriostático (vendável online) | Solução estéril injetável, NaCl 0,9%, "multiperfuração", "compatível com toda a linha injetável" | Solução injetável costuma exigir registro na ANVISA como medicamento, e a venda online de medicamentos tem regras próprias (RDC 44/2009 e normas posteriores sobre comércio eletrônico por farmácias). | Confirmar registro/enquadramento **antes** de manter `purchasable: true`. Sem isso, trocar para `false`. |
| 2 | Kit de Aplicação Premium (vendável online) | "10 seringas 1ml com agulha 31G" | Seringas e agulhas são produtos para saúde (registro/notificação na ANVISA do fabricante). A revenda exige que os itens sejam regularizados e rastreáveis. | Confirmar a regularização das seringas/agulhas (fabricante, registro, lote) e exibir isso no produto. |
| 3 | Frascos (spec) | "Uso: multidose, via subcutânea" | Contradiz o rótulo "uso em pesquisa laboratorial apenas" e indica uso humano. | Remover ou adequar ao rótulo, conforme orientação jurídica. |
| 4 | Kit Duo (descrição) | "…com desconto pra quem já fechou a rotina de 2 meses" | Sugere regime de uso/posologia. | Remover. |
| 5 | Categoria Acessórios + Kit de Aplicação | "rotina de aplicação", "cartela de controle de aplicação", venda de seringas junto com frascos de pesquisa | Um produto "para pesquisa" vendido com kit de aplicação e linguagem de rotina tende a ser lido como destinado a uso humano. | Rever o posicionamento em conjunto com os itens 1–4. |
| 6 | Avaliações (home e cards) | 779 avaliações, notas 4,7–4,9, depoimentos "Compra verificada" | Se não vierem de compras reais registradas, configuram prova social falsa (CDC, art. 37). | Confirmar a origem. Se não houver base, remover as notas, os depoimentos e o selo "compras verificadas". |
| 7 | Selo "Mais vendido" (Tirzepatida) | Afirmação comparativa | Precisa de base em dados de venda. | Manter só com dado real; hoje os pedidos online nem existem para esse item. |
| 8 | Marca | "50 mil frascos por ano", "Lote testado / controle interno" | Alegações de capacidade e qualidade precisam ser comprováveis. | Guardar evidência (produção, laudos de lote). |
| 9 | Aviso na página dos frascos | "Leia com atenção as informações… Em caso de dúvida, consulte um profissional de saúde." | Texto neutro, adicionado pelo desenvolvimento; não classifica o produto. | Substituir pelo texto que o jurídico definir. |

## O que o sistema faz para não criar novos problemas

- Nenhum estoque, prazo, cupom, rastreio, desconto ou status é inventado: estoque vem de
  `loja_stock` (editado no admin), status só muda por ação registrada no admin, e o prazo exibido é
  o prazo médio publicado (3 a 7 dias úteis).
- Pedido registrado **não é** pagamento aprovado: o status inicial é "Pedido recebido" e a tela diz
  claramente que o pagamento ainda será combinado.
- CPF guardado **criptografado**; a revelação no admin exige permissão e fica no log de auditoria.
- Analytics só com consentimento explícito e sem dados pessoais.

## Como mudar a disponibilidade depois da validação

Em `app/loja/_lib/catalog.ts`, ajuste `purchasable` de cada produto. O servidor passa a aceitar ou
recusar o item automaticamente; a interface acompanha. Depois: `npm run build` e deploy.
