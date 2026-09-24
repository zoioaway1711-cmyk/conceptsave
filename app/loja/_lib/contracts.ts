/*
 * Contracts for storefront features that still DEPEND ON BACKEND WORK.
 * Nothing in the app fabricates these objects. What already exists for
 * real lives elsewhere:
 *
 *   Implemented                        Where
 *   ─────────────────────────────────  ───────────────────────────────────
 *   Orders (create, view, admin flow)  lib/loja-orders.ts, /api/loja/orders
 *   Order statuses                     app/loja/_lib/order-status.ts
 *   Controlled stock                   lib/loja-stock.ts, /api/loja/stock
 *   First-party analytics              lib/loja-events.ts, /api/loja/events
 *   CEP → address                      /api/loja/cep/:cep (ViaCEP)
 *
 *   Still pending                      Needs
 *   ─────────────────────────────────  ───────────────────────────────────
 *   Online payment                     a gateway (provider not chosen) +
 *                                      webhook to set payment_approved
 *   Store login / cross-device orders  customer auth for the store
 *   Re-order ("Comprar novamente")     login, so order history follows the
 *                                      customer (today: this browser only)
 *   Coupons                            POST /api/loja/quote { coupon }
 *   Carrier quote / per-CEP delivery   carrier API (shipping is free today)
 *   Store pickup                       pickup units with address/hours
 */

import type { OrderStatus } from "./order-status";
import type { DeliveryLocation } from "./store";

export type { OrderStatus } from "./order-status";

export type OrderLine = { sku: string; name: string; qty: number; unitPrice: number; listUnitPrice?: number };

export type Fulfillment =
  | { kind: "delivery"; address: Required<Pick<DeliveryLocation, "cep" | "street" | "district" | "city" | "uf">> & { number: string; complement?: string }; carrier?: string; trackingCode?: string; trackingUrl?: string; estimatedDate?: string }
  | { kind: "pickup"; unitId: string; unitName: string; unitAddress: string; readyAt?: string };

export type OrderQuote = {
  /** Server-computed; the UI renders these, it never recomputes them. */
  listSubtotal: number;
  productDiscount: number;
  coupon?: { code: string; discount: number };
  shipping: { kind: "free" } | { kind: "quoted"; amount: number; window: string };
  total: number;
  installments: { count: number; amount: number };
};

export type Order = {
  id: string;
  number: string;
  createdAt: string;
  status: OrderStatus;
  /** Timeline entries exactly as recorded server-side. */
  history: { status: OrderStatus; at: string }[];
  lines: OrderLine[];
  fulfillment: Fulfillment;
  payment: { method: "pix" | "cartao" | "boleto"; installments?: number; status: "pending" | "approved" | "refused" | "refunded" };
  totals: OrderQuote;
};

export type CouponResult =
  | { state: "applied"; code: string; discount: number }
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "not_eligible"; reason?: string }
  | { state: "error" };

/** Shape of everything kept locally today — what an account sync would upload. */
export type LocalShoppingState = {
  cart: { slug: string; qty: number; price: number; name: string }[];
  favorites: { slug: string; price: number; name: string; at: number }[];
  recentlyViewed: string[];
  recentSearches: string[];
  location: DeliveryLocation | null;
};
