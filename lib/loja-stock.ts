import { PRODUCTS } from "@/app/loja/_lib/catalog";
import { loadCatalog } from "./loja-catalog";

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

/** SKUs of the live catalog (call after loadCatalog()). */
export function stockSkus() {
  return PRODUCTS.map((p) => p.sku);
}

/**
 * `quantity: null` stops controlling the SKU (row removed).
 *
 * `expected` is the quantity the admin was looking at (null = not
 * controlled). The write only happens if the stock is still that value, so
 * an order approved in the meantime (which takes units out) can't be
 * silently undone by an absolute overwrite — the admin gets "conflict" and
 * reloads instead.
 */
export async function setStock(db: D1Database, sku: string, quantity: number | null, expected: number | null, actor: string): Promise<"ok" | "unknown_sku" | "conflict"> {
  await loadCatalog(db);
  if (!stockSkus().includes(sku)) return "unknown_sku";
  const at = new Date().toISOString();
  let changes: number;
  if (quantity === null) {
    if (expected === null) return "ok"; // already not controlled
    changes = (await db.prepare("DELETE FROM loja_stock WHERE sku = ? AND quantity = ?").bind(sku, expected).run()).meta.changes;
  } else if (expected === null) {
    changes = (
      await db
        .prepare("INSERT INTO loja_stock (sku, quantity, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(sku) DO NOTHING")
        .bind(sku, quantity, at, actor)
        .run()
    ).meta.changes;
  } else {
    changes = (
      await db
        .prepare("UPDATE loja_stock SET quantity = ?, updated_at = ?, updated_by = ? WHERE sku = ? AND quantity = ?")
        .bind(quantity, at, actor, sku, expected)
        .run()
    ).meta.changes;
  }
  return changes > 0 ? "ok" : "conflict";
}
