"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ecommerce, toItem, track } from "./analytics";
import { getProduct, type Product } from "./catalog";
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

const cartStore = createPersistedStore<CartEntry[]>("sc-loja-cart", EMPTY_CART, (raw) => {
  if (!Array.isArray(raw)) return EMPTY_CART;
  const out: CartEntry[] = [];
  for (const e of raw) {
    if (typeof e?.slug !== "string" || !Number.isFinite(e?.qty) || e.qty <= 0) continue;
    const product = getProduct(e.slug);
    // Entries saved before snapshots existed adopt the current values (no
    // change to report). Unknown slugs are kept only when we still know
    // their name, so the shopper can be told the product was withdrawn.
    const price = isPrice(e.price) ? e.price : product?.price;
    const name = isName(e.name) ? e.name : product?.name;
    if (price === undefined || name === undefined) continue;
    out.push({ slug: e.slug, qty: clampQty(e.qty), price, name });
  }
  return out;
});

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
const ordersStore = createPersistedStore<OrderRef[]>("sc-loja-orders", EMPTY_ORDERS, (raw) =>
  Array.isArray(raw)
    ? raw
        .filter(
          (o): o is OrderRef =>
            typeof o?.id === "string" &&
            /^ord_[0-9a-f-]{36}$/.test(o.id) &&
            typeof o?.token === "string" &&
            /^[0-9a-f]{32}$/.test(o.token) &&
            typeof o?.number === "string" &&
            typeof o?.createdAt === "string" &&
            isPrice(o?.total),
        )
        .slice(0, 20)
    : EMPTY_ORDERS,
);

export const useOrderRefs = ordersStore.useValue;
export function rememberOrder(ref: OrderRef) {
  ordersStore.set((current) => [ref, ...current.filter((o) => o.id !== ref.id)].slice(0, 20));
}

/* ---------- privacy ---------- */

/** Everything the store keeps in this browser, for the account page. */
export function clearAllLocalShoppingData() {
  cartStore.set([]);
  favoritesStore.set([]);
  viewedStore.set([]);
  searchesStore.set([]);
  locationStore.set(null);
  ordersStore.set([]);
  try {
    window.sessionStorage.removeItem("sc-loja-checkout-draft");
  } catch {
    // nothing stored
  }
}
