import { logAudit, maskSerial } from "./audit-log";
import { parseStoredJson } from "./api-validation";

export type ProfileMergeSummary = {
  survivorId: string;
  loserId: string;
  points: number;
  level: number;
  levelName: string;
};

const LEVEL_NAME_BY_LEVEL: Record<number, string> = { 1: "Essencial", 2: "Prata", 3: "Ouro", 4: "Platina", 5: "Diamante" };

/**
 * Combines two customer profiles that turned out to be the same real
 * person (see the "same device also seen on N other profiles" signal in
 * the User Inspector) into one. `survivorId` keeps its id and absorbs
 * everything from `loserId` — the admin picks which is which (see
 * db/schema.ts's mergedInto comment for why this can't be fully
 * automatic: the choice of survivor decides which id every future
 * request from either device resolves to).
 *
 * Never deletes the loser row — every customer-facing route resolves a
 * cookie's id through `customer_profiles.merged_into`
 * (resolveMergedProfileId in lib/customer-profile.ts) before using it, so
 * a device that only ever holds the loser's session cookie keeps working
 * transparently after this runs. Reassigns (not copies) the loser's
 * licenses, notes, change-history rows and live_events to the survivor,
 * so the survivor's own history reads as one continuous timeline instead
 * of half the story living under a now-orphaned id.
 */
export async function mergeProfiles(db: D1Database, params: { survivorId: string; loserId: string; adminId: string; adminUsername: string; ip: string }): Promise<ProfileMergeSummary | { error: string }> {
  const { survivorId, loserId, adminId, adminUsername, ip } = params;
  if (survivorId === loserId) return { error: "same_profile" };

  const [survivor, loser] = await Promise.all([
    db.prepare("SELECT id, points, level, rank_override AS rankOverride, blocked, benefits_json AS benefitsJson, merged_into AS mergedInto FROM customer_profiles WHERE id=?").bind(survivorId).first<{ id: string; points: number; level: number; rankOverride: number; blocked: number; benefitsJson: string; mergedInto: string | null }>(),
    db.prepare("SELECT id, points, level, rank_override AS rankOverride, blocked, benefits_json AS benefitsJson, merged_into AS mergedInto FROM customer_profiles WHERE id=?").bind(loserId).first<{ id: string; points: number; level: number; rankOverride: number; blocked: number; benefitsJson: string; mergedInto: string | null }>(),
  ]);
  if (!survivor) return { error: "survivor_not_found" };
  if (!loser) return { error: "loser_not_found" };
  // Merging a profile that's already been merged away (in either
  // direction) would either silently orphan a previous merge's target or
  // build a multi-hop alias chain resolveMergedProfileId only tolerates
  // as a defensive backstop, not by design — reject both outright and let
  // the admin merge into/from the actual current survivor instead.
  if (survivor.mergedInto) return { error: "survivor_already_merged" };
  if (loser.mergedInto) return { error: "loser_already_merged" };

  const points = survivor.points + loser.points;
  const level = Math.max(survivor.level, loser.level, 1);
  const rankOverride = Math.max(survivor.rankOverride, loser.rankOverride);
  // Either side being blocked (e.g. for fraud) carries over — merging
  // must never be a way to launder a blocked account back to active by
  // pairing it with a clean one.
  const blocked = Boolean(survivor.blocked) || Boolean(loser.blocked);
  const levelName = LEVEL_NAME_BY_LEVEL[level] ?? "Essencial";
  const survivorBenefits = parseStoredJson<unknown[]>(survivor.benefitsJson, []);
  const loserBenefits = parseStoredJson<unknown[]>(loser.benefitsJson, []);
  const mergedBenefitsJson = JSON.stringify([...survivorBenefits, ...loserBenefits]);
  const now = new Date().toISOString();

  await db.batch([
    db.prepare("UPDATE customer_profiles SET points=?, level=?, level_name=?, rank_override=?, blocked=?, benefits_json=?, last_active=? WHERE id=?")
      .bind(points, level, levelName, rankOverride, blocked ? 1 : 0, mergedBenefitsJson, now, survivorId),
    db.prepare("UPDATE customer_profiles SET merged_into=?, merged_at=? WHERE id=?").bind(survivorId, now, loserId),
    db.prepare("UPDATE licenses SET owner_profile_id=? WHERE owner_profile_id=?").bind(survivorId, loserId),
    db.prepare("UPDATE admin_notes SET profile_id=? WHERE profile_id=?").bind(survivorId, loserId),
    db.prepare("UPDATE admin_profile_changes SET profile_id=? WHERE profile_id=?").bind(survivorId, loserId),
    db.prepare("UPDATE live_events SET actor_profile_id=? WHERE actor_profile_id=?").bind(survivorId, loserId),
    db.prepare("INSERT INTO admin_profile_changes (profile_id, admin_id, admin_username, changes_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(survivorId, adminId, adminUsername, JSON.stringify({ merge: { from: loserId, to: survivorId }, points: { from: survivor.points, to: points } }), now),
  ]);

  await logAudit(db, { actor: adminUsername, action: "PROFILE_MERGED", resource: "customer_profiles", resourceId: maskSerial(survivorId), result: "success", ip, metadata: { loserId: maskSerial(loserId), points, level } });

  return { survivorId, loserId, points, level, levelName };
}
