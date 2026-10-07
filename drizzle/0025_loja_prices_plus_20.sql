-- Owner request (2026-10-07): raise every store price by 20%, except the
-- Tirzepatida 60mg and Retatrutida 60mg vials. The Tirzepatida 60mg Kit Duo
-- (two 60mg vials) is kept as well, so it never costs more than two singles.
-- old_price is scaled too, so existing "de/por" markdowns keep their ratio.
UPDATE loja_products
SET price = ROUND(price * 1.2, 2),
    old_price = CASE WHEN old_price IS NULL THEN NULL ELSE ROUND(old_price * 1.2, 2) END,
    updated_at = '2026-10-07T00:00:00.000Z'
WHERE slug NOT IN ('tirzepatida-60mg', 'retatrutida-60mg', 'tirzepatida-60mg-kit-duo');
