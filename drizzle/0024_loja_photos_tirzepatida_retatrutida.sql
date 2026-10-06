-- New owner photos for Tirzepatida 60mg and Retatrutida 60mg (public/loja,
-- same file names, now both 960x1280). Only the retatrutida height changed
-- (it was 1283); tirzepatida's image_json already matches. WHERE leaves the
-- row untouched if an admin already pointed it at another image.
UPDATE `loja_products` SET image_json = '{"base": "/loja/retatrutida-60mg", "alt": "Frasco Save Concept Retatrutida 60mg", "width": 960, "height": 1280}', updated_at = '2026-10-06T00:00:00.000Z', updated_by = 'migration' WHERE slug = 'retatrutida-60mg' AND image_json LIKE '%"/loja/retatrutida-60mg"%';
