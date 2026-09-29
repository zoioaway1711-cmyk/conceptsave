import { formatBRL } from "@/app/loja/_lib/catalog";
import { sendTelegramAlert } from "./telegram";

/*
 * Store (loja) reports for the owner's Telegram bot — the same bot and chat
 * as every other alert (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID):
 *  - /loja [ontem]      today's (or yesterday's) numbers, on demand
 *  - /pagamentos [n]    the latest online charges
 *  - daily summary      yesterday's numbers, sent by the Worker cron
 *                       (worker/index.ts `scheduled`, 08:00 in São Paulo)
 * Real-time alerts (new order, Pix/crypto confirmed, expired, in review)
 * live next to the events themselves (app/api/loja/orders, lib/loja-payments).
 * No customer data here either: order numbers and amounts only.
 */

/** São Paulo has no DST since 2019: a fixed UTC−3 offset is exact. */
const SP_OFFSET_MS = 3 * 3600 * 1000;

/** Midnight in São Paulo, `daysAgo` days before `now`, as a UTC Date. */
export function saoPauloMidnight(now = new Date(), daysAgo = 0) {
  const sp = new Date(now.getTime() - SP_OFFSET_MS);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - daysAgo) + SP_OFFSET_MS);
}

const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const METHOD_LABEL: Record<string, string> = { pix: "Pix", crypto: "Cripto", cartao: "Cartão", boleto: "Boleto" };
const PAYMENT_LABEL: Record<string, string> = {
  creating: "gerando",
  pending: "aguardando",
  paid: "pago ✅",
  expired: "expirou",
  review: "em análise ⚠️",
  failed: "falhou",
};

const money = (cents: number) => formatBRL(cents / 100);

/** Numbers for [from, to): new orders, money received online, and what needs attention right now. */
export async function storeSummary(db: D1Database, from: Date, to: Date, title: string): Promise<string> {
  const a = from.toISOString();
  const b = to.toISOString();
  const [orders, paid, awaiting, toShip, review] = await Promise.all([
    db
      .prepare("SELECT payment_method AS method, COUNT(*) AS n, COALESCE(SUM(total), 0) AS value FROM loja_orders WHERE created_at >= ? AND created_at < ? GROUP BY payment_method")
      .bind(a, b)
      .all<{ method: string; n: number; value: number }>(),
    db
      .prepare(
        "SELECT provider, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents, SUM(CASE WHEN details_json LIKE '%\"test\":true%' THEN 1 ELSE 0 END) AS tests FROM loja_payments WHERE status = 'paid' AND COALESCE(paid_at, updated_at) >= ? AND COALESCE(paid_at, updated_at) < ? GROUP BY provider",
      )
      .bind(a, b)
      .all<{ provider: string; n: number; cents: number; tests: number }>(),
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS value FROM loja_orders WHERE status = 'received'").first<{ n: number; value: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM loja_orders WHERE status IN ('payment_approved', 'preparing')").first<{ n: number }>(),
    db
      .prepare(
        "SELECT o.number, p.provider, p.provider_status AS providerStatus, p.amount_cents AS cents FROM loja_payments p JOIN loja_orders o ON o.id = p.order_id WHERE p.status = 'review' ORDER BY p.updated_at DESC LIMIT 5",
      )
      .all<{ number: string; provider: string; providerStatus: string | null; cents: number }>(),
  ]);

  const orderCount = orders.results.reduce((s, r) => s + r.n, 0);
  const orderValue = orders.results.reduce((s, r) => s + r.value, 0);
  const byMethod = orders.results.map((r) => `${METHOD_LABEL[r.method] ?? r.method} ${r.n}`).join(" · ");
  const paidCents = paid.results.reduce((s, r) => s + r.cents, 0);
  const tests = paid.results.reduce((s, r) => s + (r.tests ?? 0), 0);
  const paidBy = paid.results.map((r) => `${METHOD_LABEL[r.provider] ?? r.provider} ${money(r.cents)} (${r.n})`).join(" · ");

  const lines = [
    title,
    `🛒 Pedidos novos: ${orderCount}${orderCount ? ` · ${formatBRL(orderValue)}` : ""}${byMethod ? `\n   ${byMethod}` : ""}`,
    `💰 Recebido online: ${money(paidCents)}${paidBy ? `\n   ${paidBy}` : ""}${tests ? `\n   (inclui ${tests} ${tests === 1 ? "pagamento" : "pagamentos"} de teste)` : ""}`,
    "",
    "Agora:",
    `⏳ Aguardando pagamento: ${awaiting?.n ?? 0}${awaiting?.n ? ` · ${formatBRL(awaiting.value)}` : ""}`,
    `📦 Para separar/enviar: ${toShip?.n ?? 0}`,
  ];
  if (review.results.length) {
    lines.push(`⚠️ Pagamentos em análise: ${review.results.length}`);
    for (const r of review.results) lines.push(`   • ${r.number} — ${METHOD_LABEL[r.provider] ?? r.provider} ${money(r.cents)} (${r.providerStatus ?? "análise"})`);
    lines.push("   Resolva no painel → Loja → Pedidos.");
  }
  return lines.join("\n");
}

/** `/loja` (today so far) or `/loja ontem` (all of yesterday). */
export function storeSummaryCommand(db: D1Database, arg: string | undefined, now = new Date()) {
  if (arg && /^(ontem|yesterday)$/i.test(arg)) {
    const from = saoPauloMidnight(now, 1);
    return storeSummary(db, from, saoPauloMidnight(now), `🧾 Loja — resumo de ontem (${dayFmt.format(from)})`);
  }
  const from = saoPauloMidnight(now);
  return storeSummary(db, from, now, `🧾 Loja — hoje até agora (${dayFmt.format(now)})`);
}

/** `/pagamentos [n]` — the latest online charges, newest first. */
export async function recentPaymentsCommand(db: D1Database, arg: string | undefined) {
  const n = Math.min(Math.max(parseInt(arg ?? "", 10) || 10, 1), 30);
  const { results } = await db
    .prepare(
      "SELECT o.number, p.provider, p.status, p.amount_cents AS cents, p.created_at AS createdAt, p.details_json AS details FROM loja_payments p JOIN loja_orders o ON o.id = p.order_id ORDER BY p.created_at DESC LIMIT ?",
    )
    .bind(n)
    .all<{ number: string; provider: string; status: string; cents: number; createdAt: string; details: string }>();
  if (!results.length) return "Nenhum pagamento online ainda.";
  return [
    `💳 Últimos ${results.length} pagamentos online:`,
    ...results.map(
      (r) =>
        `• ${timeFmt.format(new Date(r.createdAt))} · ${r.number} · ${METHOD_LABEL[r.provider] ?? r.provider} ${money(r.cents)} · ${PAYMENT_LABEL[r.status] ?? r.status}${r.details.includes('"test":true') ? " · teste" : ""}`,
    ),
  ].join("\n");
}

/** Cron: yesterday's summary, every morning. */
export async function sendDailyStoreSummary(db: D1Database, now = new Date()) {
  const from = saoPauloMidnight(now, 1);
  const text = await storeSummary(db, from, saoPauloMidnight(now), `📅 Bom dia! Resumo da loja de ontem (${dayFmt.format(from)})`);
  await sendTelegramAlert(text);
}
