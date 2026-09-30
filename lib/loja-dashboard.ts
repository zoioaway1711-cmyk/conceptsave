import { pixConfigured } from "./loja-pix";
import { cryptoConfigured } from "./loja-crypto";
import { saoPauloMidnight } from "./loja-telegram";
import type { OrderStatus } from "@/app/loja/_lib/order-status";

/*
 * "Vendas do dia" for the admin panel: one São Paulo calendar day of orders
 * and online payments, plus the state of the Pix/crypto webhooks. Read-only;
 * the same numbers the Telegram /loja report uses, with the detail a screen
 * can show (per hour, per product, per order).
 */

const SP_OFFSET_MS = 3 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** Where the providers deliver (see docs/loja-pagamentos.md); the Vercel proxy forwards to the Worker. */
export const WEBHOOK_URLS = {
  pix: "https://saveconcept.com.br/api/loja/webhooks/pix",
  crypto: "https://saveconcept.com.br/api/loja/webhooks/crypto",
} as const;

/** "YYYY-MM-DD" in São Paulo → [from, to) in UTC. Anything else → today. */
export function saoPauloDay(day: string | null | undefined, now = new Date()) {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  let from = saoPauloMidnight(now);
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + SP_OFFSET_MS;
    // Only real dates, not in the future, at most ~2 years back.
    if (Number.isFinite(t) && new Date(t - SP_OFFSET_MS).toISOString().slice(0, 10) === day && t <= from.getTime() && t >= from.getTime() - 800 * DAY_MS) {
      from = new Date(t);
    }
  }
  const to = new Date(from.getTime() + DAY_MS);
  return { day: new Date(from.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10), from, to };
}

type OrderRow = { id: string; number: string; status: OrderStatus; name: string; method: string; total: number; itemsJson: string; createdAt: string };
type PaymentRow = { orderId: string; provider: string; status: string; cents: number; details: string; data: string; paidAt: string | null; updatedAt: string };

const hourOf = (iso: string) => new Date(new Date(iso).getTime() - SP_OFFSET_MS).getUTCHours();
const isTest = (details: string) => {
  try {
    return (JSON.parse(details) as { test?: unknown }).test === true;
  } catch {
    return false;
  }
};
const numField = (json: string, key: string) => {
  try {
    const v = (JSON.parse(json) as Record<string, unknown>)[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};

export async function salesDashboard(db: D1Database, dayParam?: string | null, now = new Date()) {
  const { day, from, to } = saoPauloDay(dayParam, now);
  const a = from.toISOString();
  const b = to.toISOString();
  const prevA = new Date(from.getTime() - DAY_MS).toISOString();

  const [ordersRes, prevRes, paidRes, awaiting, toShip, reviewRes, eventsRes, eventCounts, lastEvents] = await Promise.all([
    db
      .prepare(
        "SELECT id, number, status, customer_name AS name, payment_method AS method, total, items_json AS itemsJson, created_at AS createdAt FROM loja_orders WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 500",
      )
      .bind(a, b)
      .all<OrderRow>(),
    db
      .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS value FROM loja_orders WHERE created_at >= ? AND created_at < ? AND status <> 'cancelled'")
      .bind(prevA, a)
      .first<{ n: number; value: number }>(),
    // Money received that day (by payment time, like the Telegram report) — may belong to older orders.
    db
      .prepare(
        "SELECT order_id AS orderId, provider, status, amount_cents AS cents, details_json AS details, provider_data_json AS data, paid_at AS paidAt, updated_at AS updatedAt FROM loja_payments WHERE status = 'paid' AND COALESCE(paid_at, updated_at) >= ? AND COALESCE(paid_at, updated_at) < ?",
      )
      .bind(a, b)
      .all<PaymentRow>(),
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS value FROM loja_orders WHERE status = 'received'").first<{ n: number; value: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM loja_orders WHERE status IN ('payment_approved', 'preparing')").first<{ n: number }>(),
    db
      .prepare(
        "SELECT o.number, p.provider, p.provider_status AS providerStatus, p.amount_cents AS cents, p.updated_at AS updatedAt FROM loja_payments p JOIN loja_orders o ON o.id = p.order_id WHERE p.status = 'review' ORDER BY p.updated_at DESC LIMIT 10",
      )
      .all<{ number: string; provider: string; providerStatus: string | null; cents: number; updatedAt: string }>(),
    db
      .prepare(
        "SELECT e.provider, e.event, e.provider_ref AS providerRef, e.received_at AS receivedAt, o.number FROM loja_payment_events e LEFT JOIN loja_payments p ON p.provider = e.provider AND p.provider_ref = e.provider_ref LEFT JOIN loja_orders o ON o.id = p.order_id ORDER BY e.id DESC LIMIT 20",
      )
      .all<{ provider: string; event: string; providerRef: string; receivedAt: string; number: string | null }>(),
    db
      .prepare("SELECT provider, COUNT(*) AS n, MAX(received_at) AS lastAt FROM loja_payment_events WHERE received_at >= ? AND received_at < ? GROUP BY provider")
      .bind(a, b)
      .all<{ provider: string; n: number; lastAt: string }>(),
    db.prepare("SELECT provider, MAX(received_at) AS lastAt FROM loja_payment_events GROUP BY provider").all<{ provider: string; lastAt: string }>(),
  ]);

  const orders = ordersRes.results;
  // Latest charge per order of the day (for the list).
  const ids = orders.map((o) => o.id);
  const latestCharge: Record<string, { provider: string; status: string; test: boolean }> = {};
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT order_id AS orderId, provider, status, details_json AS details FROM loja_payments WHERE order_id IN (${chunk.map(() => "?").join(",")}) ORDER BY created_at ASC`)
      .bind(...chunk)
      .all<{ orderId: string; provider: string; status: string; details: string }>();
    for (const r of results) latestCharge[r.orderId] = { provider: r.provider, status: r.status, test: isTest(r.details) };
  }

  const live = orders.filter((o) => o.status !== "cancelled");
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, value: 0, receivedCents: 0 }));
  const byMethod: Record<string, { n: number; value: number }> = {};
  const byStatus: Partial<Record<OrderStatus, number>> = {};
  const products: Record<string, { sku: string; name: string; qty: number; value: number }> = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  for (const o of live) {
    const h = hourly[hourOf(o.createdAt)];
    h.orders++;
    h.value += o.total;
    const m = (byMethod[o.method] ??= { n: 0, value: 0 });
    m.n++;
    m.value += o.total;
    let items: { sku: string; name: string; qty: number; unitPrice: number }[] = [];
    try {
      items = JSON.parse(o.itemsJson);
    } catch {
      /* malformed row: skip its items */
    }
    for (const it of items) {
      const p = (products[it.sku] ??= { sku: it.sku, name: it.name, qty: 0, value: 0 });
      p.qty += it.qty;
      p.value += it.qty * it.unitPrice;
    }
  }

  const received: Record<string, { n: number; cents: number; feeCents: number; netCents: number; tests: number }> = {};
  for (const p of paidRes.results) {
    const r = (received[p.provider] ??= { n: 0, cents: 0, feeCents: 0, netCents: 0, tests: 0 });
    r.n++;
    r.cents += p.cents;
    const fee = numField(p.data, "feeCents");
    r.feeCents += fee ?? 0;
    r.netCents += numField(p.data, "netCents") ?? p.cents - (fee ?? 0);
    if (isTest(p.details)) r.tests++;
    hourly[hourOf(p.paidAt ?? p.updatedAt)].receivedCents += p.cents;
  }
  const receivedTotal = Object.values(received).reduce(
    (acc, r) => ({ n: acc.n + r.n, cents: acc.cents + r.cents, feeCents: acc.feeCents + r.feeCents, netCents: acc.netCents + r.netCents, tests: acc.tests + r.tests }),
    { n: 0, cents: 0, feeCents: 0, netCents: 0, tests: 0 },
  );
  const value = live.reduce((s, o) => s + o.total, 0);

  return {
    day,
    isToday: day === saoPauloDay(null, now).day,
    generatedAt: now.toISOString(),
    orders: {
      n: live.length,
      value,
      avgTicket: live.length ? value / live.length : 0,
      cancelled: byStatus.cancelled ?? 0,
      byStatus,
      byMethod: Object.entries(byMethod)
        .map(([method, v]) => ({ method, ...v }))
        .sort((x, y) => y.value - x.value),
      previousDay: { n: prevRes?.n ?? 0, value: prevRes?.value ?? 0 },
    },
    received: { ...receivedTotal, byProvider: Object.entries(received).map(([provider, v]) => ({ provider, ...v })) },
    hourly,
    products: Object.values(products)
      .sort((x, y) => y.value - x.value || y.qty - x.qty)
      .slice(0, 10),
    list: orders.map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      customer: o.name.split(/\s+/)[0] ?? "",
      method: o.method,
      total: o.total,
      charge: latestCharge[o.id] ?? null,
    })),
    attention: { awaiting: awaiting ?? { n: 0, value: 0 }, toShip: toShip?.n ?? 0, review: reviewRes.results },
    webhooks: {
      providers: (["pix", "crypto"] as const).map((provider) => ({
        provider,
        url: WEBHOOK_URLS[provider],
        configured: provider === "pix" ? pixConfigured() : cryptoConfigured(),
        eventsOnDay: eventCounts.results.find((r) => r.provider === provider)?.n ?? 0,
        lastEventAt: lastEvents.results.find((e) => e.provider === provider)?.lastAt ?? null,
      })),
      recent: eventsRes.results,
    },
  };
}

export type SalesDashboard = Awaited<ReturnType<typeof salesDashboard>>;
