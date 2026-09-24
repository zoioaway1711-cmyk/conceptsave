import { env } from "cloudflare:workers";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { createOrder, orderAccessToken, orderCreateSchema } from "@/lib/loja-orders";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { sendTelegramAlert } from "@/lib/telegram";
import { formatBRL } from "@/app/loja/_lib/catalog";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
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
  const limit = await enforceRateLimits(db(), "loja_order_create", clientIp(request), [
    { limit: 12, windowSeconds: 600 },
    { limit: 40, windowSeconds: 86400 },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readBody(request, orderCreateSchema, 16000);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await createOrder(db(), body);
  if (!result.ok) {
    const status = result.error.code === "invalid_fields" ? 422 : 409;
    return Response.json({ error: result.error.code, detail: result.error }, { status });
  }

  const units = result.items.reduce((s, i) => s + i.qty, 0);
  // No customer data in the alert — just enough for the team to go look.
  await sendTelegramAlert(
    `🛒 Novo pedido na loja: ${result.number}\n${units} ${units === 1 ? "item" : "itens"} · ${formatBRL(result.totals.total)} · pagamento: ${body.payment.method}\nAbra o painel → Loja para combinar o pagamento.`,
  );

  return Response.json(
    { id: result.id, number: result.number, token: await orderAccessToken(result.id), totals: result.totals },
    { status: 201 },
  );
}
