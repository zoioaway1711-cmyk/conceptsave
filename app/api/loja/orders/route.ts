import { env } from "cloudflare:workers";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { MIN_FILL_MS, botRejectionReason, rejectBot, withoutAntiBotFields } from "@/lib/loja-antibot";
import { createOrder, orderAccessToken, orderCreateSchema } from "@/lib/loja-orders";
import { consumeRateLimit, enforceGlobalLimit, enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { sendTelegramAlert } from "@/lib/telegram";
import { formatBRL } from "@/app/loja/_lib/catalog";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/**
 * Per-order Telegram pushes per hour, store-wide. Past this, orders keep
 * being created normally (they're all in the admin) but the owner's phone
 * gets one "alerts paused" message instead of hundreds of pings — a burst
 * of fake orders from many networks can't turn Telegram into a spam cannon
 * or bury real security alerts.
 */
const ORDER_ALERTS_PER_HOUR = 30;

async function alertNewOrder(message: string) {
  const budget = await consumeRateLimit(db(), "loja_order_alert", "all", ORDER_ALERTS_PER_HOUR, 3600);
  if (budget.allowed) return sendTelegramAlert(message);
  if (budget.count === ORDER_ALERTS_PER_HOUR + 1) {
    return sendTelegramAlert(
      `⚠️ Muitos pedidos novos na loja na última hora (mais de ${ORDER_ALERTS_PER_HOUR}). Alertas por pedido pausados por até ${Math.ceil(budget.retryAfterSeconds / 60)} min — confira o painel → Loja.`,
    );
  }
}

/**
 * Creates a storefront order. Every business rule is enforced here, not in
 * the browser: field validation, which SKUs are purchasable, prices,
 * shipping and stock. See lib/loja-orders.ts.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  // Counts every attempt (including rejected ones) so the endpoint can't be
  // hammered — generous enough for a real shopper correcting fields or
  // several people behind one carrier NAT. Unpaid orders hold no stock, so
  // a burst of fake orders can't sell the store out.
  const limit = await enforceRateLimits(db(), "loja_order_create", rateLimitKey(request), [
    { limit: 12, windowSeconds: 600 },
    { limit: 40, windowSeconds: 86400 },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);
  // Store-wide cap: bounds fake-order floods (and Telegram alert spam) even
  // from an attacker spread over many networks.
  const global = await enforceGlobalLimit(db(), "loja_order_create", 300);
  if (!global.allowed) return rateLimitResponse(global);

  const parsed = await readBody(request, orderCreateSchema, 16000);
  if (!parsed) return Response.json({ error: "invalid_body" }, { status: 400 });
  // Anti-bot (lib/loja-antibot.ts): after the rate limits, so a bot can't
  // use rejections to flood the audit log either.
  const botReason = botRejectionReason(parsed, MIN_FILL_MS.order);
  if (botReason) return rejectBot(db(), request, "order", botReason, parsed);
  const body = withoutAntiBotFields(parsed);

  let result: Awaited<ReturnType<typeof createOrder>>;
  try {
    result = await createOrder(db(), body);
  } catch (error) {
    // Database/internal failure: log it for us, tell the shopper nothing
    // about internals (no messages, no stack traces).
    console.error("[loja] createOrder failed", error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  if (!result.ok) {
    const status = result.error.code === "invalid_fields" ? 422 : 409;
    return Response.json({ error: result.error.code, detail: result.error }, { status });
  }

  // A re-submission of an order that already exists (double click, retry
  // after a network error) gets that same order back — same shape and
  // status as a new one, so every client handles it — and no second alert.
  if (!result.duplicate) {
    const units = result.items.reduce((s, i) => s + i.qty, 0);
    // No customer data in the alert — just enough for the team to go look.
    await alertNewOrder(
      `🛒 Novo pedido na loja: ${result.number}\n${units} ${units === 1 ? "item" : "itens"} · ${formatBRL(result.totals.total)} · pagamento: ${body.payment.method}\nAbra o painel → Loja para combinar o pagamento.`,
    );
  }

  return Response.json(
    { id: result.id, number: result.number, token: await orderAccessToken(result.id), totals: result.totals },
    { status: 201, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
