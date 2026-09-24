"use client";

import { useCallback, useState } from "react";
import { track } from "./analytics";
import { saveDeliveryLocation, type DeliveryLocation } from "./store";

/*
 * Shared CEP lookup used by the header, PDP, cart and checkout. Results
 * are cached per tab, so the same CEP is never looked up twice in a
 * session, and a confirmed lookup is saved as the shopper's delivery
 * location so no other screen asks for it again.
 */

export type CepStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "valid"; location: DeliveryLocation }
  | { state: "invalid" } // not 8 digits
  | { state: "not_found" } // well-formed but doesn't exist
  | { state: "error" }; // lookup service unavailable

const cache = new Map<string, DeliveryLocation | "not_found">();

export async function lookupCep(digits: string): Promise<Exclude<CepStatus, { state: "idle" | "loading" }>> {
  if (!/^\d{8}$/.test(digits)) return { state: "invalid" };
  const hit = cache.get(digits);
  if (hit === "not_found") return { state: "not_found" };
  if (hit) return { state: "valid", location: hit };
  try {
    const res = await fetch(`/api/loja/cep/${digits}`, { headers: { accept: "application/json" } });
    if (res.status === 404) {
      cache.set(digits, "not_found");
      track({ name: "delivery_lookup", params: { result: "not_found" } });
      return { state: "not_found" };
    }
    if (res.status === 400) return { state: "invalid" };
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Required<DeliveryLocation>;
    const location: DeliveryLocation = {
      cep: digits,
      city: data.city || undefined,
      uf: data.uf || undefined,
      street: data.street || undefined,
      district: data.district || undefined,
    };
    cache.set(digits, location);
    track({ name: "delivery_lookup", params: { result: "valid" } });
    return { state: "valid", location };
  } catch {
    track({ name: "delivery_lookup", params: { result: "error" } });
    return { state: "error" };
  }
}

export function maskCep(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function useCepLookup({ persist = true }: { persist?: boolean } = {}) {
  const [status, setStatus] = useState<CepStatus>({ state: "idle" });
  const run = useCallback(
    async (raw: string) => {
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 8) {
        setStatus({ state: "invalid" });
        return { state: "invalid" } as const;
      }
      setStatus({ state: "loading" });
      const result = await lookupCep(digits);
      setStatus(result);
      // A service outage still keeps the CEP (the shopper typed a
      // well-formed one) — only a confirmed "doesn't exist" is rejected.
      if (persist && result.state === "valid") saveDeliveryLocation(result.location);
      if (persist && result.state === "error") saveDeliveryLocation({ cep: digits });
      return result;
    },
    [persist],
  );
  const reset = useCallback(() => setStatus({ state: "idle" }), []);
  return { status, run, reset };
}
