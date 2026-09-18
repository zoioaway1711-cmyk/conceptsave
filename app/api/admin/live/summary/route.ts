import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { PRESENCE_IDLE_WINDOW_MS, PRESENCE_ONLINE_WINDOW_MS } from "@/lib/presence";
import { windowStartIso } from "@/lib/live-window";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.live.view");
  if (admin instanceof Response) return admin;
  const now = Date.now();
  const database = db();
  const [online, idle, activations, invalid, security] = await database.batch<{ n: number }>([
    database.prepare("SELECT COUNT(*) AS n FROM customer_profiles WHERE last_seen_at > ?").bind(new Date(now - PRESENCE_ONLINE_WINDOW_MS).toISOString()),
    database.prepare("SELECT COUNT(*) AS n FROM customer_profiles WHERE last_seen_at <= ? AND last_seen_at > ?").bind(new Date(now - PRESENCE_ONLINE_WINDOW_MS).toISOString(), new Date(now - PRESENCE_IDLE_WINDOW_MS).toISOString()),
    database.prepare("SELECT COUNT(*) AS n FROM live_events WHERE type='LICENSE_ACTIVATED' AND created_at > ?").bind(windowStartIso("5m", now)),
    database.prepare("SELECT COUNT(*) AS n FROM live_events WHERE type IN ('INVALID_SERIAL','ACTIVATION_REJECTED') AND created_at > ?").bind(windowStartIso("5m", now)),
    database.prepare("SELECT COUNT(*) AS n FROM live_events WHERE severity IN ('warning','critical') AND created_at > ?").bind(windowStartIso("5m", now)),
  ]);
  const n = (result: D1Result<{ n: number }>) => result.results[0]?.n ?? 0;
  return Response.json({
    onlineUsers: n(online),
    idleUsers: n(idle),
    activationsLast5Min: n(activations),
    invalidAttemptsLast5Min: n(invalid),
    securityEventsLast5Min: n(security),
    generatedAt: new Date(now).toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
