-- The owner's own photos replace the illustrations of BPC-157 and TB-500
-- (public/loja, same file names). Only the vial was used, cropped from the
-- owner's banners: the rest of the banner (box and side panel) carries
-- therapeutic claims the study showcase must not show. The other peptides
-- keep their illustrations until photos with a research-use label and no
-- claims arrive.
UPDATE `loja_products` SET image_json = '{"base": "/loja/bpc-157-5mg", "alt": "Frasco Save Concept BPC-157 5mg, rótulo de uso somente para pesquisa laboratorial", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'bpc-157-5mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/tb-500-5mg", "alt": "Frasco Save Concept TB-500 5mg, rótulo de uso somente para pesquisa laboratorial", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'tb-500-5mg';
