import { env } from "cloudflare:workers";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { eventsBatchSchema, insertEvents } from "@/lib/loja-events";
import { clientIp, enforceRateLimits } from "@/lib/rate-limit";

/**
 * Consent-gated first-party analytics intake. The client only calls this
 * after an explicit opt-in; the payload is re-sanitized here. Always 204:
 * analytics must never surface errors to shoppers.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 204 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_events", clientIp(request), [{ limit: 60, windowSeconds: 60 }]);
  if (!limit.allowed) return new Response(null, { status: 204 });
  const body = await readBody(request, eventsBatchSchema, 32000);
  if (body) await insertEvents(db, body).catch(() => {});
  return new Response(null, { status: 204 });
}
