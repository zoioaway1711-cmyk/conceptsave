-- The owner's photos for the last three products without one (public/loja):
-- MOTS-c (replaces the illustration), the diluent and the Tirzepatida Kit
-- Duo (now its own two-vial image, no longer the single-vial one). The Kit
-- Duo picture is the owner's banner minus its bottom strip of quality claims.
-- The diluent's real label reads "água para injeção com benzil álcool 0,9%"
-- (bacteriostatic water), not the "NaCl 0,9%" the catalog stated — the store
-- must not describe a product differently from its label, so presentation,
-- spec and keywords follow the label. replace()/WHERE leave a row untouched
-- if an admin already edited that text.
UPDATE `loja_products` SET image_json = '{"base": "/loja/mots-c-10mg", "alt": "Frasco Save Concept MOTS-c 10mg, rótulo de uso somente para pesquisa laboratorial", "width": 960, "height": 1280}', updated_at = '2026-10-05T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'mots-c-10mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/tirzepatida-60mg-kit-duo", "alt": "Kit Duo Save Concept com dois frascos de Tirzepatida 60mg", "width": 960, "height": 1280}', updated_at = '2026-10-05T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'tirzepatida-60mg-kit-duo';
--> statement-breakpoint
UPDATE `loja_products` SET
  image_json = '{"base": "/loja/diluente", "alt": "Frasco de Diluente Bacteriostático Save Concept 10mL", "width": 960, "height": 1280}',
  specs_json = replace(specs_json, '"Composição: NaCl 0,9% bacteriostático"', '"Composição: água para injeção com álcool benzílico 0,9%"'),
  keywords_json = replace(keywords_json, '"nacl","soro"', '"benzilico","agua bacteriostatica"'),
  updated_at = '2026-10-05T00:00:00.000Z',
  updated_by = 'migration'
WHERE slug = 'diluente-bacteriostatico';
--> statement-breakpoint
UPDATE `loja_products` SET presentation = 'Água bacteriostática · 10ml' WHERE slug = 'diluente-bacteriostatico' AND presentation = 'NaCl 0,9% · 10ml';
