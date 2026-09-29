import { env } from "cloudflare:workers";
import { z } from "zod";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { getOrder, verifyOrderAccessToken } from "@/lib/loja-orders";
import { startPayment } from "@/lib/loja-payments";
import { consumeRateLimit, enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

/*
 * POST { t } — the order page asks for its Pix code. Returns the live
 * charge when there is one; otherwise creates it at the provider. Same
 * capability token as GET /api/loja/orders/:id (no store accounts).
 *
 * Every creation is a real charge at the provider, so it is bounded per
 * network AND per order; a customer only ever needs a new one when the
 * previous code expired (30 min).
 */

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
} as const;

const bodySchema = z.object({ t: z.string().regex(/^[0-9a-f]{32}$/) }).strict();

const STATUS: Record<string, number> = {
  not_supported: 409,
  not_configured: 503,
  order_not_payable: 409,
  amount_out_of_range: 409,
  in_progress: 409,
  provider_unavailable: 503,
  provider_error: 502,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403, headers: PRIVATE_HEADERS });
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_payment_start", rateLimitKey(request), [
    { limit: 20, windowSeconds: 600 },
    { limit: 60, windowSeconds: 86400 },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readBody(request, bodySchema, 500);
  const { id } = await params;
  const notFound = () => Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE_HEADERS });
  if (!body || !/^ord_[0-9a-f-]{36}$/.test(id) || !(await verifyOrderAccessToken(id, body.t))) return notFound();
  const order = await getOrder(db, id);
  if (!order) return notFound();

  // Per order: generous for "code expired → new code", tight for a loop.
  const perOrder = await consumeRateLimit(db, "loja_payment_start_order", id, 8, 3600);
  if (!perOrder.allowed) return rateLimitResponse(perOrder);

  let result: Awaited<ReturnType<typeof startPayment>>;
  try {
    result = await startPayment(db, order);
  } catch (error) {
    console.error("[loja] startPayment failed", error);
    return Response.json({ error: "server_error" }, { status: 500, headers: PRIVATE_HEADERS });
  }
  if (!result.ok) return Response.json({ error: result.error }, { status: STATUS[result.error] ?? 409, headers: PRIVATE_HEADERS });
  return Response.json({ payment: result.state }, { headers: PRIVATE_HEADERS });
}
