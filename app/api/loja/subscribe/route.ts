import { env } from "cloudflare:workers";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { MIN_FILL_MS, botRejectionReason, rejectBot, withoutAntiBotFields } from "@/lib/loja-antibot";
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
  const parsed = await readBody(request, subscribeSchema, 2000);
  if (!parsed) return Response.json({ error: "invalid_body" }, { status: 400 });
  // Anti-bot (lib/loja-antibot.ts): honeypot filled or submitted faster
  // than a person can type an e-mail → same 400 as a bad body, nothing stored.
  const botReason = botRejectionReason(parsed, MIN_FILL_MS.subscribe);
  if (botReason) return rejectBot(db, request, "subscribe", botReason, parsed);
  if (!(await subscribe(db, withoutAntiBotFields(parsed)))) return Response.json({ error: "invalid_sku" }, { status: 400 });
  return new Response(null, { status: 204 });
}
