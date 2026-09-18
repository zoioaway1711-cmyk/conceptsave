import { env } from "cloudflare:workers";
import { hasPermission, requirePermission } from "@/lib/admin-auth";
import { maskProfileId } from "@/lib/live-events";
import { PRESENCE_IDLE_WINDOW_MS, presenceOf } from "@/lib/presence";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.live.view");
  if (admin instanceof Response) return admin;
  const cutoff = new Date(Date.now() - PRESENCE_IDLE_WINDOW_MS).toISOString();
  const { results } = await db().prepare(
    "SELECT id, last_seen_at AS lastSeenAt, last_active AS lastActive, points, level_name AS levelName, blocked FROM customer_profiles WHERE last_seen_at > ? ORDER BY last_seen_at DESC LIMIT 200",
  ).bind(cutoff).all<{ id: string; lastSeenAt: string; lastActive: string; points: number; levelName: string; blocked: number }>();
  const canInspect = hasPermission(admin, "admin.users.inspect");
  const sessions = results.map((row) => ({
    profileId: canInspect ? row.id : maskProfileId(row.id),
    presence: presenceOf(row.lastSeenAt),
    lastSeenAt: row.lastSeenAt,
    points: row.points,
    levelName: row.levelName,
    blocked: Boolean(row.blocked),
  }));
  return Response.json({ sessions }, { headers: { "cache-control": "no-store" } });
}
