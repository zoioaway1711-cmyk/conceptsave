"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getProduct, type Product } from "./catalog";

/*
 * Tiny localStorage-backed stores read through useSyncExternalStore: the
 * server snapshot is always the empty fallback, so SSR/hydration never
 * mismatches, and the real value swaps in right after hydration. Every
 * read is validated — a stale or hand-edited localStorage entry can never
 * inject an unknown product slug or a negative quantity into the cart.
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

  return { useValue, set };
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

const slugList = (limit: number) => (raw: unknown) =>
  Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === "string" && Boolean(getProduct(s))).slice(0, limit)
    : [];

type CartEntry = { slug: string; qty: number };
const EMPTY_CART: CartEntry[] = [];
const EMPTY_LIST: string[] = [];

const cartStore = createPersistedStore<CartEntry[]>("sc-loja-cart", EMPTY_CART, (raw) =>
  Array.isArray(raw)
    ? raw
        .filter(
          (e): e is CartEntry =>
            typeof e?.slug === "string" && Boolean(getProduct(e.slug)) && Number.isFinite(e?.qty) && e.qty > 0,
        )
        .map((e) => ({ slug: e.slug, qty: clampQty(e.qty) }))
    : EMPTY_CART,
);

const favoritesStore = createPersistedStore<string[]>("sc-loja-favorites", EMPTY_LIST, slugList(50));
const viewedStore = createPersistedStore<string[]>("sc-loja-viewed", EMPTY_LIST, slugList(8));
const searchesStore = createPersistedStore<string[]>("sc-loja-searches", EMPTY_LIST, (raw) =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.length <= 60).slice(0, 5) : [],
);
const cepStore = createPersistedStore<string>("sc-loja-cep", "", (raw) =>
  typeof raw === "string" && /^\d{8}$/.test(raw) ? raw : "",
);

export type AddedNotice = { slug: string; qty: number; at: number } | null;
const addedStore = createMemoryStore<AddedNotice>(null);

/* ---------- cart ---------- */

export type CartLine = { product: Product; qty: number };

export function useCart() {
  const entries = cartStore.useValue();
  return useMemo(() => {
    const lines: CartLine[] = entries.flatMap((e) => {
      const product = getProduct(e.slug);
      return product ? [{ product, qty: e.qty }] : [];
    });
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.product.price, 0);
    const listTotal = lines.reduce((sum, l) => sum + l.qty * (l.product.oldPrice ?? l.product.price), 0);
    const freeShipping = lines.length > 0 && lines.every((l) => l.product.freeShipping);
    const hasColdChain = lines.some((l) => l.product.coldChain);
    return { lines, count, subtotal, listTotal, savings: listTotal - subtotal, freeShipping, hasColdChain };
  }, [entries]);
}

export function addToCart(slug: string, qty = 1, { notify = true } = {}) {
  cartStore.set((current) => {
    const existing = current.find((e) => e.slug === slug);
    if (existing) return current.map((e) => (e.slug === slug ? { ...e, qty: clampQty(e.qty + qty) } : e));
    return [...current, { slug, qty: clampQty(qty) }];
  });
  if (notify) addedStore.set({ slug, qty, at: Date.now() });
}

export function setCartQty(slug: string, qty: number) {
  cartStore.set((current) => current.map((e) => (e.slug === slug ? { ...e, qty: clampQty(qty) } : e)));
}

/** Removes a line and returns a function that puts it back (for "Desfazer"). */
export function removeFromCart(slug: string) {
  let removed: { entry: CartEntry; index: number } | null = null;
  cartStore.set((current) => {
    const index = current.findIndex((e) => e.slug === slug);
    if (index >= 0) removed = { entry: current[index], index };
    return current.filter((e) => e.slug !== slug);
  });
  return () => {
    if (!removed) return;
    const { entry, index } = removed;
    cartStore.set((current) => {
      if (current.some((e) => e.slug === entry.slug)) return current;
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, entry);
      return next;
    });
  };
}

export const useAddedNotice = addedStore.useValue;
export const dismissAddedNotice = () => addedStore.set(null);

/* ---------- favorites ---------- */

export const useFavorites = favoritesStore.useValue;

export function toggleFavorite(slug: string) {
  favoritesStore.set((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : [slug, ...current]));
}

/* ---------- recently viewed ---------- */

export const useRecentlyViewed = viewedStore.useValue;

export function markViewed(slug: string) {
  viewedStore.set((current) => [slug, ...current.filter((s) => s !== slug)].slice(0, 8));
}

/* ---------- recent searches ---------- */

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

/* ---------- CEP ---------- */

export const useCep = cepStore.useValue;
export const saveCep = (digits: string) => cepStore.set(digits);

export function formatCep(digits: string) {
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
