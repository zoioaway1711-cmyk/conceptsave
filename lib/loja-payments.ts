import { env } from "cloudflare:workers";
import { formatBRL } from "@/app/loja/_lib/catalog";
import { getOrder, transitionOrder, type StoredOrder } from "./loja-orders";
import {
  PIX_LIMITS,
  PIX_RECEIVER_NAME,
  createPixCharge,
  getPixCharge,
  pixConfigured,
  pixPayUrl,
  pixReceiptUrl,
  validCopyPaste,
  type PixCharge,
  type PixWebhook,
} from "./loja-pix";
import {
  CRYPTO_LIMITS,
  TRON_ADDRESS,
  createCryptoOrder,
  createCryptoQuote,
  cryptoConfigured,
  formatUsdt,
  getCryptoOrder,
  safeExplorerUrl,
  type CryptoOrderStatus,
  type CryptoWebhook,
} from "./loja-crypto";
import { constantTimeEqual } from "./proxy-trust";
import { sanitizeAlertText, sendTelegramAlert } from "./telegram";

/*
 * Online payments for storefront orders (loja_payments).
 *
 * Flow: the order page asks for a charge (startPayment) → the provider
 * returns a Pix code → the customer pays in their bank app → the provider
 * sends a SIGNED webhook (applyProviderUpdate) → the order moves to
 * `payment_approved` through the same transitionOrder the admin uses, so
 * stock reservation, history and every other rule stay in one place.
 *
 * Safety rules (from the provider's guide, all enforced here):
 * - Only `paid` releases an order, and only when the paid amount equals
 *   the order total and the merchant_ref is this order. Anything else
 *   (held, wrong amount, paid on a cancelled order, paid twice) goes to a
 *   human: Telegram alert + `review`, never an automatic release.
 * - A charge is never re-created automatically after an error or timeout
 *   (each call is a new real charge); the customer asks for a new code.
 * - Webhooks are idempotent: the same event twice is a no-op, and a late
 *   `paid` after `expired` still settles the order.
 * - The webhook is the primary signal; while the customer watches the
 *   order page, a throttled GET to the provider is the fallback.
 *
 * Two providers share this machinery (`provider` column): pix-checkout
 * (Pix) and crypto-checkout (USDT on Tron/TRC20). Only the "create a
 * charge" call and the status vocabulary differ — see the mapping sections.
 */

export type PaymentProvider = "pix" | "crypto";
export type PaymentStatus = "creating" | "pending" | "paid" | "expired" | "review" | "failed";

type PaymentRow = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerRef: string | null;
  status: PaymentStatus;
  providerStatus: string | null;
  amountCents: number;
  detailsJson: string;
  providerDataJson: string;
  receiptUrl: string | null;
  paidAt: string | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT_PAYMENT =
  "SELECT id, order_id AS orderId, provider, provider_ref AS providerRef, status, provider_status AS providerStatus, amount_cents AS amountCents, details_json AS detailsJson, provider_data_json AS providerDataJson, receipt_url AS receiptUrl, paid_at AS paidAt, checked_at AS checkedAt, created_at AS createdAt, updated_at AS updatedAt FROM loja_payments";

/** A `creating` row older than this was abandoned mid-call (the provider call itself times out after 15 s). */
const CREATING_STALE_MS = 2 * 60 * 1000;
/** Minimum spacing between two provider polls of the same charge. */
const SYNC_INTERVAL_MS = 15 * 1000;
/**
 * How long an expired charge is still polled for a late payment: Pix keeps
 * watching for 24 h (Pix guide §1); crypto accepts `paid_late` within a
 * 30-min grace after the quote expires (crypto guide §1) — 1 h of margin.
 */
const LATE_PAYMENT_WINDOW_MS: Record<PaymentProvider, number> = { pix: 24 * 3600 * 1000, crypto: 3600 * 1000 };

const PROVIDER_LABEL: Record<PaymentProvider, string> = { pix: "Pix", crypto: "Cripto (USDT)" };

/* ---------- helpers ---------- */

export function orderAmountCents(order: Pick<StoredOrder, "total">) {
  return Math.round(order.total * 100);
}

/*
 * TEST MODE — lets the owner run the real end-to-end test (real money, real
 * webhooks) at a low price. Orders whose e-mail equals the
 * LOJA_TEST_BUYER_EMAIL secret are charged TEST_CHARGE_CENTS (R$ 20,00: the
 * crypto minimum, above the Pix one) whatever the cart costs; nobody else
 * is affected. Each such charge records `test: true`, so it still settles
 * correctly after the secret is removed — which should happen as soon as
 * the test is over (anyone ordering with that e-mail pays R$ 20,00).
 */
export const TEST_CHARGE_CENTS = 2000;

export function isTestBuyerEmail(email: string) {
  const configured = (env as unknown as { LOJA_TEST_BUYER_EMAIL?: string }).LOJA_TEST_BUYER_EMAIL?.trim().toLowerCase();
  return Boolean(configured && configured.includes("@") && email.trim().toLowerCase() === configured);
}

/** What the provider is asked to charge for this order. */
export function chargeAmountCents(order: Pick<StoredOrder, "total" | "customer">) {
  return isTestBuyerEmail(order.customer.email) ? TEST_CHARGE_CENTS : orderAmountCents(order);
}

/** Which provider collects this order automatically, if any. */
export function providerForOrder(order: Pick<StoredOrder, "payment">): PaymentProvider | null {
  if (order.payment.method === "pix") return "pix";
  if (order.payment.method === "crypto") return "crypto";
  return null;
}

export function gatewayEnabled(provider: PaymentProvider) {
  return provider === "pix" ? pixConfigured() : cryptoConfigured();
}

export function amountInRange(provider: PaymentProvider, cents: number) {
  const limits = provider === "pix" ? PIX_LIMITS : CRYPTO_LIMITS;
  return cents >= limits.minCents && cents <= limits.maxCents;
}

function parseJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Later updates add to what's known; a null never erases an earlier value (e.g. the end-to-end id). */
function mergeData(current: string, extra: Record<string, unknown>) {
  const merged = parseJson(current);
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined) merged[k] = v;
  return JSON.stringify(merged);
}

async function listPayments(db: D1Database, orderId: string) {
  const { results } = await db.prepare(`${SELECT_PAYMENT} WHERE order_id = ? ORDER BY created_at DESC`).bind(orderId).all<PaymentRow>();
  return results;
}

async function getPaymentByRef(db: D1Database, provider: PaymentProvider, providerRef: string) {
  return db.prepare(`${SELECT_PAYMENT} WHERE provider = ? AND provider_ref = ?`).bind(provider, providerRef).first<PaymentRow>();
}

/** The charge that describes the order's payment right now: paid > review > live > most recent. */
function pickCurrent(payments: PaymentRow[]) {
  return (
    payments.find((p) => p.status === "paid") ??
    payments.find((p) => p.status === "review") ??
    payments.find((p) => p.status === "pending" || p.status === "creating") ??
    payments[0] ??
    null
  );
}

async function alert(message: string) {
  try {
    await sendTelegramAlert(message);
  } catch {
    // best effort — never fails the webhook
  }
}

/* ---------- customer view ---------- */

export type PublicPayment = {
  provider: PaymentProvider;
  status: PaymentStatus;
  amountCents: number;
  /** Unix seconds; only while pending. */
  expiresAt: number | null;
  pix: { copyPaste: string; payUrl: string; receiver: string } | null;
  /** What to send, where, on which network — only while pending. */
  crypto: { address: string; amountUsdt: string; token: "USDT"; network: "Tron (TRC20)"; contract: string | null; priceBrl: number | null } | null;
  /** Public receipt link (Pix). */
  receiptUrl: string | null;
  /** Receipt served by the store (crypto: the provider's PDF needs the API key). */
  receiptDownload: boolean;
  /** On-chain transaction (crypto), once paid. */
  explorerUrl: string | null;
  paidAt: string | null;
  /** Test charge (TEST MODE): the amount is the fixed test value, not the order total. */
  test: boolean;
};

export function publicPaymentView(row: PaymentRow, now = Date.now()): PublicPayment {
  const details = parseJson(row.detailsJson) as {
    copyPaste?: unknown;
    expiresAt?: unknown;
    address?: unknown;
    amountUsdt?: unknown;
    contract?: unknown;
    priceBrl?: unknown;
    test?: unknown;
  };
  const expiresAt = typeof details.expiresAt === "number" ? details.expiresAt : null;
  // A pending code past its expiry can't be paid any more: say so without
  // waiting for the provider's `expired` event.
  const status: PaymentStatus = row.status === "pending" && expiresAt !== null && expiresAt * 1000 <= now ? "expired" : row.status;
  const copyPaste = typeof details.copyPaste === "string" ? validCopyPaste(details.copyPaste) : null;
  const address = typeof details.address === "string" && TRON_ADDRESS.test(details.address) ? details.address : null;
  const amountUsdt = typeof details.amountUsdt === "string" && /^\d{1,9}(\.\d{1,6})?$/.test(details.amountUsdt) ? details.amountUsdt : null;
  const paid = status === "paid";
  const data = paid && row.provider === "crypto" ? parseJson(row.providerDataJson) : {};
  return {
    provider: row.provider,
    status,
    amountCents: row.amountCents,
    expiresAt: status === "pending" ? expiresAt : null,
    pix:
      row.provider === "pix" && status === "pending" && copyPaste && row.providerRef
        ? { copyPaste, payUrl: pixPayUrl(row.providerRef), receiver: PIX_RECEIVER_NAME }
        : null,
    crypto:
      row.provider === "crypto" && status === "pending" && address && amountUsdt
        ? {
            address,
            amountUsdt,
            token: "USDT",
            network: "Tron (TRC20)",
            contract: typeof details.contract === "string" && TRON_ADDRESS.test(details.contract) ? details.contract : null,
            priceBrl: typeof details.priceBrl === "number" ? details.priceBrl : null,
          }
        : null,
    receiptUrl: paid && row.provider === "pix" ? row.receiptUrl : null,
    receiptDownload: paid && row.provider === "crypto" && Boolean(row.providerRef),
    explorerUrl: paid ? safeExplorerUrl(data.explorerUrl) : null,
    paidAt: paid ? row.paidAt : null,
    test: details.test === true,
  };
}

/**
 * - `manual`: no automatic payment for this order (card, boleto, gateway
 *   off, or an amount outside the provider's limits) — the team contacts
 *   the customer, as before.
 * - `auto`: the order page shows the charge and, when `canCreate`, can
 *   ask for a (new) code.
 */
export type OrderPaymentState =
  | { mode: "manual"; reason?: "amount_out_of_range" }
  | { mode: "auto"; provider: PaymentProvider; current: PublicPayment | null; canCreate: boolean };

export async function orderPaymentState(db: D1Database, order: StoredOrder, { sync = false } = {}): Promise<OrderPaymentState> {
  let payments = await listPayments(db, order.id);
  const provider = providerForOrder(order) ?? payments[0]?.provider ?? null;
  if (!provider) return { mode: "manual" };
  if (sync) {
    const target = pickCurrent(payments);
    if (target && (await syncPayment(db, target))) payments = await listPayments(db, order.id);
  }
  const current = pickCurrent(payments);
  const enabled = gatewayEnabled(provider) && providerForOrder(order) === provider;
  const inRange = amountInRange(provider, chargeAmountCents(order));
  if (!current && !enabled) return { mode: "manual" };
  if (!current && !inRange) return { mode: "manual", reason: "amount_out_of_range" };
  const view = current ? publicPaymentView(current) : null;
  const canCreate = enabled && inRange && order.status === "received" && (!view || view.status === "expired" || view.status === "failed");
  return { mode: "auto", provider, current: view, canCreate };
}

/* ---------- create a charge ---------- */

export type StartPaymentError =
  | "not_supported"
  | "not_configured"
  | "order_not_payable"
  | "amount_out_of_range"
  | "in_progress"
  | "provider_unavailable"
  | "provider_error";

/**
 * Returns the order's live charge, or creates one. Never creates a second
 * live charge (partial unique index), never replaces a paid or in-review
 * one, and never retries a failed provider call on its own.
 */
export async function startPayment(
  db: D1Database,
  order: StoredOrder,
): Promise<{ ok: true; state: OrderPaymentState } | { ok: false; error: StartPaymentError }> {
  const provider = providerForOrder(order);
  if (!provider) return { ok: false, error: "not_supported" };
  if (!gatewayEnabled(provider)) return { ok: false, error: "not_configured" };
  const cents = chargeAmountCents(order);
  const test = cents === TEST_CHARGE_CENTS && isTestBuyerEmail(order.customer.email);
  if (!amountInRange(provider, cents)) return { ok: false, error: "amount_out_of_range" };

  const now = Date.now();
  const at = new Date(now).toISOString();
  const payments = await listPayments(db, order.id);
  const settled = payments.find((p) => p.status === "paid" || p.status === "review");
  if (settled) return { ok: true, state: await orderPaymentState(db, order) };
  if (order.status !== "received") return { ok: false, error: "order_not_payable" };

  const live = payments.find((p) => p.status === "pending" || p.status === "creating");
  if (live) {
    if (live.status === "pending" && publicPaymentView(live, now).status === "pending") return { ok: true, state: await orderPaymentState(db, order) };
    if (live.status === "creating" && now - Date.parse(live.createdAt) < CREATING_STALE_MS) return { ok: false, error: "in_progress" };
    // Lapsed: retire it. A late payment on it still arrives by provider_ref.
    await db
      .prepare("UPDATE loja_payments SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
      .bind(live.status === "pending" ? "expired" : "failed", at, live.id, live.status)
      .run();
  }

  const id = `pay_${crypto.randomUUID()}`;
  try {
    await db
      .prepare("INSERT INTO loja_payments (id, order_id, provider, provider_ref, status, amount_cents, created_at, updated_at) VALUES (?, ?, ?, NULL, 'creating', ?, ?, ?)")
      .bind(id, order.id, provider, cents, at, at)
      .run();
  } catch (error) {
    // Another request opened a charge a moment ago (double click, two tabs).
    if (/UNIQUE constraint failed/i.test(String((error as Error)?.message ?? error))) return { ok: false, error: "in_progress" };
    throw error;
  }

  const created = provider === "pix" ? await createPixForOrder(order, cents) : await createCryptoForOrder(order, cents);
  if (!created.ok) {
    await db
      .prepare("UPDATE loja_payments SET status = 'failed', provider_status = ?, updated_at = ? WHERE id = ? AND status = 'creating'")
      .bind(created.providerStatus.slice(0, 30), new Date().toISOString(), id)
      .run();
    return { ok: false, error: created.error };
  }

  try {
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE loja_payments SET provider_ref = ?, status = ?, provider_status = ?, details_json = ?, updated_at = ?, checked_at = ? WHERE id = ? AND status = 'creating'",
      )
      .bind(
        created.providerRef,
        created.status,
        created.providerStatus.slice(0, 30),
        JSON.stringify({ ...created.details, ...(test ? { test: true } : {}) }),
        updatedAt,
        updatedAt,
        id,
      )
      .run();
  } catch (error) {
    // A webhook for this very charge got here first and recorded it; fine.
    if (!/UNIQUE constraint failed/i.test(String((error as Error)?.message ?? error))) throw error;
  }
  return { ok: true, state: await orderPaymentState(db, order) };
}

type CreatedCharge =
  | { ok: true; providerRef: string; status: Exclude<PaymentStatus, "creating">; providerStatus: string; details: Record<string, unknown> }
  | { ok: false; providerStatus: string; error: StartPaymentError };

function mapCallError(e: { kind: string; code?: string }): CreatedCharge {
  if (e.kind === "not_configured") return { ok: false, providerStatus: "not_configured", error: "not_configured" };
  if (e.kind === "rejected") return { ok: false, providerStatus: e.code ?? "rejected", error: e.code === "amount_out_of_range" ? "amount_out_of_range" : "provider_error" };
  if (e.kind === "unavailable") return { ok: false, providerStatus: "unavailable", error: "provider_unavailable" };
  return { ok: false, providerStatus: "unknown", error: "provider_error" };
}

async function createPixForOrder(order: StoredOrder, cents: number): Promise<CreatedCharge> {
  const result = await createPixCharge({
    amountCents: cents,
    merchantRef: order.id,
    description: `${isTestBuyerEmail(order.customer.email) ? "TESTE · " : ""}Pedido ${order.number} · Save Concept`,
    payerName: order.customer.name,
    payerEmail: order.customer.email,
  });
  if (!result.ok) return mapCallError(result.error);
  const charge = result.charge;
  // The provider must have created exactly what we asked for, for this order.
  if (charge.amount_cents !== cents || (charge.merchant_ref && charge.merchant_ref !== order.id)) {
    console.error("[loja] pix-checkout devolveu uma cobrança diferente da pedida", { asked: cents, got: charge.amount_cents });
    await alert(`⚠️ Pix: a cobrança criada para o pedido ${order.number} veio com valor/referência diferente do pedido. Ela NÃO foi mostrada ao cliente. Confira o pix-checkout (${charge.order_id}).`);
    return { ok: false, providerStatus: "mismatch", error: "provider_error" };
  }
  const copyPaste = validCopyPaste(charge.pix_copy_paste);
  const status = mapPixStatus(charge.status);
  if (status === "pending" && !copyPaste) return { ok: false, providerStatus: "no_code", error: "provider_error" };
  return { ok: true, providerRef: charge.order_id, status, providerStatus: charge.status, details: { copyPaste, expiresAt: charge.expires_at ?? null } };
}

async function createCryptoForOrder(order: StoredOrder, cents: number): Promise<CreatedCharge> {
  const quote = await createCryptoQuote(cents);
  if (!quote.ok) return mapCallError(quote.error);
  if (Math.round(quote.data.amount_brl * 100) !== cents) {
    console.error("[loja] crypto-checkout cotou um valor diferente do pedido", { asked: cents, got: quote.data.amount_brl });
    return { ok: false, providerStatus: "mismatch", error: "provider_error" };
  }
  const result = await createCryptoOrder(quote.data.quote_id, order.id);
  if (!result.ok) return mapCallError(result.error);
  const o = result.data;
  if (o.amount_brl != null && Math.round(o.amount_brl * 100) !== cents) {
    await alert(`⚠️ Cripto: o pedido criado para ${order.number} veio com valor diferente do pedido. Ele NÃO foi mostrado ao cliente. Confira o crypto-checkout (${o.order_id}).`);
    return { ok: false, providerStatus: "mismatch", error: "provider_error" };
  }
  if (o.network && o.network.toLowerCase() !== "tron") return { ok: false, providerStatus: "bad_network", error: "provider_error" };
  return {
    ok: true,
    providerRef: o.order_id,
    status: "pending",
    providerStatus: o.status,
    details: {
      address: o.pay_to_address,
      amountUsdt: formatUsdt(o.amount_usdt),
      contract: o.contract ?? null,
      priceBrl: o.price_brl ?? quote.data.price_brl,
      expiresAt: o.expires_at,
    },
  };
}

/* ---------- provider updates (webhook + polling) ---------- */

export type ProviderUpdate = {
  provider: PaymentProvider;
  providerRef: string;
  merchantRef: string | null;
  status: Exclude<PaymentStatus, "creating">;
  providerStatus: string;
  /** BRL cents the provider says this charge is for. */
  amountCents: number | null;
  receiptUrl: string | null;
  paidAt: string | null;
  data: Record<string, unknown>;
};

/** `paid` is terminal; everything else only moves forward. */
function nextStatus(from: PaymentStatus, to: ProviderUpdate["status"]): PaymentStatus {
  if (from === "paid" || from === to) return from;
  if (to === "paid" || to === "review") return to;
  if (to === "expired" || to === "failed") return from === "pending" || from === "creating" ? to : from;
  if (to === "pending") return from === "creating" ? "pending" : from;
  return from;
}

const ORDER_ID = /^ord_[0-9a-f-]{36}$/;

/**
 * The charge row for an update, or null when it can't belong to one of
 * our orders. A charge we never recorded (the create call timed out on our
 * side but the provider did create it) is adopted through merchant_ref —
 * but only when money moved: a stray `expired` isn't worth a row.
 */
async function resolvePayment(db: D1Database, u: ProviderUpdate) {
  const existing = await getPaymentByRef(db, u.provider, u.providerRef);
  if (existing) return existing;
  if (u.status !== "paid" && u.status !== "review") return null;
  if (!u.merchantRef || !ORDER_ID.test(u.merchantRef)) return null;
  const order = await getOrder(db, u.merchantRef);
  if (!order) return null;
  const at = new Date().toISOString();
  // Our own call may still be in flight for this very charge: claim its row.
  const claimed = await db
    .prepare("UPDATE loja_payments SET provider_ref = ?, updated_at = ? WHERE id = (SELECT id FROM loja_payments WHERE order_id = ? AND provider = ? AND status = 'creating' AND provider_ref IS NULL LIMIT 1)")
    .bind(u.providerRef, at, order.id, u.provider)
    .run();
  if (!claimed.meta.changes) {
    await db
      .prepare("INSERT OR IGNORE INTO loja_payments (id, order_id, provider, provider_ref, status, amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, 'expired', ?, ?, ?)")
      .bind(`pay_${crypto.randomUUID()}`, order.id, u.provider, u.providerRef, u.amountCents && u.amountCents > 0 ? u.amountCents : chargeAmountCents(order), at, at)
      .run();
  }
  return getPaymentByRef(db, u.provider, u.providerRef);
}

export type ApplyResult = "updated" | "unchanged" | "ignored";

export async function applyProviderUpdate(db: D1Database, u: ProviderUpdate): Promise<ApplyResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await resolvePayment(db, u);
    if (!row) {
      if (u.status === "paid" || u.status === "review") {
        await alert(
          `⚠️ ${PROVIDER_LABEL[u.provider]}: pagamento recebido (${u.providerRef}) sem pedido correspondente na loja. Referência: ${sanitizeAlertText(u.merchantRef ?? "—", 60)}. Confira manualmente.`,
        );
      }
      return "ignored";
    }
    if (u.merchantRef && u.merchantRef !== row.orderId) {
      await alert(`⚠️ ${PROVIDER_LABEL[u.provider]}: evento da cobrança ${u.providerRef} aponta para outro pedido. Nada foi liberado — confira manualmente.`);
      return "ignored";
    }

    let next = nextStatus(row.status, u.status);
    let reviewReason: string | null = null;
    if (next === "paid" && row.status !== "paid" && u.amountCents !== null && u.amountCents !== row.amountCents) {
      next = "review";
      reviewReason = `valor pago ${formatBRL(u.amountCents / 100)} ≠ cobrado ${formatBRL(row.amountCents / 100)}`;
    }
    const at = new Date().toISOString();
    const paidAt = next === "paid" ? (row.paidAt ?? u.paidAt ?? at) : row.paidAt;
    const receiptUrl = next === "paid" ? (u.receiptUrl ?? row.receiptUrl) : row.receiptUrl;
    const data = mergeData(row.providerDataJson, { ...u.data, ...(reviewReason ? { reviewReason } : {}) });
    const res = await db
      .prepare(
        "UPDATE loja_payments SET status = ?, provider_status = ?, provider_data_json = ?, receipt_url = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = ?",
      )
      .bind(next, u.providerStatus.slice(0, 30), data, receiptUrl, paidAt, at, row.id, row.status)
      .run();
    if (!res.meta.changes) continue; // raced with another update: re-read and re-apply

    if (next === "paid" && row.status !== "paid") await settleOrder(db, { ...row, status: next, paidAt, receiptUrl });
    if (next === "review" && row.status !== "review") await flagForReview(db, row, reviewReason ?? `status ${u.providerStatus}`);
    return next === row.status ? "unchanged" : "updated";
  }
  throw new Error("payment update kept racing");
}

async function flagForReview(db: D1Database, row: PaymentRow, reason: string) {
  const order = await getOrder(db, row.orderId);
  await alert(
    `⚠️ ${PROVIDER_LABEL[row.provider]} em análise no pedido ${order?.number ?? row.orderId} (${sanitizeAlertText(reason, 120)}). O pedido NÃO foi liberado — resolva no painel → Loja.`,
  );
}

/** A charge just became `paid`: release the order (or tell a human why not). */
async function settleOrder(db: D1Database, payment: PaymentRow) {
  const label = PROVIDER_LABEL[payment.provider];
  const order = await getOrder(db, payment.orderId);
  if (!order) {
    await alert(`⚠️ ${label} pago (${payment.providerRef}) para um pedido que não existe mais. Confira manualmente.`);
    return;
  }
  // A test charge (see TEST MODE) is expected to be exactly the test amount.
  const test = parseJson(payment.detailsJson).test === true;
  const expected = test ? TEST_CHARGE_CENTS : orderAmountCents(order);
  if (payment.amountCents !== expected) {
    await db.prepare("UPDATE loja_payments SET status = 'review', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), payment.id).run();
    await flagForReview(db, payment, `valor ${formatBRL(payment.amountCents / 100)} ≠ esperado ${formatBRL(expected / 100)}`);
    return;
  }
  const amount = formatBRL(payment.amountCents / 100);
  if (order.status === "received") {
    const result = await transitionOrder(db, order.id, "payment_approved", {
      note: `${label} confirmado automaticamente (${payment.providerRef})${test ? " · PEDIDO DE TESTE" : ""}`,
    });
    if (result.ok) {
      await alert(
        test
          ? `🧪 TESTE — ${label} confirmado: pedido ${order.number} · ${amount} (cobrança de teste). Cancele o pedido no painel ao terminar o teste.`
          : `✅ ${label} confirmado: pedido ${order.number} · ${amount}. Já está em “Pagamento confirmado” — pode separar.`,
      );
      return;
    }
    if (result.error === "out_of_stock") {
      await alert(`⚠️ ${label} confirmado no pedido ${order.number} (${amount}), mas falta estoque para reservar (${(result.skus ?? []).join(", ")}). O pedido ficou em “Pedido recebido” — resolva no painel.`);
      return;
    }
    const fresh = await getOrder(db, order.id);
    if (fresh && fresh.status !== "received" && fresh.status !== "cancelled") return; // someone approved it meanwhile
    await alert(`⚠️ ${label} confirmado no pedido ${order.number} (${amount}), mas não foi possível avançar o status automaticamente. Confira no painel.`);
    return;
  }
  if (order.status === "cancelled") {
    await alert(`⚠️ ${label} pago (${amount}) no pedido ${order.number}, que está CANCELADO. Devolva o valor ao cliente ou reabra o pedido manualmente.`);
    return;
  }
  const otherPaid = await db
    .prepare("SELECT COUNT(*) AS n FROM loja_payments WHERE order_id = ? AND status = 'paid' AND id <> ?")
    .bind(order.id, payment.id)
    .first<{ n: number }>();
  await alert(
    otherPaid?.n
      ? `⚠️ ${label} pago EM DUPLICIDADE no pedido ${order.number} (${amount}). Devolva o valor excedente ao cliente.`
      : `ℹ️ ${label} confirmado (${amount}) no pedido ${order.number}, que já estava em outro status. Confira se o pagamento não foi cobrado duas vezes.`,
  );
}

/* ---------- Pix mapping ---------- */

function mapPixStatus(status: PixCharge["status"]): Exclude<PaymentStatus, "creating"> {
  switch (status) {
    case "paid":
      return "paid";
    case "expired":
      return "expired";
    case "held":
      return "review";
    case "error":
      return "failed";
    default:
      return "pending";
  }
}

const PIX_EVENT_STATUS: Record<string, Exclude<PaymentStatus, "creating">> = {
  "order.paid": "paid",
  "order.expired": "expired",
  "order.held": "review",
};

function pixData(p: { end_to_end_id?: string | null; fee_cents?: number | null; net_cents?: number | null; confirmed_at?: number | null }) {
  return { endToEndId: p.end_to_end_id ?? null, feeCents: p.fee_cents ?? null, netCents: p.net_cents ?? null, confirmedAt: p.confirmed_at ?? null };
}

export function pixUpdateFromCharge(charge: PixCharge): ProviderUpdate {
  const status = mapPixStatus(charge.status);
  return {
    provider: "pix",
    providerRef: charge.order_id,
    merchantRef: charge.merchant_ref ?? null,
    status,
    providerStatus: charge.status,
    amountCents: charge.amount_cents,
    receiptUrl: status === "paid" ? pixReceiptUrl(charge.order_id) : null,
    paidAt: charge.paid_at ?? null,
    data: pixData(charge),
  };
}

/** null → an event this integration doesn't act on (acknowledged, ignored). */
export function pixUpdateFromWebhook(evt: PixWebhook): ProviderUpdate | null {
  const status = PIX_EVENT_STATUS[evt.event];
  if (!status) return null;
  return {
    provider: "pix",
    providerRef: evt.order_id,
    merchantRef: evt.merchant_ref ?? null,
    status,
    providerStatus: evt.status,
    amountCents: evt.amount_cents,
    receiptUrl: status === "paid" ? pixReceiptUrl(evt.order_id) : null,
    paidAt: evt.paid_at ?? null,
    data: pixData(evt),
  };
}

/* ---------- crypto mapping ---------- */

/**
 * confirmed / paid_late → paid (both final, both have a receipt).
 * underpaid (less than expected; stays open for a top-up) and mismatch (a
 * transfer that didn't match one order) → a human decides.
 */
function mapCryptoStatus(status: CryptoOrderStatus["status"]): Exclude<PaymentStatus, "creating"> {
  switch (status) {
    case "confirmed":
    case "paid_late":
      return "paid";
    case "underpaid":
    case "mismatch":
      return "review";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

const CRYPTO_EVENTS = new Set(["order.confirmed", "order.paid_late", "order.underpaid", "order.expired"]);

function cryptoData(p: {
  txid?: string | null;
  explorer_url?: string | null;
  from_address?: string | null;
  confirmations?: number | null;
  confirmed_at?: number | null;
  paid?: number | null;
  expected?: number | null;
  price_brl?: number | null;
}) {
  return {
    txid: p.txid ?? null,
    explorerUrl: safeExplorerUrl(p.explorer_url),
    fromAddress: p.from_address && TRON_ADDRESS.test(p.from_address) ? p.from_address : null,
    confirmations: p.confirmations ?? null,
    confirmedAt: p.confirmed_at ?? null,
    amountUsdtPaid: p.paid ?? null,
    amountUsdtExpected: p.expected ?? null,
    priceBrl: p.price_brl ?? null,
  };
}

const brlCents = (amount: number | null | undefined) => (typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : null);

export function cryptoUpdateFromStatus(o: CryptoOrderStatus): ProviderUpdate {
  return {
    provider: "crypto",
    providerRef: o.order_id,
    merchantRef: o.merchant_ref ?? null,
    status: mapCryptoStatus(o.status),
    providerStatus: o.status,
    amountCents: brlCents(o.amount_brl),
    receiptUrl: null,
    paidAt: o.confirmed_at ? new Date(o.confirmed_at * 1000).toISOString() : null,
    data: cryptoData({ ...o, paid: o.paid_amount_usdt, expected: o.amount_usdt }),
  };
}

/** null → an event this integration doesn't act on (acknowledged, ignored). */
export function cryptoUpdateFromWebhook(evt: CryptoWebhook): ProviderUpdate | null {
  if (!CRYPTO_EVENTS.has(evt.event)) return null;
  return {
    provider: "crypto",
    providerRef: evt.order_id,
    merchantRef: evt.merchant_ref ?? null,
    status: mapCryptoStatus(evt.status),
    providerStatus: evt.status,
    amountCents: brlCents(evt.amount_brl),
    receiptUrl: null,
    paidAt: evt.confirmed_at ? new Date(evt.confirmed_at * 1000).toISOString() : null,
    data: cryptoData({ ...evt, paid: evt.amount_usdt_paid, expected: evt.amount_usdt_expected }),
  };
}

/**
 * Asks the provider for the charge's current state — the fallback for a
 * late or lost webhook, run while someone looks at the order page. The
 * `checked_at` claim makes concurrent viewers share one call per interval.
 * Returns true when it applied something.
 */
async function syncPayment(db: D1Database, row: PaymentRow): Promise<boolean> {
  if (!row.providerRef) return false;
  const now = Date.now();
  const recent = now - Date.parse(row.createdAt) < LATE_PAYMENT_WINDOW_MS[row.provider];
  // Crypto `underpaid` stays open for a top-up that can still confirm it.
  const watching = row.status === "pending" || (row.status === "expired" && recent) || (row.provider === "crypto" && row.status === "review" && recent);
  if (!watching) return false;
  const claim = await db
    .prepare("UPDATE loja_payments SET checked_at = ? WHERE id = ? AND (checked_at IS NULL OR checked_at < ?)")
    .bind(new Date(now).toISOString(), row.id, new Date(now - SYNC_INTERVAL_MS).toISOString())
    .run();
  if (!claim.meta.changes) return false;
  if (row.provider === "pix") {
    const result = await getPixCharge(row.providerRef);
    if (!result.ok) return false;
    return (await applyProviderUpdate(db, pixUpdateFromCharge(result.charge))) === "updated";
  }
  const result = await getCryptoOrder(row.providerRef);
  if (!result.ok) return false;
  return (await applyProviderUpdate(db, cryptoUpdateFromStatus(result.data))) === "updated";
}

/* ---------- webhooks ---------- */

/**
 * `sha256=<hex>` = HMAC-SHA256 of the exact raw body, compared in constant
 * time. The bare `<hex>` is accepted too (the crypto OpenAPI describes the
 * header "without the prefix", its examples show it with) — same secret,
 * same MAC, so nothing weaker.
 */
export async function verifyWebhookSignature(secret: string, raw: ArrayBuffer, header: string | null) {
  if (!header) return false;
  const received = header.trim().toLowerCase();
  const normalized = received.startsWith("sha256=") ? received : `sha256=${received}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, raw));
  const expected = `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  return constantTimeEqual(expected, normalized);
}

/** The order's paid crypto charge, for the receipt download. */
export async function paidCryptoCharge(db: D1Database, orderId: string) {
  return db
    .prepare("SELECT provider_ref AS providerRef FROM loja_payments WHERE order_id = ? AND provider = 'crypto' AND status = 'paid' AND provider_ref IS NOT NULL ORDER BY updated_at DESC LIMIT 1")
    .bind(orderId)
    .first<{ providerRef: string }>();
}

/** True when this exact event was already processed (provider retry). */
export async function isDuplicateEvent(db: D1Database, provider: PaymentProvider, providerRef: string, event: string) {
  const row = await db
    .prepare("SELECT 1 AS seen FROM loja_payment_events WHERE provider = ? AND provider_ref = ? AND event = ?")
    .bind(provider, providerRef, event)
    .first<{ seen: number }>();
  return Boolean(row);
}

/** Recorded AFTER processing succeeded, so a crash mid-way is retried by the provider. */
export async function recordEvent(db: D1Database, provider: PaymentProvider, providerRef: string, event: string, payload: string) {
  await db
    .prepare("INSERT OR IGNORE INTO loja_payment_events (provider, provider_ref, event, payload_json, received_at) VALUES (?, ?, ?, ?, ?)")
    .bind(provider, providerRef, event.slice(0, 40), payload.slice(0, 4000), new Date().toISOString())
    .run();
}

/* ---------- admin ---------- */

export type AdminPayment = {
  id: string;
  provider: PaymentProvider;
  providerRef: string | null;
  status: PaymentStatus;
  providerStatus: string | null;
  amountCents: number;
  receiptUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  data: Record<string, unknown>;
  test: boolean;
};

/** Charges per order for the admin list (newest first). */
export async function paymentsForOrders(db: D1Database, orderIds: string[]): Promise<Record<string, AdminPayment[]>> {
  const out: Record<string, AdminPayment[]> = {};
  if (!orderIds.length) return out;
  const { results } = await db
    .prepare(`${SELECT_PAYMENT} WHERE order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY created_at DESC`)
    .bind(...orderIds)
    .all<PaymentRow>();
  for (const r of results) {
    (out[r.orderId] ??= []).push({
      id: r.id,
      provider: r.provider,
      providerRef: r.providerRef,
      status: r.status,
      providerStatus: r.providerStatus,
      amountCents: r.amountCents,
      receiptUrl: r.receiptUrl,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
      data: parseJson(r.providerDataJson),
      test: parseJson(r.detailsJson).test === true,
    });
  }
  return out;
}
