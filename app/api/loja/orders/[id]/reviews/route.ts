import { env } from "cloudflare:workers";
import { isSameOrigin } from "@/lib/api-validation";
import { getOrder, verifyOrderAccessToken } from "@/lib/loja-orders";
import { defaultAuthor, orderReviewState, reviewInputSchema, submitReview } from "@/lib/loja-reviews";
import { enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

/*
 * Reviews from the customer's own order page. The order's access token
 * (x-order-token) is the proof of purchase; only a DELIVERED order can
 * review, once per product, and nothing shows in the store before an admin
 * approves it.
 */
const PRIVATE = { "cache-control": "private, no-store, max-age=0", "referrer-policy": "no-referrer" } as const;

async function authorize(request: Request, id: string) {
  const token = request.headers.get("x-order-token") ?? "";
  if (!/^ord_[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(token) || !(await verifyOrderAccessToken(id, token))) return false;
  return true;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_review_read", rateLimitKey(request), [{ limit: 60, windowSeconds: 60 }]);
  if (!limit.allowed) return rateLimitResponse(limit);
  const { id } = await params;
  const order = (await authorize(request, id)) ? await getOrder(db, id) : null;
  if (!order) return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
  return Response.json(
    { canReview: order.status === "delivered", reviewed: await orderReviewState(db, id), suggestedAuthor: defaultAuthor(order.customer.name) },
    { headers: PRIVATE },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403, headers: PRIVATE });
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_review_write", rateLimitKey(request), [
    { limit: 10, windowSeconds: 600 },
    { limit: 30, windowSeconds: 86_400 },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);
  const { id } = await params;
  if (!(await authorize(request, id))) return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
  const parsed = reviewInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_fields", fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) }, { status: 422, headers: PRIVATE });
  }
  const result = await submitReview(db, id, parsed.data);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "already_reviewed" ? 409 : 422;
    return Response.json({ error: result.error }, { status, headers: PRIVATE });
  }
  return Response.json({ ok: true }, { status: 201, headers: PRIVATE });
}
