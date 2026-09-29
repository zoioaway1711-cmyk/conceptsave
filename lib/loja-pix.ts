import { env } from "cloudflare:workers";
import { z } from "zod";

/*
 * Client for pix-checkout (the store's own Pix charging API — integration
 * guide kept outside the repo). Server-only: the API has no CORS and the
 * key can create charges in the store's name, so it lives exclusively in
 * Worker secrets:
 *
 *   PIX_API_KEY               pk_…     Bearer token for /api/pix/*
 *   PIX_STORE_WEBHOOK_SECRET  whsec_…  HMAC key of the signed webhooks
 *   PIX_API_BASE (optional)            override of the base URL (https, or
 *                                      http://127.0.0.1 for a local mock)
 *
 * With either secret missing the gateway is simply "off": Pix orders fall
 * back to the manual flow (team contacts the customer), exactly as before.
 *
 * Production only — there is no sandbox. Every charge is real money
 * (minimum R$ 5,00; provider fee R$ 1,00 + 5%).
 */

const DEFAULT_BASE = "https://pix.sidebridgeswap.com";

/** Provider limits per charge, in cents (guide §1). */
export const PIX_LIMITS = { minCents: 500, maxCents: 500_000 } as const;

/** Name the payer's bank app shows as the receiver (guide §3.2) — told to the customer up front. */
export const PIX_RECEIVER_NAME = "LUMINA UP COMERCIAL LTDA";

const REQUEST_TIMEOUT_MS = 15_000;

/** `pix_` + the provider's id (24 chars today; a little slack, same charset). */
export const PIX_ORDER_ID = /^pix_[A-Za-z0-9_-]{8,64}$/;

/** EMV "copia e cola": starts with the payload format indicator, printable ASCII only. */
const PIX_COPY_PASTE = /^000201[\x20-\x7e]{20,700}$/;

function runtime() {
  return env as unknown as { PIX_API_KEY?: string; PIX_STORE_WEBHOOK_SECRET?: string; PIX_API_BASE?: string };
}

function baseUrl() {
  const override = runtime().PIX_API_BASE?.trim();
  if (override) {
    try {
      const url = new URL(override);
      // http only for a mock/sandbox on this machine (local development).
      const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
      if ((url.protocol === "https:" || local) && !url.username && !url.password) return url.origin;
    } catch {
      // invalid override → default below
    }
    console.error("[loja] PIX_API_BASE inválido — usando o endereço padrão");
  }
  return DEFAULT_BASE;
}

/** Both secrets present → automatic Pix is on. */
export function pixConfigured() {
  const { PIX_API_KEY, PIX_STORE_WEBHOOK_SECRET } = runtime();
  return Boolean(PIX_API_KEY?.trim() && PIX_STORE_WEBHOOK_SECRET?.trim());
}

export function pixWebhookSecret() {
  return runtime().PIX_STORE_WEBHOOK_SECRET?.trim() || null;
}

/*
 * Public URLs are rebuilt from the charge id instead of trusting the
 * `pay_url` / `receipt_url` strings in the response: whatever the API (or
 * something between us and it) returns, the customer is only ever sent to
 * the provider's own origin.
 */
export function pixPayUrl(chargeId: string) {
  return `${baseUrl()}/pay/${encodeURIComponent(chargeId)}`;
}

export function pixReceiptUrl(chargeId: string) {
  return `${baseUrl()}/pay/${encodeURIComponent(chargeId)}/receipt`;
}

const nullableString = (max: number) => z.string().max(max).nullish();

/** GET/POST /api/pix/order response (guide §3.1). Unknown extra fields are ignored. */
const pixChargeSchema = z.object({
  order_id: z.string().regex(PIX_ORDER_ID),
  status: z.enum(["pending", "paid", "expired", "held", "error"]),
  amount_cents: z.number().int(),
  merchant_ref: nullableString(100),
  pix_copy_paste: nullableString(1000),
  expires_at: z.number().int().nullish(),
  end_to_end_id: nullableString(100),
  fee_cents: z.number().int().nullish(),
  net_cents: z.number().int().nullish(),
  paid_at: nullableString(40),
  confirmed_at: z.number().int().nullish(),
});
export type PixCharge = z.infer<typeof pixChargeSchema>;

export type PixCallError =
  /** Secrets missing, or the key was refused (401). */
  | { kind: "not_configured" }
  /** 400 — the request itself was refused (e.g. amount_out_of_range). Nothing was created. */
  | { kind: "rejected"; code: string }
  /** 503 — provider down or rate-limited. Nothing was created. */
  | { kind: "unavailable" }
  /**
   * 502 provider_error, timeout, network error or unreadable answer: the
   * charge MAY exist. Never retried automatically (guide §3.1) — the
   * customer asks for a new code explicitly.
   */
  | { kind: "unknown" }
  | { kind: "not_found" };

export type PixCallResult = { ok: true; charge: PixCharge } | { ok: false; error: PixCallError };

async function call(path: string, init: RequestInit = {}): Promise<PixCallResult> {
  const key = runtime().PIX_API_KEY?.trim();
  if (!key || !pixConfigured()) return { ok: false, error: { kind: "not_configured" } };
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // A redirect is never part of this API: don't follow it (and don't
      // send the Bearer key onward). 3xx then lands in "unknown" below.
      redirect: "manual",
    });
  } catch (error) {
    console.error("[loja] pix-checkout inacessível", (error as Error)?.name ?? "error");
    return { ok: false, error: { kind: "unknown" } };
  }
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const code = typeof body?.error === "string" ? body.error.slice(0, 60) : "";
  if (res.ok) {
    const parsed = pixChargeSchema.safeParse(body);
    if (parsed.success) return { ok: true, charge: parsed.data };
    console.error("[loja] pix-checkout: resposta fora do formato esperado", parsed.error.issues.slice(0, 3));
    return { ok: false, error: { kind: "unknown" } };
  }
  if (res.status === 401) {
    console.error("[loja] pix-checkout recusou a PIX_API_KEY (401)");
    return { ok: false, error: { kind: "not_configured" } };
  }
  if (res.status === 404) return { ok: false, error: { kind: "not_found" } };
  if (res.status === 400) return { ok: false, error: { kind: "rejected", code: code || "invalid_request" } };
  if (res.status === 503) return { ok: false, error: { kind: "unavailable" } };
  console.error(`[loja] pix-checkout respondeu ${res.status} ${code}`);
  return { ok: false, error: { kind: "unknown" } };
}

/** POST /api/pix/order — creates a NEW charge on every call. */
export function createPixCharge(input: { amountCents: number; merchantRef: string; description: string; payerName: string; payerEmail: string }) {
  return call("/api/pix/order", {
    method: "POST",
    body: JSON.stringify({
      amount_cents: input.amountCents,
      merchant_ref: input.merchantRef.slice(0, 100),
      description: input.description.slice(0, 140),
      payer_name: input.payerName.slice(0, 200),
      payer_email: input.payerEmail.slice(0, 320),
    }),
  });
}

/** GET /api/pix/order/:id — fallback when a webhook is late or lost. */
export function getPixCharge(chargeId: string) {
  if (!PIX_ORDER_ID.test(chargeId)) return Promise.resolve<PixCallResult>({ ok: false, error: { kind: "not_found" } });
  return call(`/api/pix/order/${encodeURIComponent(chargeId)}`);
}

export function validCopyPaste(value: string | null | undefined): string | null {
  return value && PIX_COPY_PASTE.test(value) ? value : null;
}

/** Signed webhook body (guide §4). */
export const pixWebhookSchema = z.object({
  event: z.string().max(40),
  order_id: z.string().regex(PIX_ORDER_ID),
  merchant_ref: nullableString(100),
  status: z.string().max(20),
  amount_cents: z.number().int(),
  paid_at: nullableString(40),
  confirmed_at: z.number().int().nullish(),
  end_to_end_id: nullableString(100),
  fee_cents: z.number().int().nullish(),
  net_cents: z.number().int().nullish(),
});
export type PixWebhook = z.infer<typeof pixWebhookSchema>;
