"use client";

import { useSyncExternalStore } from "react";
import type { Product } from "./catalog";

/*
 * Live availability from /api/loja/stock, fetched once per tab (and again
 * after an order attempt reports stock changes). Until it arrives, the
 * catalog's own availability is used; checkout re-validates stock
 * server-side regardless, so a stale view can never oversell.
 */

type PublicStock = Record<string, { available: boolean; low: boolean }>;

let stock: PublicStock = {};
let requested = false;
const listeners = new Set<() => void>();
const EMPTY: PublicStock = {};

export async function refreshStock() {
  try {
    const res = await fetch("/api/loja/stock", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = (await res.json()) as { stock?: PublicStock };
    stock = data.stock ?? {};
    listeners.forEach((l) => l());
  } catch {
    // keep catalog availability
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!requested) {
    requested = true;
    void refreshStock();
  }
  return () => listeners.delete(listener);
}

export function useStock() {
  return useSyncExternalStore(subscribe, () => stock, () => EMPTY);
}

export type Availability = {
  /** Can be added to the cart right now. */
  buyable: boolean;
  /** In stock (regardless of being sold online). */
  inStock: boolean;
  /** Controlled stock is really at ≤ 3 units. */
  low: boolean;
  /** Shown but not sold online (regulatory). */
  offline: boolean;
};

export function availabilityOf(product: Product, s: PublicStock): Availability {
  const entry = s[product.sku];
  const inStock = product.available && (entry ? entry.available : true);
  return { inStock, buyable: inStock && product.purchasable, low: Boolean(entry?.low), offline: !product.purchasable };
}

export function useAvailability(product: Product) {
  return availabilityOf(product, useStock());
}
