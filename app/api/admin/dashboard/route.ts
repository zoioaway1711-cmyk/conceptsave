import { env } from "cloudflare:workers";
import { parseStoredJson } from "@/lib/api-validation";
import { requirePermission } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.dashboard.view");
  if (admin instanceof Response) return admin;
  const db = (env as unknown as { DB: D1Database }).DB;
  const [profiles, licenseCounts] = await db.batch([
    db.prepare(
      `SELECT id, first_seen AS firstSeen, last_active AS lastActive, last_seen_at AS lastSeenAt, preferred_language AS preferredLanguage, points, level, level_name AS levelName, benefits_json AS benefitsJson, consent_json AS consentJson, rank_override AS rankOverride, blocked FROM customer_profiles ORDER BY last_active DESC LIMIT 1000`,
    ),
    // A live COUNT join, not a JSON blob kept in sync by hand — this is
    // the whole point of moving ownership into `licenses`.
    db.prepare(
      `SELECT owner_profile_id AS profileId, COUNT(*) AS activeLicenses FROM licenses WHERE owner_profile_id IS NOT NULL AND status='active' AND (expires_at IS NULL OR expires_at > ?) GROUP BY owner_profile_id`,
    ).bind(new Date().toISOString()),
  ]);
  const countsByProfile = new Map((licenseCounts.results as { profileId: string; activeLicenses: number }[]).map((row) => [row.profileId, row.activeLicenses]));
  const parsedProfiles = (profiles.results as Record<string, unknown>[]).map((row) => ({
    ...row,
    benefits: parseStoredJson(row.benefitsJson, []),
    consent: parseStoredJson(row.consentJson, {}),
    blocked: Boolean(row.blocked),
    activeLicenses: countsByProfile.get(row.id as string) ?? 0,
  }));
  return Response.json({ profiles: parsedProfiles }, { headers: { "cache-control": "no-store" } });
}
