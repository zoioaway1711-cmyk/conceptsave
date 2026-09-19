import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { parseStoredJson } from "@/lib/api-validation";
import { listLicensesForOwner } from "@/lib/licenses";
import { presenceOf } from "@/lib/presence";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

// Every field the live feed captures per event, so the inspector can show
// the complete picture (exact IP, reason, free-form metadata) for anyone
// who already holds admin.users.inspect — see the permission-boundary note
// below for why that's a deliberately different bar than admin.live.view.
const ACTIVITY_LIMIT = 300;

/**
 * The "User Inspector" — deliberately behind its own permission
 * (admin.users.inspect), separate from admin.live.view: seeing the feed's
 * minimum-necessary summary is not the same authorization as opening one
 * person's full activity. Holding this permission is what unlocks the full,
 * unmasked IP/device/metadata trail below (admin.security.ip.view is not
 * checked again here — it gates the *feed*, this endpoint is the deliberate
 * "full record" escape hatch for whoever can already open a specific
 * person's file). Never returns a password/session token/cookie — there is
 * nothing of that shape stored for a customer profile in the first place
 * (auth is a stateless signed cookie, not a stored secret).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.users.inspect");
  if (admin instanceof Response) return admin;
  const id = (await params).id;
  const database = db();
  const profile = await database.prepare(
    "SELECT id, first_seen AS firstSeen, last_active AS lastActive, last_seen_at AS lastSeenAt, preferred_language AS preferredLanguage, points, level, level_name AS levelName, rank_override AS rankOverride, blocked, benefits_json AS benefitsJson, consent_json AS consentJson FROM customer_profiles WHERE id=?",
  ).bind(id).first<{ id: string; firstSeen: string; lastActive: string; lastSeenAt: string | null; preferredLanguage: string; points: number; level: number; levelName: string; rankOverride: number; blocked: number; benefitsJson: string; consentJson: string }>();
  if (!profile) return Response.json({ error: "not_found" }, { status: 404 });

  const [licenses, events] = await Promise.all([
    listLicensesForOwner(database, id),
    database.prepare(
      `SELECT id, type, severity, material_id AS materialId, license_id AS licenseId, ip, country, region, city, device, reason, metadata_json AS metadataJson, created_at AS createdAt
       FROM live_events WHERE actor_profile_id=? ORDER BY id DESC LIMIT ${ACTIVITY_LIMIT}`,
    ).bind(id).all<{ id: number; type: string; severity: string; materialId: number | null; licenseId: number | null; ip: string; country: string; region: string; city: string; device: string; reason: string; metadataJson: string; createdAt: string }>(),
  ]);

  const activity = events.results.map((event) => ({ ...event, metadata: parseStoredJson(event.metadataJson, {}) }));
  const latestEvent = activity[0];
  return Response.json({
    account: {
      id: profile.id,
      status: profile.blocked ? "blocked" : "active",
      presence: presenceOf(profile.lastSeenAt),
      createdAt: profile.firstSeen,
      lastActivity: profile.lastActive,
      lastSeenAt: profile.lastSeenAt,
      preferredLanguage: profile.preferredLanguage,
      rankOverride: profile.rankOverride,
    },
    gamification: { points: profile.points, level: profile.level, levelName: profile.levelName, benefits: parseStoredJson(profile.benefitsJson, []) },
    consent: parseStoredJson(profile.consentJson, {}),
    licenses,
    device: latestEvent ? { browser: latestEvent.device } : null,
    location: latestEvent ? { country: latestEvent.country, region: latestEvent.region, city: latestEvent.city, approximate: true } : null,
    lastKnownIp: latestEvent?.ip || null,
    activity,
    activityTruncated: events.results.length >= ACTIVITY_LIMIT,
  }, { headers: { "cache-control": "no-store" } });
}
