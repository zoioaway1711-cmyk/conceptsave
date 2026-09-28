import { env } from "cloudflare:workers";
import { getOrder, publicOrderView, verifyOrderAccessToken } from "@/lib/loja-orders";
import { enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

/*
 * The URL of this endpoint carries the order's capability token (?t=), and
 * the answer carries the customer's address. Stated on the response itself
 * — not left to the global API headers in proxy.ts — so it holds even if
 * that middleware's matcher or the edge gateway ever changes:
 * - never stored by any cache (browser, Vercel proxy, Cloudflare);
 * - the URL (with the token) never sent onward as a Referer;
 * - never indexed, even if the link ends up somewhere public.
 */
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
} as const;

function withPrivateHeaders(response: Response) {
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) response.headers.set(k, v);
  return response;
}

/** Customer order page data. Requires the order's access token (?t=). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_order_read", rateLimitKey(request), [{ limit: 60, windowSeconds: 60 }]);
  if (!limit.allowed) return withPrivateHeaders(rateLimitResponse(limit));
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const notFound = () => Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE_HEADERS });
  if (!/^ord_[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(token) || !(await verifyOrderAccessToken(id, token))) {
    // Same answer for "doesn't exist" and "wrong token": no enumeration.
    return notFound();
  }
  const order = await getOrder(db, id);
  if (!order) return notFound();
  return Response.json({ order: publicOrderView(order) }, { headers: PRIVATE_HEADERS });
}
