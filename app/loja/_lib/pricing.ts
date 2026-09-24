import { STORE, type Product } from "./catalog";

/*
 * The ONE place order totals are derived. Cart, checkout and (future)
 * order confirmation all render `OrderTotals` through <OrderSummary/>, so
 * the screens can't drift apart visually or mathematically.
 *
 * Today the storefront has no pricing backend: prices come from the
 * catalog and there are no coupons or shipping quotes. When a server-side
 * quote exists, replace `computeTotals` with its response (same shape —
 * see `OrderQuote` in contracts.ts) instead of recalculating here.
 */

export type ShippingState =
  | { kind: "free" }
  /** No quote exists yet (accessories have no published shipping price). */
  | { kind: "pending" }
  | { kind: "quoted"; amount: number };

export type OrderTotals = {
  itemCount: number;
  /** Sum at list price (oldPrice when present). */
  listSubtotal: number;
  /** Catalog markdowns (oldPrice − price). */
  productDiscount: number;
  /** Reserved for server-validated coupons; always 0 until they exist. */
  couponDiscount: number;
  shipping: ShippingState;
  /** Everything currently known. Excludes shipping while it's pending. */
  total: number;
  installments: { count: number; amount: number };
};

export function computeTotals(lines: { product: Product; qty: number }[]): OrderTotals {
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const listSubtotal = round(lines.reduce((s, l) => s + l.qty * (l.product.oldPrice ?? l.product.price), 0));
  const subtotal = round(lines.reduce((s, l) => s + l.qty * l.product.price, 0));
  const shipping = shippingFor(lines);
  const total = subtotal + (shipping.kind === "quoted" ? shipping.amount : 0);
  return {
    itemCount,
    listSubtotal,
    productDiscount: round(listSubtotal - subtotal),
    couponDiscount: 0,
    shipping,
    total,
    installments: { count: STORE.maxInstallments, amount: round(total / STORE.maxInstallments) },
  };
}

/** Only the catalog's free-shipping flag is known; everything else awaits a quote. */
function shippingFor(lines: { product: Product }[]): ShippingState {
  return lines.length > 0 && lines.every((l) => l.product.freeShipping) ? { kind: "free" } : { kind: "pending" };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
