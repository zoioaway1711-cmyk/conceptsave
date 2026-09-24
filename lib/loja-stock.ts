import { PRODUCTS } from "@/app/loja/_lib/catalog";

/*
 * Controlled stock for storefront SKUs (loja_stock). A SKU without a row
 * is "not controlled": its availability is whatever the catalog says.
 * The storefront only ever sees available/low — never raw quantities —
 * and "low" is only shown when it's actually true (≤ LOW_STOCK units).
 */

export const LOW_STOCK = 3;

export type StockRow = { sku: string; quantity: number; updatedAt: string; updatedBy: string };
export type PublicStock = Record<string, { available: boolean; low: boolean }>;

export async function listStock(db: D1Database) {
  const { results } = await db
    .prepare("SELECT sku, quantity, updated_at AS updatedAt, updated_by AS updatedBy FROM loja_stock")
    .all<StockRow>();
  return results;
}

export async function publicStock(db: D1Database): Promise<PublicStock> {
  const rows = await listStock(db);
  const out: PublicStock = {};
  for (const r of rows) out[r.sku] = { available: r.quantity > 0, low: r.quantity > 0 && r.quantity <= LOW_STOCK };
  return out;
}

export const STOCK_SKUS = PRODUCTS.map((p) => p.sku);

/** `quantity: null` stops controlling the SKU (row removed). */
export async function setStock(db: D1Database, sku: string, quantity: number | null, actor: string) {
  if (!STOCK_SKUS.includes(sku)) return false;
  if (quantity === null) {
    await db.prepare("DELETE FROM loja_stock WHERE sku = ?").bind(sku).run();
    return true;
  }
  await db
    .prepare(
      "INSERT INTO loja_stock (sku, quantity, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(sku) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    )
    .bind(sku, quantity, new Date().toISOString(), actor)
    .run();
  return true;
}
