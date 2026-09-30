import { env } from "cloudflare:workers";
import { z } from "zod";
import { getProduct, type Product } from "@/app/loja/_lib/catalog";
import { PAYMENT_METHODS, digits, fieldError, type CheckoutForm, type PaymentMethod } from "@/app/loja/_lib/checkout";
import { ALLOWED_TRANSITIONS, type OrderStatus } from "@/app/loja/_lib/order-status";
import { computeTotals, type OrderTotals } from "@/app/loja/_lib/pricing";
import { antiBotShape } from "./loja-antibot";
import { REGULATED_CATEGORIES, loadCatalog } from "./loja-catalog";
import { CRYPTO_LIMITS, cryptoConfigured } from "./loja-crypto";
import { cleanLine, isStrictEmail } from "./text-sanitize";

/*
 * Storefront orders (loja_orders). The server is the only authority on
 * what an order costs: prices, discounts and shipping are recomputed from
 * the catalog with the same `computeTotals` the UI shows, and the client's
 * total is only used to detect "the price changed while you were on the
 * page" (answered with 409 + the current totals, never silently charged).
 *
 * No payment gateway exists yet: orders start as `received` and the team
 * collects payment offline, then advances the status in the admin.
 *
 * Stock is only RESERVED (decremented) when the team confirms payment
 * (`payment_approved`), never at creation: an unpaid order must not hold
 * stock, or anyone could zero the store with fake orders. Creation only
 * checks that enough is available right now. Each item records whether it
 * was actually reserved (`reserved`), and cancelling returns exactly that.
 */

function secret() {
  const s = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET não configurado");
  return s;
}

async function hkdfKey(info: string, usage: "encrypt" | "sign", rawSecret: string = secret()) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(rawSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(info) },
    material,
    usage === "encrypt" ? { name: "AES-GCM", length: 256 } : { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign"],
  );
}

/*
 * CPF at rest: AES-GCM. Two key generations, told apart by a prefix:
 * - "v2:<base64>" — key derived from the OPTIONAL `LOJA_DATA_KEY` secret.
 *   Used for every new order once that secret is configured, so CPFs no
 *   longer depend on SESSION_SECRET: rotating the session secret (e.g.
 *   after a suspected admin-cookie leak) stops destroying every stored
 *   CPF, and a leak of the session secret alone no longer opens them.
 * - "<base64>" (legacy, no prefix) — key derived from SESSION_SECRET with
 *   its own HKDF label. Still written when LOJA_DATA_KEY isn't set, and
 *   always readable, so existing orders keep working unchanged.
 * Base64 never contains ':', so the prefix can't be confused with legacy data.
 */
const CPF_V2_PREFIX = "v2:";

function dataKeySecret(): string | undefined {
  const value = (env as unknown as { LOJA_DATA_KEY?: string }).LOJA_DATA_KEY;
  return value && value.length >= 32 ? value : undefined;
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

export async function encryptCpf(cpf: string) {
  const dataKey = dataKeySecret();
  const key = dataKey ? await hkdfKey("loja.cpf_encryption.v2", "encrypt", dataKey) : await hkdfKey("loja.cpf_encryption", "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(cpf)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return dataKey ? `${CPF_V2_PREFIX}${toBase64(out)}` : toBase64(out);
}

export async function decryptCpf(encoded: string) {
  let key: CryptoKey;
  let payload = encoded;
  if (encoded.startsWith(CPF_V2_PREFIX)) {
    const dataKey = dataKeySecret();
    if (!dataKey) throw new Error("LOJA_DATA_KEY ausente para CPF v2");
    key = await hkdfKey("loja.cpf_encryption.v2", "encrypt", dataKey);
    payload = encoded.slice(CPF_V2_PREFIX.length);
  } else {
    key = await hkdfKey("loja.cpf_encryption", "encrypt");
  }
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plain);
}

/**
 * Capability token for the customer's order page (no store accounts exist).
 * Deterministic HMAC of the order id, so nothing extra is stored.
 */
export async function orderAccessToken(orderId: string) {
  const key = await hkdfKey("loja.order_access", "sign");
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(orderId)));
  return [...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyOrderAccessToken(orderId: string, token: string) {
  const expected = await orderAccessToken(orderId);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/* ---------- create ---------- */

// Nested objects are .strict(): the checkout sends exactly these keys, so
// anything else is a hand-made request and is refused instead of silently
// ignored. The top level stays lenient only for forward compatibility of
// the anti-bot fields (hp / elapsedMs, see lib/loja-antibot.ts).
export const orderCreateSchema = z.object({
  customer: z
    .object({
      name: z.string().max(120),
      email: z.string().max(160),
      cpf: z.string().max(20),
      phone: z.string().max(20),
    })
    .strict(),
  address: z
    .object({
      cep: z.string().max(10),
      street: z.string().max(160),
      number: z.string().max(10),
      complement: z.string().max(80).default(""),
      district: z.string().max(80),
      city: z.string().max(80),
      uf: z.string().max(2),
    })
    .strict(),
  payment: z
    .object({
      method: z.enum(PAYMENT_METHODS),
      // Kept for older clients; new orders are always stored with 1 (no card).
      installments: z.number().int().min(1).max(12).default(1),
    })
    .strict(),
  // Slugs are catalog identifiers (lowercase, digits, hyphen). Restricting
  // the charset also means an error that names a rejected slug can never
  // echo arbitrary attacker text back.
  items: z
    .array(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/), qty: z.number().int().min(1).max(99) }).strict())
    .min(1)
    .max(30),
  // JSON.parse("1e999") is Infinity, which z.number() accepts: bound it.
  expectedTotal: z.number().nonnegative().finite().max(10_000_000),
  ...antiBotShape,
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export type OrderItem = {
  sku: string;
  slug: string;
  name: string;
  presentation: string;
  qty: number;
  unitPrice: number;
  listUnitPrice: number;
  /** True once this line's quantity was taken from controlled stock. */
  reserved?: boolean;
};
export type OrderAddress = OrderCreateInput["address"];
export type OrderHistoryEntry = { status: OrderStatus; at: string; note?: string };

export type CreateOrderError =
  | { code: "invalid_fields"; fields: Partial<Record<keyof CheckoutForm, string>> }
  | { code: "not_purchasable"; skus: string[] }
  | { code: "out_of_stock"; skus: string[] }
  | { code: "price_changed"; totals: OrderTotals };

function validateFields(input: Pick<OrderCreateInput, "customer" | "address" | "payment">) {
  const form: CheckoutForm = {
    ...input.customer,
    ...input.address,
    payment: input.payment.method,
    installments: String(input.payment.installments),
  };
  const fields: Partial<Record<keyof CheckoutForm, string>> = {};
  for (const key of ["name", "email", "cpf", "phone", "cep", "street", "number", "district", "city", "uf"] as const) {
    const e = fieldError(key, form);
    if (e) fields[key] = e;
  }
  return fields;
}

const NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function orderNumber(now: Date) {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = crypto.getRandomValues(new Uint8Array(4));
  return `SC${ymd}-${[...rand].map((b) => NUMBER_ALPHABET[b % NUMBER_ALPHABET.length]).join("")}`;
}

/**
 * Server-side normalization before validation: invisible/bidi/control
 * characters removed from every free-text field (see lib/text-sanitize.ts),
 * e-mail lowercased, UF uppercased. The anti-bot fields (hp / elapsedMs)
 * are dropped here, so they can never be persisted.
 */
function normalizeInput(raw: OrderCreateInput) {
  const c = raw.customer;
  const a = raw.address;
  return {
    customer: { name: cleanLine(c.name), email: cleanLine(c.email).toLowerCase(), cpf: cleanLine(c.cpf), phone: cleanLine(c.phone) },
    address: {
      cep: cleanLine(a.cep),
      street: cleanLine(a.street),
      number: cleanLine(a.number),
      complement: cleanLine(a.complement ?? ""),
      district: cleanLine(a.district),
      city: cleanLine(a.city),
      uf: cleanLine(a.uf).toUpperCase(),
    },
    payment: { method: raw.payment.method, installments: raw.payment.installments },
    items: raw.items.map((i) => ({ slug: i.slug, qty: i.qty })),
    expectedTotal: raw.expectedTotal,
  } satisfies Omit<OrderCreateInput, "hp" | "elapsedMs">;
}

// Only digits plus the punctuation a person (or the input mask) types.
const MASKED_DIGITS = /^[\d\s.()\-/+]*$/;

/**
 * Checks the shared checkout rules (app/loja/_lib/checkout.ts) cannot make
 * on their own because they read only the digits: "abc529.982.247-25xyz"
 * or a 20-digit "phone" would otherwise pass and be stored.
 */
function strictFormatErrors(input: ReturnType<typeof normalizeInput>) {
  const fields: Partial<Record<keyof CheckoutForm, string>> = {};
  if (input.customer.email && !isStrictEmail(input.customer.email)) fields.email = "E-mail com caracteres inválidos. Use o formato nome@provedor.com.";
  if (!MASKED_DIGITS.test(input.customer.cpf)) fields.cpf = "Use apenas os números do CPF.";
  if (!MASKED_DIGITS.test(input.customer.phone)) fields.phone = "Use apenas os números do celular, com DDD.";
  else if (digits(input.customer.phone).length > 11) fields.phone = "Número com dígitos demais. Informe só DDD + número.";
  if (!MASKED_DIGITS.test(input.address.cep)) fields.cep = "Digite os 8 números do CEP.";
  return fields;
}

/**
 * Categories never sold online (vials, vial kits) — a regulatory decision,
 * enforced here even if the product row says `purchasable` (e.g. flipped
 * by a mistaken or compromised admin session, or a direct DB edit).
 */
function isRegulated(product: Product) {
  return REGULATED_CATEGORIES.has(product.category);
}

/** Same shopper re-submitting the same order (double click, retry after a timeout) within this window gets the existing order back. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

type CreateOrderResult =
  | { ok: true; id: string; number: string; totals: OrderTotals; items: OrderItem[]; duplicate?: boolean }
  | { ok: false; error: CreateOrderError };

/**
 * An identical order (same e-mail, name, phone, CPF, address, items,
 * payment and total) created in the last few minutes and still unpaid.
 * Comparing EVERYTHING — including the full CPF, decrypted — is what makes
 * returning that order's access token safe: whoever can reproduce all of
 * it already knows every detail the order page would show them.
 */
async function findDuplicateOrder(
  db: D1Database,
  q: { email: string; name: string; phone: string; cpf: string; addressJson: string; itemsJson: string; method: string; installments: number; total: number },
) {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { results } = await db
    .prepare(
      "SELECT id, number, customer_name AS name, customer_phone AS phone, customer_cpf_encrypted AS enc, address_json AS addressJson, items_json AS itemsJson, payment_method AS method, installments FROM loja_orders WHERE created_at >= ? AND customer_email = ? AND status = 'received' AND total = ? ORDER BY created_at DESC LIMIT 3",
    )
    .bind(since, q.email, q.total)
    .all<{ id: string; number: string; name: string; phone: string; enc: string; addressJson: string; itemsJson: string; method: string; installments: number }>();
  for (const row of results) {
    if (row.name !== q.name || row.phone !== q.phone || row.addressJson !== q.addressJson || row.itemsJson !== q.itemsJson) continue;
    if (row.method !== q.method || row.installments !== q.installments) continue;
    try {
      if ((await decryptCpf(row.enc)) === q.cpf) return row;
    } catch {
      // unreadable ciphertext (rotated key) → not provably the same order
    }
  }
  return null;
}

export async function createOrder(db: D1Database, rawInput: OrderCreateInput): Promise<CreateOrderResult> {
  await loadCatalog(db);
  const input = normalizeInput(rawInput);
  // The shared rules' message wins when both flag a field (it says exactly what to fix).
  const fields = { ...strictFormatErrors(input), ...validateFields(input) };
  // Only the linked APIs (Pix, crypto) take new orders. Card and boleto stay
  // in the schema and the database only for older orders.
  if (input.payment.method === "cartao" || input.payment.method === "boleto") {
    fields.payment = "Aceitamos apenas Pix ou cripto (USDT). Escolha uma dessas formas de pagamento.";
  }
  // Crypto exists only as an automatic gateway: never accepted as a
  // "we'll contact you" order when the gateway is off.
  if (input.payment.method === "crypto" && !cryptoConfigured()) fields.payment = "Pagamento em cripto indisponível no momento. Escolha outra forma de pagamento.";
  if (Object.keys(fields).length) return { ok: false, error: { code: "invalid_fields", fields } };

  // Merge duplicate lines, then resolve each against the live catalog.
  const merged = new Map<string, number>();
  for (const i of input.items) merged.set(i.slug, Math.min(99, (merged.get(i.slug) ?? 0) + i.qty));
  const lines: { product: Product; qty: number }[] = [];
  const blocked: string[] = [];
  for (const [slug, qty] of merged) {
    const product = getProduct(slug);
    if (!product || !product.available || !product.purchasable || isRegulated(product)) blocked.push(product?.sku ?? slug);
    else lines.push({ product, qty });
  }
  if (blocked.length) return { ok: false, error: { code: "not_purchasable", skus: blocked } };

  const totals = computeTotals(lines);
  if (Math.abs(totals.total - input.expectedTotal) > 0.005) return { ok: false, error: { code: "price_changed", totals } };
  const cents = Math.round(totals.total * 100);
  if (input.payment.method === "crypto" && (cents < CRYPTO_LIMITS.minCents || cents > CRYPTO_LIMITS.maxCents)) {
    return { ok: false, error: { code: "invalid_fields", fields: { payment: "Pagamento em cripto disponível para pedidos a partir de R$ 20,00. Escolha outra forma de pagamento." } } };
  }

  const items: OrderItem[] = lines.map(({ product, qty }) => ({
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    presentation: product.presentation,
    qty,
    unitPrice: product.price,
    listUnitPrice: product.oldPrice ?? product.price,
  }));

  const now = new Date();
  const at = now.toISOString();
  const id = `ord_${crypto.randomUUID()}`;
  const cpfDigits = digits(input.customer.cpf);
  const history: OrderHistoryEntry[] = [{ status: "received", at }];
  const address: OrderAddress = { ...input.address, cep: digits(input.address.cep) };
  const installments = 1;
  const phone = digits(input.customer.phone);
  const addressJson = JSON.stringify(address);
  const itemsJson = JSON.stringify(items);

  const duplicate = await findDuplicateOrder(db, {
    email: input.customer.email,
    name: input.customer.name,
    phone,
    cpf: cpfDigits,
    addressJson,
    itemsJson,
    method: input.payment.method,
    installments,
    total: totals.total,
  });
  if (duplicate) return { ok: true, id: duplicate.id, number: duplicate.number, totals, items, duplicate: true };

  // Availability check only (no reservation — see header comment).
  const short = await shortSkus(db, items);
  if (short.length) return { ok: false, error: { code: "out_of_stock", skus: short } };

  const cpfEncrypted = await encryptCpf(cpfDigits);
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = orderNumber(now);
    try {
      await db
        .prepare(
          `INSERT INTO loja_orders (id, number, status, customer_name, customer_email, customer_phone, customer_cpf_encrypted, cpf_last2, address_json, items_json, totals_json, total, payment_method, installments, tracking_code, history_json, created_at, updated_at)
           VALUES (?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        .bind(
          id,
          number,
          input.customer.name,
          input.customer.email,
          phone,
          cpfEncrypted,
          cpfDigits.slice(-2),
          addressJson,
          itemsJson,
          JSON.stringify(totals),
          totals.total,
          input.payment.method,
          installments,
          JSON.stringify(history),
          at,
          at,
        )
        .run();
      return { ok: true, id, number, totals, items };
    } catch (error) {
      // Order number collision (unique index) → retry with a new number.
      if (/UNIQUE constraint failed: loja_orders\.number/i.test(String((error as Error)?.message ?? error))) continue;
      throw error;
    }
  }
  throw new Error("could not allocate order number");
}

/** Controlled SKUs whose current quantity can't cover the requested one. */
async function shortSkus(db: D1Database, items: Pick<OrderItem, "sku" | "qty">[]) {
  const out: string[] = [];
  for (const i of items) {
    const row = await db.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").bind(i.sku).first<{ quantity: number }>();
    if (row && row.quantity < i.qty) out.push(i.sku);
  }
  return out;
}

/* ---------- read ---------- */

type OrderRow = {
  id: string;
  number: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  cpfLast2: string;
  addressJson: string;
  itemsJson: string;
  totalsJson: string;
  total: number;
  paymentMethod: PaymentMethod;
  installments: number;
  trackingCode: string | null;
  historyJson: string;
  createdAt: string;
  updatedAt: string;
};

const SELECT_ORDER = `SELECT id, number, status, customer_name AS customerName, customer_email AS customerEmail, customer_phone AS customerPhone, cpf_last2 AS cpfLast2, address_json AS addressJson, items_json AS itemsJson, totals_json AS totalsJson, total, payment_method AS paymentMethod, installments, tracking_code AS trackingCode, history_json AS historyJson, created_at AS createdAt, updated_at AS updatedAt FROM loja_orders`;

function hydrate(row: OrderRow) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    customer: { name: row.customerName, email: row.customerEmail, phone: row.customerPhone, cpfMasked: `***.***.***-${row.cpfLast2}` },
    address: JSON.parse(row.addressJson) as OrderAddress,
    items: JSON.parse(row.itemsJson) as OrderItem[],
    totals: JSON.parse(row.totalsJson) as OrderTotals,
    total: row.total,
    payment: { method: row.paymentMethod, installments: row.installments },
    trackingCode: row.trackingCode,
    history: JSON.parse(row.historyJson) as OrderHistoryEntry[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export type StoredOrder = ReturnType<typeof hydrate>;

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/**
 * What the customer's order page may see: contact data partially masked,
 * and no back-office data — the admin's free-text status notes and the
 * per-line stock reservation flags stay internal.
 */
export function publicOrderView(order: StoredOrder) {
  return {
    ...order,
    history: order.history.map(({ status, at }) => ({ status, at })),
    items: order.items.map((item) => {
      const publicItem = { ...item };
      delete publicItem.reserved;
      return publicItem;
    }),
    customer: {
      name: order.customer.name.split(/\s+/)[0],
      email: maskEmail(order.customer.email),
      phone: `(${order.customer.phone.slice(0, 2)}) •••••-${order.customer.phone.slice(-4)}`,
      cpfMasked: order.customer.cpfMasked,
    },
  };
}

export async function getOrder(db: D1Database, id: string) {
  const row = await db.prepare(`${SELECT_ORDER} WHERE id = ?`).bind(id).first<OrderRow>();
  return row ? hydrate(row) : null;
}

/**
 * Admin listing, newest first, keyset-paginated by `before` (created_at of
 * the last row seen). `q` matches the order number, e-mail or name.
 */
export async function listOrders(
  db: D1Database,
  { status, q, before, limit = 50 }: { status?: OrderStatus; q?: string; before?: string; limit?: number } = {},
) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  if (q) {
    where.push("(number LIKE ? OR customer_email LIKE ? OR customer_name LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    args.push(like, like.toLowerCase(), like);
  }
  if (before) {
    where.push("created_at < ?");
    args.push(before);
  }
  const sql = `${SELECT_ORDER}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...args, limit + 1).all<OrderRow>();
  const page = results.slice(0, limit).map(hydrate);
  return { orders: page, nextBefore: results.length > limit ? page[page.length - 1].createdAt : null };
}

/* ---------- admin transitions ---------- */

/** Tracking code as shown to the customer, or null when it doesn't look like one (see the admin PATCH route). */
export function normalizeTrackingCode(value: string): string | null {
  const cleaned = cleanLine(value).toUpperCase();
  if (!/^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/.test(cleaned)) return null;
  const compact = cleaned.replace(/[ -]/g, "");
  if (compact.length < 8 || compact.length > 30) return null;
  const digitCount = compact.replace(/\D/g, "").length;
  return digitCount * 2 >= compact.length ? compact : null;
}


export type TransitionError = "not_found" | "invalid_transition" | "tracking_required" | "out_of_stock";

export async function transitionOrder(
  db: D1Database,
  id: string,
  to: OrderStatus,
  { trackingCode, note }: { trackingCode?: string; note?: string } = {},
): Promise<{ ok: true; order: StoredOrder; from: OrderStatus } | { ok: false; error: TransitionError; skus?: string[] }> {
  const order = await getOrder(db, id);
  if (!order) return { ok: false, error: "not_found" };
  if (!ALLOWED_TRANSITIONS[order.status].includes(to)) return { ok: false, error: "invalid_transition" };
  const tracking = trackingCode?.trim() || order.trackingCode || null;
  if (to === "shipped" && !tracking) return { ok: false, error: "tracking_required" };

  const at = new Date().toISOString();
  const history = [...order.history, { status: to, at, ...(note?.trim() ? { note: note.trim().slice(0, 200) } : {}) }];

  // Which lines move stock in this transition:
  //  - approving payment reserves every line whose SKU is controlled NOW;
  //  - cancelling returns only lines that were actually reserved.
  let items = order.items;
  const stockMoves: { sku: string; delta: number }[] = [];
  if (to === "payment_approved") {
    const controlled = new Set<string>();
    for (const i of order.items) {
      const row = await db.prepare("SELECT 1 AS c FROM loja_stock WHERE sku = ?").bind(i.sku).first<{ c: number }>();
      if (row) controlled.add(i.sku);
    }
    items = order.items.map((i) => ({ ...i, reserved: controlled.has(i.sku) }));
    for (const i of items) if (i.reserved) stockMoves.push({ sku: i.sku, delta: -i.qty });
  } else if (to === "cancelled") {
    items = order.items.map((i) => ({ ...i, reserved: false }));
    for (const i of order.items) if (i.reserved) stockMoves.push({ sku: i.sku, delta: i.qty });
  }

  const statements = [
    // `status = ?` guard: a concurrent transition can't be overwritten.
    db
      .prepare("UPDATE loja_orders SET status = ?, tracking_code = ?, history_json = ?, items_json = ?, updated_at = ? WHERE id = ? AND status = ?")
      .bind(to, tracking, JSON.stringify(history), JSON.stringify(items), at, id, order.status),
    // Stock moves only apply if the guarded update above did (same
    // transaction, so EXISTS sees it). CHECK(quantity >= 0) aborts the
    // whole batch if approving would oversell.
    ...stockMoves.map((m) =>
      db
        .prepare(
          "UPDATE loja_stock SET quantity = quantity + ?, updated_at = ?, updated_by = ? WHERE sku = ? AND EXISTS (SELECT 1 FROM loja_orders WHERE id = ? AND status = ? AND updated_at = ?)",
        )
        .bind(m.delta, at, `order:${order.number}`, m.sku, id, to, at),
    ),
  ];
  let result: D1Result;
  try {
    [result] = await db.batch(statements);
  } catch (error) {
    if (/loja_stock_quantity_check/i.test(String((error as Error)?.message ?? error))) {
      return { ok: false, error: "out_of_stock", skus: await shortSkus(db, order.items) };
    }
    throw error;
  }
  if (!result.meta.changes) return { ok: false, error: "invalid_transition" };
  return { ok: true, order: { ...order, items, status: to, trackingCode: tracking, history, updatedAt: at }, from: order.status };

}

/* ---------- admin summary ---------- */

export async function ordersSummary(db: D1Database) {
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [byStatus, week, subs] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS value FROM loja_orders GROUP BY status").all<{ status: OrderStatus; n: number; value: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM loja_orders WHERE created_at >= ?").bind(since7).first<{ n: number }>(),
    db.prepare("SELECT kind, COUNT(*) AS n FROM loja_subscribers GROUP BY kind").all<{ kind: "news" | "restock"; n: number }>(),
  ]);
  const status = Object.fromEntries(byStatus.results.map((r) => [r.status, { n: r.n, value: r.value }])) as Partial<
    Record<OrderStatus, { n: number; value: number }>
  >;
  const confirmed = (["payment_approved", "preparing", "shipped", "delivered"] as const).reduce(
    (acc, s) => ({ n: acc.n + (status[s]?.n ?? 0), value: acc.value + (status[s]?.value ?? 0) }),
    { n: 0, value: 0 },
  );
  return {
    awaitingPayment: status.received ?? { n: 0, value: 0 },
    toShip: { n: (status.payment_approved?.n ?? 0) + (status.preparing?.n ?? 0) },
    confirmed,
    lastWeek: week?.n ?? 0,
    subscribers: Object.fromEntries(subs.results.map((r) => [r.kind, r.n])) as Partial<Record<"news" | "restock", number>>,
  };
}
