-- The owner's own photos replace the illustrations of six peptides
-- (public/loja, same file names). As in 0020, only the vial was cropped
-- from the owner's banners; the box and side panel, which carry
-- therapeutic claims, are left out. The vial label is shown as it really
-- is ("uso subcutâneo"), so the image matches the product (see 0021).
-- MOTS-c keeps its illustration: no photo yet.
UPDATE `loja_products` SET image_json = '{"base": "/loja/ghk-cu-50mg", "alt": "Frasco Save Concept GHK-Cu 50mg", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'ghk-cu-50mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/kpv-10mg", "alt": "Frasco Save Concept KPV 10mg", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'kpv-10mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/dsip-5mg", "alt": "Frasco Save Concept DSIP 5mg", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'dsip-5mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/epitalon-50mg", "alt": "Frasco Save Concept Epitalon 50mg", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'epitalon-50mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/selank-10mg", "alt": "Frasco Save Concept Selank 10mg", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'selank-10mg';
--> statement-breakpoint
UPDATE `loja_products` SET image_json = '{"base": "/loja/semax-10mg", "alt": "Frasco Save Concept Semax 10mg", "width": 960, "height": 1280}', updated_at = '2026-09-30T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'semax-10mg';
