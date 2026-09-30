-- Correction: the owner's photos show that the real labels of these
-- peptides say "uso subcutâneo", not "uso em pesquisa laboratorial" as
-- 0018/0019 stated (MOTS-c: label unknown). The store must not claim a
-- label the product doesn't have, so the research-use label line leaves
-- their description and specs; the illustrations in public/loja no longer
-- print it either. BPC-157 and TB-500 keep it: their real labels say so.
-- replace() leaves a row untouched if an admin already edited that text.
UPDATE `loja_products` SET
  description = replace(description, ', não é vendido pelo site e o rótulo indica uso em pesquisa laboratorial apenas.', ' e não é vendido pelo site.'),
  specs_json = replace(specs_json, '"Rótulo: uso em pesquisa laboratorial apenas"', '"Registro ANVISA: não possui"'),
  updated_at = '2026-09-30T00:00:00.000Z',
  updated_by = 'migration'
WHERE slug IN ('ghk-cu-50mg', 'dsip-5mg', 'epitalon-50mg', 'kpv-10mg', 'mots-c-10mg', 'selank-10mg', 'semax-10mg');
