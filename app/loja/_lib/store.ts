"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ecommerce, resetAnalyticsSession, toItem, track } from "./analytics";
import { getProduct, type Product } from "./catalog";
import { ORDER_ID_RE, ORDER_NUMBER_RE, ORDER_TOKEN_RE } from "./checkout";
import { computeTotals } from "./pricing";
import { availabilityOf, useStock } from "./stock";

/*
 * Tiny localStorage-backed stores read through useSyncExternalStore: the
 * server snapshot is always the empty fallback, so SSR/hydration never
 * mismatches, and the real value swaps in right after hydration. Every
 * read is validated — a stale or hand-edited localStorage entry can never
 * inject an unknown product slug or a negative quantity into the cart.
 *
 * Storage is anonymous and per-browser on purpose: the store has no
 * customer accounts yet. Each store is a (key, validate) pair holding plain
 * JSON, so a future account sync only needs to read/write these same
 * shapes (see `LocalShoppingState` in contracts.ts) — no UI changes.
 */
function createPersistedStore<T>(key: string, fallback: T, validate: (raw: unknown) => T) {
  let cache = fallback;
  let loaded = false;
  const listeners = new Set<() => void>();

  function read(): T {
    if (loaded) return cache;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? validate(JSON.parse(raw)) : fallback;
    } catch {
      cache = fallback;
    }
    return cache;
  }

  function set(next: T | ((prev: T) => T)) {
    cache = typeof next === "function" ? (next as (prev: T) => T)(read()) : next;
    loaded = true;
    try {
      window.localStorage.setItem(key, JSON.stringify(cache));
    } catch {
      // Private mode / storage full: state still works for this tab.
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) {
        loaded = false;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue() {
    return useSyncExternalStore(subscribe, read, () => fallback);
  }

  return { useValue, set, get: read, key };
}

/** In-memory (per tab) store for transient UI such as the "added" notice. */
function createMemoryStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    useValue() {
      return useSyncExternalStore(subscribe, () => value, () => initial);
    },
  };
}

const MAX_QTY = 99;
const clampQty = (qty: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(qty)));
const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isName = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 120;

/* ---------- cart ---------- */

/**
 * `price` and `name` are snapshots from when the item was added/last
 * confirmed. They exist only to detect and TELL the shopper what changed
 * since then (task: cart recovery) — totals always use the current
 * catalog price, never the snapshot.
 */
export type CartEntry = { slug: string; qty: number; price: number; name: string };
const EMPTY_CART: CartEntry[] = [];
/** Same bound as the order API (`items.max(30)`): a bigger cart could never be ordered. */
export const MAX_CART_LINES = 30;
/** Catalog slugs are lowercase kebab-case; an unknown one in any other shape was hand-edited. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

const cartStore = createPersistedStore<CartEntry[]>("sc-loja-cart", EMPTY_CART, (raw) => parseCartEntries(raw));

/** Validator for the stored cart (exported for tests). */
export function parseCartEntries(raw: unknown): CartEntry[] {
  if (!Array.isArray(raw)) return EMPTY_CART;
  const out: CartEntry[] = [];
  // Tampered/corrupted storage can hold thousands of entries or the same
  // slug twice (which would double the quantity past the 1–99 bound and
  // duplicate React keys): only the first entry per slug is kept, and the
  // cart is capped at what one order can carry.
  for (const e of raw.slice(0, 200)) {
    if (out.length >= MAX_CART_LINES) break;
    if (typeof e?.slug !== "string" || out.some((o) => o.slug === e.slug)) continue;
    if (!Number.isFinite(e?.qty) || e.qty <= 0) continue;
    const product = getProduct(e.slug);
    // Live catalog slugs always pass; a slug the catalog doesn't know must
    // at least look like one (it's shown as "produto retirado").
    if (!product && !SLUG_RE.test(e.slug)) continue;
    // Entries saved before snapshots existed adopt the current values (no
    // change to report). Unknown slugs are kept only when we still know
    // their name, so the shopper can be told the product was withdrawn.
    const price = isPrice(e.price) ? e.price : product?.price;
    const name = isName(e.name) ? e.name : product?.name;
    if (price === undefined || name === undefined) continue;
    out.push({ slug: e.slug, qty: clampQty(e.qty), price, name });
  }
  return out;
}

export type CartLine = { product: Product; qty: number };
export type CartChange =
  | { kind: "price"; slug: string; name: string; from: number; to: number }
  | { kind: "unavailable"; slug: string; name: string }
  | { kind: "not_purchasable"; slug: string; name: string }
  | { kind: "withdrawn"; slug: string; name: string };

export function useCart() {
  const entries = cartStore.useValue();
  const stock = useStock();
  return useMemo(() => {
    const lines: CartLine[] = [];
    const changes: CartChange[] = [];
    for (const e of entries) {
      const product = getProduct(e.slug);
      if (!product) {
        changes.push({ kind: "withdrawn", slug: e.slug, name: e.name });
        continue;
      }
      const availability = availabilityOf(product, stock);
      if (!availability.buyable) {
        changes.push({ kind: availability.offline ? "not_purchasable" : "unavailable", slug: e.slug, name: product.name });
        continue;
      }
      if (product.price !== e.price) changes.push({ kind: "price", slug: e.slug, name: product.name, from: e.price, to: product.price });
      lines.push({ product, qty: e.qty });
    }
    const totals = computeTotals(lines);
    const hasColdChain = lines.some((l) => l.product.coldChain);
    return { lines, changes, totals, count: totals.itemCount, hasColdChain };
  }, [entries, stock]);
}

/**
 * Shopper saw the change notice: adopt current prices as the new baseline
 * and drop lines that can no longer be bought.
 */
export function acknowledgeCartChanges(changes: CartChange[]) {
  const drop = new Set(changes.filter((c) => c.kind !== "price").map((c) => c.slug));
  cartStore.set((current) =>
    current.flatMap((e) => {
      const product = getProduct(e.slug);
      if (!product || drop.has(e.slug)) return [];
      return [{ ...e, price: product.price, name: product.name }];
    }),
  );
}

export function clearCart() {
  cartStore.set([]);
}

export function addToCart(slug: string, qty = 1, { notify = true, listName }: { notify?: boolean; listName?: string } = {}) {
  const product = getProduct(slug);
  if (!product || !product.available || !product.purchasable) return;
  if (!cartStore.get().some((e) => e.slug === slug) && cartStore.get().length >= MAX_CART_LINES) return;
  cartStore.set((current) => {
    const existing = current.find((e) => e.slug === slug);
    if (existing) return current.map((e) => (e.slug === slug ? { ...e, qty: clampQty(e.qty + qty) } : e));
    return [...current, { slug, qty: clampQty(qty), price: product.price, name: product.name }];
  });
  track({ name: "add_to_cart", params: ecommerce([toItem(product, { quantity: qty, item_list_name: listName })]) });
  if (notify) addedStore.set({ slug, qty, at: Date.now() });
}

export function setCartQty(slug: string, qty: number) {
  const product = getProduct(slug);
  const before = cartStore.get().find((e) => e.slug === slug)?.qty ?? 0;
  const next = clampQty(qty);
  cartStore.set((current) => current.map((e) => (e.slug === slug ? { ...e, qty: next } : e)));
  if (product && next !== before) {
    track({
      name: next > before ? "add_to_cart" : "remove_from_cart",
      params: ecommerce([toItem(product, { quantity: Math.abs(next - before) })]),
    });
  }
}

/** Removes a line and returns a function that puts it back (for "Desfazer"). */
export function removeFromCart(slug: string) {
  let removed: { entry: CartEntry; index: number } | null = null;
  cartStore.set((current) => {
    const index = current.findIndex((e) => e.slug === slug);
    if (index >= 0) removed = { entry: current[index], index };
    return current.filter((e) => e.slug !== slug);
  });
  const product = getProduct(slug);
  const entry = (removed as { entry: CartEntry } | null)?.entry;
  if (product && entry) track({ name: "remove_from_cart", params: ecommerce([toItem(product, { quantity: entry.qty })]) });
  return () => {
    if (!removed) return;
    const { entry: back, index } = removed;
    cartStore.set((current) => {
      if (current.some((e) => e.slug === back.slug)) return current;
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, back);
      return next;
    });
  };
}

export type AddedNotice = { slug: string; qty: number; at: number } | null;
const addedStore = createMemoryStore<AddedNotice>(null);
export const useAddedNotice = addedStore.useValue;
export const dismissAddedNotice = () => addedStore.set(null);

/* ---------- favorites ---------- */

/** `price` is the price when saved — used only to show "o preço mudou". */
export type FavoriteEntry = { slug: string; price: number; name: string; at: number };
const EMPTY_FAVORITES: FavoriteEntry[] = [];

const favoritesStore = createPersistedStore<FavoriteEntry[]>("sc-loja-favorites", EMPTY_FAVORITES, (raw) => {
  if (!Array.isArray(raw)) return EMPTY_FAVORITES;
  const out: FavoriteEntry[] = [];
  for (const e of raw.slice(0, 50)) {
    // v1 stored bare slugs.
    const slug = typeof e === "string" ? e : e?.slug;
    const product = typeof slug === "string" ? getProduct(slug) : undefined;
    if (!product || out.some((f) => f.slug === slug)) continue;
    out.push({
      slug: product.slug,
      price: isPrice(e?.price) ? e.price : product.price,
      name: product.name,
      at: Number.isFinite(e?.at) ? e.at : 0,
    });
  }
  return out;
});

export const useFavoriteEntries = favoritesStore.useValue;

export function useFavorites() {
  const entries = favoritesStore.useValue();
  return useMemo(() => entries.map((e) => e.slug), [entries]);
}

/** Returns true when the product ended up saved. */
export function toggleFavorite(slug: string) {
  const product = getProduct(slug);
  if (!product) return false;
  const saved = favoritesStore.get().some((f) => f.slug === slug);
  favoritesStore.set((current) =>
    saved
      ? current.filter((f) => f.slug !== slug)
      : [{ slug, price: product.price, name: product.name, at: Date.now() }, ...current],
  );
  if (!saved) track({ name: "add_to_wishlist", params: ecommerce([toItem(product)]) });
  return !saved;
}

export function removeFavorite(slug: string) {
  favoritesStore.set((current) => current.filter((f) => f.slug !== slug));
}

/* ---------- recently viewed ---------- */

const EMPTY_LIST: string[] = [];
const viewedStore = createPersistedStore<string[]>("sc-loja-viewed", EMPTY_LIST, (raw) =>
  Array.isArray(raw)
    ? Array.from(new Set(raw.filter((s): s is string => typeof s === "string" && Boolean(getProduct(s))))).slice(0, 8)
    : EMPTY_LIST,
);

export const useRecentlyViewed = viewedStore.useValue;

export function markViewed(slug: string) {
  if (viewedStore.get()[0] === slug) return;
  viewedStore.set((current) => [slug, ...current.filter((s) => s !== slug)].slice(0, 8));
}

export function clearRecentlyViewed() {
  viewedStore.set([]);
}

/* ---------- recent searches ---------- */

const searchesStore = createPersistedStore<string[]>("sc-loja-searches", EMPTY_LIST, (raw) =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.length <= 60).slice(0, 5) : [],
);

export const useRecentSearches = searchesStore.useValue;

export function rememberSearch(term: string) {
  const clean = term.trim().slice(0, 60);
  if (!clean) return;
  searchesStore.set((current) =>
    [clean, ...current.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 5),
  );
}

export function clearRecentSearches() {
  searchesStore.set([]);
}

/* ---------- delivery location (CEP) ---------- */

/**
 * The shopper's CEP plus whatever the lookup confirmed about it. City/UF
 * are only present when the CEP lookup service actually returned them.
 */
export type DeliveryLocation = {
  cep: string;
  city?: string;
  uf?: string;
  street?: string;
  district?: string;
};
const NO_LOCATION: DeliveryLocation | null = null;
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);

const locationStore = createPersistedStore<DeliveryLocation | null>("sc-loja-cep", NO_LOCATION, (raw) => {
  // v1 stored the bare 8-digit string.
  if (typeof raw === "string") return /^\d{8}$/.test(raw) ? { cep: raw } : null;
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.cep !== "string" || !/^\d{8}$/.test(r.cep)) return null;
  return { cep: r.cep, city: str(r.city, 80), uf: str(r.uf, 2), street: str(r.street, 160), district: str(r.district, 80) };
});

export const useDeliveryLocation = locationStore.useValue;
export const saveDeliveryLocation = (location: DeliveryLocation) => locationStore.set(location);
export const clearDeliveryLocation = () => locationStore.set(null);

export function useCep() {
  return locationStore.useValue()?.cep ?? "";
}

export function formatCep(digits: string) {
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/* ---------- orders placed in this browser ---------- */

/**
 * The store has no accounts, so "Meus pedidos" lists orders placed from
 * this browser: id + access token (the capability for the order page) and
 * a few display fields. The order itself always comes from the server.
 */
export type OrderRef = { id: string; number: string; token: string; createdAt: string; total: number };
const EMPTY_ORDERS: OrderRef[] = [];
export { ORDER_ID_RE, ORDER_TOKEN_RE };

/**
 * Every field is checked, not just its type: `createdAt` goes straight into
 * Intl.DateTimeFormat#format, which THROWS on an invalid date — one
 * corrupted entry used to crash the whole "Minha conta" page.
 */
export function isOrderRef(o: unknown): o is OrderRef {
  const r = o as Partial<OrderRef> | null;
  return (
    typeof r?.id === "string" &&
    ORDER_ID_RE.test(r.id) &&
    typeof r.token === "string" &&
    ORDER_TOKEN_RE.test(r.token) &&
    typeof r.number === "string" &&
    ORDER_NUMBER_RE.test(r.number) &&
    typeof r.createdAt === "string" &&
    r.createdAt.length <= 40 &&
    Number.isFinite(Date.parse(r.createdAt)) &&
    isPrice(r.total) &&
    r.total < 10_000_000
  );
}

const ordersStore = createPersistedStore<OrderRef[]>("sc-loja-orders", EMPTY_ORDERS, (raw) =>
  Array.isArray(raw) ? raw.slice(0, 50).filter(isOrderRef).slice(0, 20) : EMPTY_ORDERS,
);

export const useOrderRefs = ordersStore.useValue;
export function rememberOrder(ref: OrderRef) {
  if (!isOrderRef(ref)) return;
  ordersStore.set((current) => [ref, ...current.filter((o) => o.id !== ref.id)].slice(0, 20));
}

/*
 * Order access tokens for the order page. The token is a capability (whoever
 * has it sees the order), so it is kept OUT of the address bar: the order
 * page reads `?t=` once, stores it here and strips it from the URL. Orders
 * placed in this browser don't even need it in the URL — their token is in
 * "Meus pedidos" (`sc-loja-orders`). This per-tab map (memory + session
 * storage, so a reload still works) covers links opened from elsewhere.
 */
const ACCESS_KEY = "sc-loja-order-access";
const accessMemory = new Map<string, string>();

function readAccessMap(): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(ACCESS_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [id, token] of Object.entries(raw).slice(0, 10)) {
      if (ORDER_ID_RE.test(id) && typeof token === "string" && ORDER_TOKEN_RE.test(token)) out[id] = token;
    }
    return out;
  } catch {
    return {};
  }
}

export function rememberOrderAccess(id: string, token: string) {
  if (!ORDER_ID_RE.test(id) || !ORDER_TOKEN_RE.test(token)) return;
  accessMemory.set(id, token);
  try {
    // Newest first, capped: the map never grows without bound.
    const older = Object.entries(readAccessMap()).filter(([k]) => k !== id);
    window.sessionStorage.setItem(ACCESS_KEY, JSON.stringify(Object.fromEntries([[id, token], ...older].slice(0, 10))));
  } catch {
    // storage blocked: the in-memory copy still serves this page view
  }
}

/** Token for an order: this tab's access map first, then "Meus pedidos". */
export function orderAccessToken(id: string, refs: OrderRef[] = ordersStore.get()) {
  if (typeof window === "undefined" || !ORDER_ID_RE.test(id)) return "";
  return accessMemory.get(id) ?? readAccessMap()[id] ?? refs.find((o) => o.id === id)?.token ?? "";
}

/** Shareable order link (the one place the token is put back into a URL). */
export function orderShareUrl(id: string, token: string) {
  return `${window.location.origin}/loja/pedido/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;
}

/* ---------- privacy ---------- */

/**
 * Everything the store keeps in this browser, for the account page —
 * including the per-tab order access map and the analytics session id.
 */
export function clearAllLocalShoppingData() {
  cartStore.set([]);
  favoritesStore.set([]);
  viewedStore.set([]);
  searchesStore.set([]);
  locationStore.set(null);
  ordersStore.set([]);
  accessMemory.clear();
  resetAnalyticsSession();
  try {
    window.sessionStorage.removeItem("sc-loja-checkout-draft");
    window.sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    // nothing stored
  }
}
