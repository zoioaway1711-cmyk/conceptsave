import { env } from "cloudflare:workers";
import { getOrder, publicOrderView, verifyOrderAccessToken } from "@/lib/loja-orders";
import { enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

/** Customer order page data. Requires the order's access token (?t=). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_order_read", rateLimitKey(request), [{ limit: 60, windowSeconds: 60 }]);
  if (!limit.allowed) return rateLimitResponse(limit);
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^ord_[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(token) || !(await verifyOrderAccessToken(id, token))) {
    // Same answer for "doesn't exist" and "wrong token": no enumeration.
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const order = await getOrder(db, id);
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ order: publicOrderView(order) });
}
