import { env } from "cloudflare:workers";
import { z } from "zod";
import { STORE, getProduct, type Product } from "@/app/loja/_lib/catalog";
import { digits, fieldError, type CheckoutForm } from "@/app/loja/_lib/checkout";
import { ALLOWED_TRANSITIONS, type OrderStatus } from "@/app/loja/_lib/order-status";
import { computeTotals, type OrderTotals } from "@/app/loja/_lib/pricing";

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

async function hkdfKey(info: string, usage: "encrypt" | "sign") {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(info) },
    material,
    usage === "encrypt" ? { name: "AES-GCM", length: 256 } : { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign"],
  );
}

/** CPF at rest: AES-GCM with its own HKDF label (not the license-serial key). */
export async function encryptCpf(cpf: string) {
  const key = await hkdfKey("loja.cpf_encryption", "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(cpf)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptCpf(encoded: string) {
  const key = await hkdfKey("loja.cpf_encryption", "encrypt");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
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

export const orderCreateSchema = z.object({
  customer: z.object({
    name: z.string().max(120),
    email: z.string().max(160),
    cpf: z.string().max(20),
    phone: z.string().max(20),
  }),
  address: z.object({
    cep: z.string().max(10),
    street: z.string().max(160),
    number: z.string().max(10),
    complement: z.string().max(80).default(""),
    district: z.string().max(80),
    city: z.string().max(80),
    uf: z.string().max(2),
  }),
  payment: z.object({
    method: z.enum(["pix", "cartao", "boleto"]),
    installments: z.number().int().min(1).max(STORE.maxInstallments).default(1),
  }),
  items: z.array(z.object({ slug: z.string().max(80), qty: z.number().int().min(1).max(99) })).min(1).max(30),
  expectedTotal: z.number().nonnegative(),
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

function validateFields(input: OrderCreateInput) {
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

export async function createOrder(db: D1Database, rawInput: OrderCreateInput): Promise<{ ok: true; id: string; number: string; totals: OrderTotals; items: OrderItem[] } | { ok: false; error: CreateOrderError }> {
  const input: OrderCreateInput = { ...rawInput, address: { ...rawInput.address, uf: rawInput.address.uf.trim().toUpperCase() } };
  const fields = validateFields(input);
  if (Object.keys(fields).length) return { ok: false, error: { code: "invalid_fields", fields } };

  // Merge duplicate lines, then resolve each against the live catalog.
  const merged = new Map<string, number>();
  for (const i of input.items) merged.set(i.slug, Math.min(99, (merged.get(i.slug) ?? 0) + i.qty));
  const lines: { product: Product; qty: number }[] = [];
  const blocked: string[] = [];
  for (const [slug, qty] of merged) {
    const product = getProduct(slug);
    if (!product || !product.available || !product.purchasable) blocked.push(product?.sku ?? slug);
    else lines.push({ product, qty });
  }
  if (blocked.length) return { ok: false, error: { code: "not_purchasable", skus: blocked } };

  const totals = computeTotals(lines);
  if (Math.abs(totals.total - input.expectedTotal) > 0.005) return { ok: false, error: { code: "price_changed", totals } };

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
  const cpfEncrypted = await encryptCpf(cpfDigits);
  const history: OrderHistoryEntry[] = [{ status: "received", at }];
  const address: OrderAddress = { ...input.address, cep: digits(input.address.cep), uf: input.address.uf.toUpperCase() };

  // Availability check only (no reservation — see header comment).
  const short = await shortSkus(db, items);
  if (short.length) return { ok: false, error: { code: "out_of_stock", skus: short } };

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
          input.customer.name.trim(),
          input.customer.email.trim().toLowerCase(),
          digits(input.customer.phone),
          cpfEncrypted,
          cpfDigits.slice(-2),
          JSON.stringify(address),
          JSON.stringify(items),
          JSON.stringify(totals),
          totals.total,
          input.payment.method,
          input.payment.method === "cartao" ? input.payment.installments : 1,
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
  paymentMethod: "pix" | "cartao" | "boleto";
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

/** What the customer's order page may see: contact data partially masked. */
export function publicOrderView(order: StoredOrder) {
  return {
    ...order,
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
