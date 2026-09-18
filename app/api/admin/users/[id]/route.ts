import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { parseStoredJson } from "@/lib/api-validation";
import { listLicensesForOwner } from "@/lib/licenses";
import { presenceOf } from "@/lib/presence";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/**
 * The "User Inspector" — deliberately behind its own permission
 * (admin.users.inspect), separate from admin.live.view: seeing the feed's
 * minimum-necessary summary is not the same authorization as opening one
 * person's full activity. Never returns a password/session token/cookie —
 * there is nothing of that shape stored for a customer profile in the
 * first place (auth is a stateless signed cookie, not a stored secret).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.users.inspect");
  if (admin instanceof Response) return admin;
  const id = (await params).id;
  const database = db();
  const profile = await database.prepare(
    "SELECT id, first_seen AS firstSeen, last_active AS lastActive, last_seen_at AS lastSeenAt, points, level_name AS levelName, blocked, benefits_json AS benefitsJson FROM customer_profiles WHERE id=?",
  ).bind(id).first<{ id: string; firstSeen: string; lastActive: string; lastSeenAt: string | null; points: number; levelName: string; blocked: number; benefitsJson: string }>();
  if (!profile) return Response.json({ error: "not_found" }, { status: 404 });

  const [licenses, events] = await Promise.all([
    listLicensesForOwner(database, id),
    database.prepare(
      "SELECT type, ip, country, region, city, device, created_at AS createdAt FROM live_events WHERE actor_profile_id=? ORDER BY id DESC LIMIT 50",
    ).bind(id).all<{ type: string; ip: string; country: string; region: string; city: string; device: string; createdAt: string }>(),
  ]);

  const latestEvent = events.results[0];
  return Response.json({
    account: { id: profile.id, status: profile.blocked ? "blocked" : "active", presence: presenceOf(profile.lastSeenAt), createdAt: profile.firstSeen, lastActivity: profile.lastActive },
    gamification: { points: profile.points, levelName: profile.levelName, benefits: parseStoredJson(profile.benefitsJson, []) },
    licenses,
    device: latestEvent ? { browser: latestEvent.device } : null,
    location: latestEvent ? { country: latestEvent.country, region: latestEvent.region, city: latestEvent.city, approximate: true } : null,
    activity: events.results,
  }, { headers: { "cache-control": "no-store" } });
}
