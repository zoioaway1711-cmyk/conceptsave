import { isSameOrigin } from "@/lib/api-validation";
import { customerId } from "@/lib/customer-auth";
import { database } from "@/lib/customer-profile";
import { touchPresence } from "@/lib/presence";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Lightweight "I'm still here" ping so Live Intelligence can tell ONLINE
 * from IDLE (see lib/presence.ts) even when a customer isn't otherwise
 * calling the API. Updates only `last_seen_at` — no event is recorded for
 * this on its own, since a heartbeat isn't a security-relevant action.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const profileId = await customerId(request);
  if (!profileId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = database();
  const limit = await enforceRateLimits(db, "presence_heartbeat", `${clientIp(request)}:${profileId}`, [{ limit: 6, windowSeconds: 60 }]);
  if (!limit.allowed) return rateLimitResponse(limit);
  await touchPresence(db, profileId);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
