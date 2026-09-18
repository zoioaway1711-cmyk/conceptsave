import { env } from "cloudflare:workers";
import { parseStoredJson } from "./api-validation";
import { listLicensesForOwner } from "./licenses";
export const database = () => (env as unknown as { DB: D1Database }).DB;

/**
 * License ownership/activation now lives entirely in the `licenses` table
 * (owner_profile_id, activated_at) — see lib/licenses.ts. This profile row
 * only carries gamification/account state; it is never the source of truth
 * for which licenses someone owns.
 */
export async function getProfile(id: string) {
  const row = await database().prepare(
    `SELECT id, first_seen AS firstSeen, last_active AS lastActive, last_seen_at AS lastSeenAt, preferred_language AS preferredLanguage, points, level, level_name AS levelName, rank_override AS rankOverride, blocked, benefits_json AS benefitsJson, consent_json AS consentJson FROM customer_profiles WHERE id=?`,
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return { ...row, blocked: Boolean(row.blocked), benefits: parseStoredJson<Record<string, unknown>[]>(row.benefitsJson, []), consent: parseStoredJson(row.consentJson, {}) };
}

/** getProfile() plus the caller's own masked license list — what every customer-facing endpoint should actually return, so the client never has to guess which shape it got. */
export async function getProfileWithLicenses(id: string) {
  const profile = await getProfile(id);
  if (!profile) return null;
  return { ...profile, licenses: await listLicensesForOwner(database(), id) };
}
