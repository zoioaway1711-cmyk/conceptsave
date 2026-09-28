"use client";

import { useSyncExternalStore } from "react";
import { discountPct, getCategory, type Product } from "./catalog";

/*
 * Centralized e-commerce tracking for /loja.
 *
 * Every event goes through `track()` — components and store actions never
 * talk to an analytics backend directly. Event names/params follow the GA4
 * e-commerce schema. Delivery is first-party: batched POSTs to
 * /api/loja/events, stored in the project's own D1 (lib/loja-events.ts),
 * viewable in the admin (Loja → Métricas). No third party is involved.
 *
 * Privacy rules enforced here (and again server-side):
 *  - Payloads are built only from catalog data plus a few allowlisted
 *    fields; no name, e-mail, CPF, phone, address or CEP ever enters them.
 *  - Nothing leaves the browser unless the visitor opted in via the
 *    consent banner (`sc-analytics-consent` = "granted"). Declining or not
 *    answering means events are dropped, not queued.
 *  - The only identifier is a random id per browser tab (sessionStorage).
 */

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_brand: string;
  item_category: string;
  price: number;
  discount?: number;
  quantity?: number;
  index?: number;
  item_list_name?: string;
};

type Ecommerce = { items: AnalyticsItem[]; value?: number; currency?: "BRL"; item_list_name?: string };

export type AnalyticsEvent =
  | { name: "view_item_list"; params: Ecommerce }
  | { name: "select_item"; params: Ecommerce }
  | { name: "view_item"; params: Ecommerce }
  | { name: "add_to_cart"; params: Ecommerce }
  | { name: "remove_from_cart"; params: Ecommerce }
  | { name: "view_cart"; params: Ecommerce }
  | { name: "begin_checkout"; params: Ecommerce }
  | { name: "add_shipping_info"; params: Ecommerce & { shipping_tier: string } }
  | { name: "add_payment_info"; params: Ecommerce & { payment_type: string } }
  | { name: "purchase"; params: Ecommerce & { transaction_id: string } }
  | { name: "add_to_wishlist"; params: Ecommerce }
  | { name: "search"; params: { search_term: string; results: number } }
  | { name: "filter_used"; params: { list: string; filter: string; value: string; active: boolean } }
  | { name: "sort_changed"; params: { list: string; sort: string } }
  | { name: "delivery_lookup"; params: { result: "valid" | "not_found" | "error" } };
// `coupon_attempted`, `coupon_applied` and `delivery_option_selected` are
// reserved for when coupons and multiple delivery options exist
// server-side (see contracts.ts). `purchase` fires when an order is
// registered (payment is collected offline — it is not a payment event).

export const ANALYTICS_CONSENT_KEY = "sc-analytics-consent";
export type Consent = "granted" | "denied" | null;

const consentListeners = new Set<() => void>();

function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: "granted" | "denied") {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    // storage blocked: the choice holds for this page view only
  }
  // Opting out stops everything at once: queued events are dropped (never
  // sent later on pagehide) and the per-tab session id is forgotten, so a
  // later opt-in starts a new, unlinked session.
  if (value === "denied") resetAnalyticsSession();
  consentListeners.forEach((l) => l());
}

export function useConsent() {
  return useSyncExternalStore(
    (l) => {
      consentListeners.add(l);
      return () => consentListeners.delete(l);
    },
    readConsent,
    () => "unknown" as const,
  );
}

type Queued = { name: AnalyticsEvent["name"]; params: AnalyticsEvent["params"]; path: string };
const queue: Queued[] = [];
let timer: number | undefined;
const SESSION_KEY = "sc-loja-sid";

/** Drops pending events and the session id (opt-out, "apagar meus dados"). */
export function resetAnalyticsSession() {
  queue.length = 0;
  if (typeof window === "undefined") return;
  window.clearTimeout(timer);
  timer = undefined;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing stored
  }
}

/*
 * Client-side minimization — personal data must not even LEAVE the browser
 * (the server redacts again before storing, see lib/loja-events.ts):
 *  - a search box receives free text, and people do paste an e-mail, CPF,
 *    phone or CEP into it;
 *  - the order page path carries the order id, which would tie an
 *    "anonymous" session to a named order.
 */
export function redactSearchTerm(term: string) {
  return term
    .replace(/[^\s@]+@[^\s@]+/g, "[e-mail]")
    .replace(/\(?\d[\d.\-\s/()]{3,}\d/g, "[número]")
    .slice(0, 40);
}

export function analyticsPath(pathname: string) {
  return pathname.replace(/^\/loja\/pedido\/[^/]+/, "/loja/pedido/[id]").slice(0, 120);
}

function sessionId() {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id || !/^[a-z0-9]{8,64}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anonymous0";
  }
}

function flush() {
  window.clearTimeout(timer);
  timer = undefined;
  if (!queue.length || readConsent() !== "granted") {
    queue.length = 0;
    return;
  }
  const events = queue.splice(0, 25);
  void fetch("/api/loja/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: sessionId(), events }),
    keepalive: true,
  }).catch(() => {});
  if (queue.length) flush();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function deliver(event: AnalyticsEvent) {
  if (process.env.NODE_ENV !== "production") console.debug("[loja analytics]", event.name, event.params);
  if (readConsent() !== "granted") return;
  const params =
    event.name === "search" ? { ...event.params, search_term: redactSearchTerm(event.params.search_term) } : event.params;
  queue.push({ name: event.name, params, path: analyticsPath(window.location.pathname) });
  if (queue.length >= 20) flush();
  else if (!timer) timer = window.setTimeout(flush, 4000);
}

export function track(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  try {
    deliver(event);
  } catch {
    // Tracking must never break the shopping flow.
  }
}

/* ---------- payload builders (the only place items are shaped) ---------- */

export function toItem(product: Product, extra: Partial<AnalyticsItem> = {}): AnalyticsItem {
  const pct = discountPct(product);
  return {
    item_id: product.sku,
    item_name: product.name,
    item_brand: product.brand,
    item_category: getCategory(product.category)?.name ?? product.category,
    price: product.price,
    ...(pct > 0 && product.oldPrice ? { discount: Math.round((product.oldPrice - product.price) * 100) / 100 } : {}),
    ...extra,
  };
}

export function itemsValue(items: AnalyticsItem[]) {
  return Math.round(items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0) * 100) / 100;
}

export function ecommerce(items: AnalyticsItem[], listName?: string): Ecommerce {
  return { currency: "BRL", value: itemsValue(items), items, ...(listName ? { item_list_name: listName } : {}) };
}
