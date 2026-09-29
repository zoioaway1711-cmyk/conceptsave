import { env } from "cloudflare:workers";
import { z } from "zod";
import { CRYPTO_MIN_BRL } from "@/app/loja/_lib/checkout";

/*
 * Client for crypto-checkout (BRL → USDT on Tron/TRC20; the store's own
 * API — integration guide kept outside the repo). Server-only, like Pix:
 *
 *   CRYPTO_API_KEY         ck_live_…  Bearer token for /api/crypto/*
 *   CRYPTO_WEBHOOK_SECRET             HMAC key chosen at signup
 *   CRYPTO_API_BASE (optional)        override (https, or http://127.0.0.1
 *                                     for the provider's local Nile sandbox)
 *
 * Missing secrets → "crypto" simply isn't offered at checkout.
 *
 * Flow per charge: POST /quote (BRL → USDT at a locked price, ~10 min)
 * then POST /order (freezes it into an exact amount with a unique tag).
 * The customer must send EXACTLY `amount_usdt` to `pay_to_address`.
 * Production is mainnet only — real money.
 */

const DEFAULT_BASE = "https://crypto.sidebridgeswap.com";

/**
 * Lower bound we enforce before asking (guide §3.1: R$ 20,00 today). The
 * provider's own 422 amount_out_of_range stays the final word if it moves.
 */
export const CRYPTO_LIMITS = { minCents: CRYPTO_MIN_BRL * 100, maxCents: 5_000_000 } as const;

const REQUEST_TIMEOUT_MS = 15_000;

/** Provider order ids: `ord_` + hex today; same prefix as ours, but a separate namespace (provider column). */
export const CRYPTO_ORDER_ID = /^ord_[A-Za-z0-9_-]{8,64}$/;
/** Tron base58check address (T + 33 chars, no 0/O/I/l). */
export const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const TXID = /^[A-Za-z0-9-]{8,100}$/;

function runtime() {
  return env as unknown as { CRYPTO_API_KEY?: string; CRYPTO_WEBHOOK_SECRET?: string; CRYPTO_API_BASE?: string };
}

function baseUrl() {
  const override = runtime().CRYPTO_API_BASE?.trim();
  if (override) {
    try {
      const url = new URL(override);
      const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
      if ((url.protocol === "https:" || local) && !url.username && !url.password) return url.origin;
    } catch {
      // invalid override → default below
    }
    console.error("[loja] CRYPTO_API_BASE inválido — usando o endereço padrão");
  }
  return DEFAULT_BASE;
}

export function cryptoConfigured() {
  const { CRYPTO_API_KEY, CRYPTO_WEBHOOK_SECRET } = runtime();
  return Boolean(CRYPTO_API_KEY?.trim() && CRYPTO_WEBHOOK_SECRET?.trim());
}

export function cryptoWebhookSecret() {
  return runtime().CRYPTO_WEBHOOK_SECRET?.trim() || null;
}

/** Only real Tronscan transaction links are kept (shown to the customer and the admin). */
export function safeExplorerUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.hostname !== "tronscan.org" && url.hostname !== "nile.tronscan.org")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * USDT amount as the customer must type it: every decimal the API sent
 * (the unique tag lives there), no float noise, no trailing zeros.
 */
export function formatUsdt(amount: number) {
  return Number(amount.toFixed(6)).toString();
}

const quoteSchema = z.object({
  quote_id: z.string().min(4).max(80),
  amount_brl: z.number(),
  usdt_amount: z.number().positive(),
  price_brl: z.number().positive(),
  expires_at: z.number().int(),
});

const orderSchema = z.object({
  order_id: z.string().regex(CRYPTO_ORDER_ID),
  status: z.string().max(20),
  network: z.string().max(20).nullish(),
  token: z.string().max(20).nullish(),
  contract: z.string().regex(TRON_ADDRESS).nullish(),
  pay_to_address: z.string().regex(TRON_ADDRESS),
  amount_usdt: z.number().positive(),
  amount_brl: z.number().nullish(),
  price_brl: z.number().nullish(),
  expires_at: z.number().int(),
});
export type CryptoOrder = z.infer<typeof orderSchema>;

export const CRYPTO_STATUSES = ["pending", "confirmed", "paid_late", "underpaid", "expired", "mismatch"] as const;

const statusSchema = z.object({
  order_id: z.string().regex(CRYPTO_ORDER_ID),
  status: z.enum(CRYPTO_STATUSES),
  merchant_ref: z.string().max(100).nullish(),
  amount_usdt: z.number().nullish(),
  amount_brl: z.number().nullish(),
  txid: z.string().regex(TXID).nullish(),
  explorer_url: z.string().max(200).nullish(),
  paid_amount_usdt: z.number().nullish(),
  from_address: z.string().max(64).nullish(),
  confirmations: z.number().int().nullish(),
  confirmed_at: z.number().int().nullish(),
});
export type CryptoOrderStatus = z.infer<typeof statusSchema>;

export type CryptoCallError =
  | { kind: "not_configured" }
  /** 4xx refusal (amount_out_of_range, quote_expired…). Nothing to pay was created. */
  | { kind: "rejected"; code: string }
  /** 503 price_unavailable / provider down. */
  | { kind: "unavailable" }
  /** Timeout, network error, unexpected answer. */
  | { kind: "unknown" }
  | { kind: "not_found" };

type CallResult<T> = { ok: true; data: T } | { ok: false; error: CryptoCallError };

async function request(path: string, init: RequestInit = {}): Promise<{ ok: true; res: Response } | { ok: false; error: CryptoCallError }> {
  const key = runtime().CRYPTO_API_KEY?.trim();
  if (!key || !cryptoConfigured()) return { ok: false, error: { kind: "not_configured" } };
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
    return { ok: true, res };
  } catch (error) {
    console.error("[loja] crypto-checkout inacessível", (error as Error)?.name ?? "error");
    return { ok: false, error: { kind: "unknown" } };
  }
}

async function callJson<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<CallResult<T>> {
  const r = await request(path, init);
  if (!r.ok) return r;
  const { res } = r;
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const code = typeof body?.error === "string" ? body.error.slice(0, 60) : "";
  if (res.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return { ok: true, data: parsed.data };
    console.error("[loja] crypto-checkout: resposta fora do formato esperado", parsed.error.issues.slice(0, 3));
    return { ok: false, error: { kind: "unknown" } };
  }
  if (res.status === 401) {
    console.error("[loja] crypto-checkout recusou a CRYPTO_API_KEY (401)");
    return { ok: false, error: { kind: "not_configured" } };
  }
  if (res.status === 404) return { ok: false, error: { kind: "not_found" } };
  if (res.status === 503) return { ok: false, error: { kind: "unavailable" } };
  if (res.status >= 400 && res.status < 500) return { ok: false, error: { kind: "rejected", code: code || "invalid_request" } };
  console.error(`[loja] crypto-checkout respondeu ${res.status} ${code}`);
  return { ok: false, error: { kind: res.status === 500 && code === "dest_not_configured" ? "unavailable" : "unknown" } };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /quote. Asking for a quote creates nothing payable, so a 503
 * price_unavailable is retried a couple of times with a short backoff
 * (guide checklist) before giving up.
 */
export async function createCryptoQuote(amountCents: number) {
  let result: CallResult<z.infer<typeof quoteSchema>> = { ok: false, error: { kind: "unavailable" } };
  for (const wait of [0, 1000, 2500]) {
    if (wait) await sleep(wait);
    result = await callJson("/api/crypto/quote", quoteSchema, { method: "POST", body: JSON.stringify({ amount_brl: amountCents / 100 }) });
    if (result.ok || result.error.kind !== "unavailable") return result;
  }
  return result;
}

/** POST /order — freezes a quote (single use) into the exact amount to pay. Never retried. */
export function createCryptoOrder(quoteId: string, merchantRef: string) {
  return callJson("/api/crypto/order", orderSchema, { method: "POST", body: JSON.stringify({ quote_id: quoteId, merchant_ref: merchantRef.slice(0, 100) }) });
}

export function getCryptoOrder(orderId: string): Promise<CallResult<CryptoOrderStatus>> {
  if (!CRYPTO_ORDER_ID.test(orderId)) return Promise.resolve({ ok: false, error: { kind: "not_found" } });
  return callJson(`/api/crypto/order/${encodeURIComponent(orderId)}`, statusSchema);
}

/** The receipt PDF (needs the API key, so the store serves it to the customer). */
export async function fetchCryptoReceipt(orderId: string): Promise<Response | null> {
  if (!CRYPTO_ORDER_ID.test(orderId)) return null;
  const r = await request(`/api/crypto/order/${encodeURIComponent(orderId)}/receipt`);
  if (!r.ok || !r.res.ok) return null;
  if (!(r.res.headers.get("content-type") ?? "").toLowerCase().includes("application/pdf")) return null;
  return r.res;
}

/** Signed webhook body (guide §4 / openapi WebhookPayload). */
export const cryptoWebhookSchema = z.object({
  event: z.string().max(40),
  order_id: z.string().regex(CRYPTO_ORDER_ID),
  merchant_ref: z.string().max(100).nullish(),
  status: z.enum(CRYPTO_STATUSES),
  amount_brl: z.number().nullish(),
  amount_usdt_expected: z.number().nullish(),
  amount_usdt_paid: z.number().nullish(),
  price_brl: z.number().nullish(),
  txid: z.string().regex(TXID).nullish(),
  explorer_url: z.string().max(200).nullish(),
  from_address: z.string().max(64).nullish(),
  confirmations: z.number().int().nullish(),
  confirmed_at: z.number().int().nullish(),
});
export type CryptoWebhook = z.infer<typeof cryptoWebhookSchema>;
