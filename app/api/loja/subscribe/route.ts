import { env } from "cloudflare:workers";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { subscribe, subscribeSchema } from "@/lib/loja-subscribers";
import { enforceGlobalLimit, enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

/** E-mail opt-in (news / restock). Requires explicit consent: true. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_subscribe", rateLimitKey(request), [
    { limit: 8, windowSeconds: 600 },
    { limit: 30, windowSeconds: 86400 },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);
  const global = await enforceGlobalLimit(db, "loja_subscribe", 500);
  if (!global.allowed) return rateLimitResponse(global);
  const body = await readBody(request, subscribeSchema, 2000);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (!(await subscribe(db, body))) return Response.json({ error: "invalid_sku" }, { status: 400 });
  return new Response(null, { status: 204 });
}
