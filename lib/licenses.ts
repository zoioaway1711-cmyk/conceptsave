import { ANY_SERIAL_PATTERN, displaySuffixOf, generateSerial, normalizeSerial, serialDigest } from "./serial";
import { getMaterial } from "./materials";

export type LicenseRow = {
  id: number;
  materialId: number;
  displayPrefix: string;
  displaySuffix: string;
  lot: string;
  status: "active" | "revoked";
  ownerProfileId: string | null;
  expiresAt: string | null;
  createdAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
};

export type EffectiveStatus = "active" | "expired" | "revoked";

export function effectiveStatus(license: Pick<LicenseRow, "status" | "expiresAt">, now = new Date()): EffectiveStatus {
  if (license.status === "revoked") return "revoked";
  if (license.expiresAt && new Date(license.expiresAt).getTime() < now.getTime()) return "expired";
  return "active";
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

const LICENSE_COLUMNS = "id, material_id AS materialId, display_prefix AS displayPrefix, display_suffix AS displaySuffix, lot, status, owner_profile_id AS ownerProfileId, expires_at AS expiresAt, created_at AS createdAt, activated_at AS activatedAt, revoked_at AS revokedAt";

/**
 * CSPRNG → digest → DB transaction → UNIQUE constraint → retry. Never
 * trusts a SELECT-then-INSERT for uniqueness (a TOCTOU race under
 * concurrent generation) — relies on the `idx_licenses_digest` UNIQUE
 * index and retries with a fresh random value on collision, which at this
 * format's 80 bits of entropy will in practice never actually happen.
 * Returns the plaintext serial exactly once — callers must not persist it
 * anywhere; only `displayPrefix`/`displaySuffix` survive after this call.
 */
export async function createLicense(db: D1Database, materialId: number, opts: { lot?: string; expiresAt?: string | null } = {}, maxAttempts = 5): Promise<{ id: number; serial: string }> {
  const material = await getMaterial(db, materialId);
  if (!material) throw new Error("material_not_found");
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const serial = generateSerial(material.prefixCode);
    const digest = await serialDigest(serial);
    try {
      const row = await db.prepare(
        "INSERT INTO licenses (material_id, serial_digest, display_prefix, display_suffix, lot, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?) RETURNING id",
      ).bind(materialId, digest, material.prefixCode, displaySuffixOf(serial), opts.lot ?? "", opts.expiresAt ?? null, now).first<{ id: number }>();
      return { id: row!.id, serial };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue; // digest collision — regenerate and retry
      throw error;
    }
  }
  throw new Error("license_generation_failed");
}

/** Format-checks and hashes raw user input, then looks up the license row. Never reveals whether the format was wrong vs. the digest didn't match — both are just "not found" to the caller. */
export async function findLicenseByInput(db: D1Database, rawSerial: string): Promise<LicenseRow | null> {
  const normalized = normalizeSerial(rawSerial);
  if (!ANY_SERIAL_PATTERN.test(normalized)) return null;
  const digest = await serialDigest(normalized);
  const row = await db.prepare(`SELECT ${LICENSE_COLUMNS} FROM licenses WHERE serial_digest=?`).bind(digest).first<LicenseRow>();
  return row ?? null;
}

export async function getLicense(db: D1Database, id: number): Promise<LicenseRow | null> {
  return (await db.prepare(`SELECT ${LICENSE_COLUMNS} FROM licenses WHERE id=?`).bind(id).first<LicenseRow>()) ?? null;
}

/**
 * Atomically claims an unclaimed, active license for `profileId`. Guarded
 * entirely in the UPDATE's WHERE clause (never a separate
 * check-then-write), so two simultaneous claim attempts on the same
 * license can't both succeed — D1 serializes writes, so whichever UPDATE
 * commits first wins and the second sees changes=0.
 */
export async function claimLicense(db: D1Database, licenseId: number, profileId: string, now = new Date().toISOString()): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE licenses SET owner_profile_id=?, activated_at=? WHERE id=? AND owner_profile_id IS NULL AND status='active' AND (expires_at IS NULL OR expires_at > ?)",
  ).bind(profileId, now, licenseId, now).run();
  return result.meta.changes > 0;
}

export async function revokeLicense(db: D1Database, licenseId: number, now = new Date().toISOString()): Promise<boolean> {
  const result = await db.prepare("UPDATE licenses SET status='revoked', revoked_at=? WHERE id=? AND status='active'").bind(now, licenseId).run();
  return result.meta.changes > 0;
}

/** REVOKE + GENERATE REPLACEMENT: never re-reveals the lost serial (it was never stored), issues a brand new one for the same material and, if the lost license had an owner, transfers entitlement to the new one immediately. */
export async function replaceLicense(db: D1Database, licenseId: number): Promise<{ id: number; serial: string } | null> {
  const existing = await getLicense(db, licenseId);
  if (!existing) return null;
  const revoked = await revokeLicense(db, licenseId);
  if (!revoked) return null;
  const created = await createLicense(db, existing.materialId, { lot: existing.lot, expiresAt: existing.expiresAt });
  if (existing.ownerProfileId) {
    await db.prepare("UPDATE licenses SET owner_profile_id=?, activated_at=? WHERE id=?").bind(existing.ownerProfileId, new Date().toISOString(), created.id).run();
  }
  return created;
}

/**
 * Recomputes points/level/levelName from a live COUNT of active licenses —
 * shared by both the login flow (which can itself be a first activation)
 * and the verification flow, so gamification state never depends on which
 * of those two endpoints happened to process a given claim.
 */
export async function recalculatePoints(db: D1Database, profileId: string, now = new Date().toISOString()) {
  await db.batch([
    db.prepare(
      `UPDATE customer_profiles SET points=MAX((SELECT COUNT(*)*100 FROM licenses WHERE owner_profile_id=? AND status='active' AND (expires_at IS NULL OR expires_at > ?)), CASE rank_override WHEN 2 THEN 1000 WHEN 3 THEN 2000 WHEN 4 THEN 3000 WHEN 5 THEN 5000 ELSE 0 END), last_active=? WHERE id=? AND blocked=0`,
    ).bind(profileId, now, now, profileId),
    db.prepare(`UPDATE customer_profiles SET level=CASE WHEN rank_override>0 THEN rank_override WHEN points>=5000 THEN 5 WHEN points>=3000 THEN 4 WHEN points>=2000 THEN 3 WHEN points>=1000 THEN 2 ELSE 1 END WHERE id=? AND blocked=0`).bind(profileId),
    db.prepare(`UPDATE customer_profiles SET level_name=CASE level WHEN 5 THEN 'Diamante' WHEN 4 THEN 'Platina' WHEN 3 THEN 'Ouro' WHEN 2 THEN 'Prata' ELSE 'Essencial' END WHERE id=? AND blocked=0`).bind(profileId),
  ]);
}

export async function countActiveLicensesForOwner(db: D1Database, profileId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM licenses WHERE owner_profile_id=? AND status='active' AND (expires_at IS NULL OR expires_at > ?)").bind(profileId, new Date().toISOString()).first<{ count: number }>();
  return row?.count ?? 0;
}

export type MaskedLicense = { id: number; material: { id: number; name: string; slug: string }; serial: string; lot: string; status: EffectiveStatus; ownerProfileId: string | null; expiresAt: string | null; createdAt: string; activatedAt: string | null };

/** Listings NEVER return a full serial — only the masked display form. */
export async function listLicensesForMaterial(db: D1Database, materialId: number, limit = 200): Promise<MaskedLicense[]> {
  const { results } = await db.prepare(
    `SELECT l.id, l.display_prefix AS displayPrefix, l.display_suffix AS displaySuffix, l.lot, l.status, l.owner_profile_id AS ownerProfileId, l.expires_at AS expiresAt, l.created_at AS createdAt, l.activated_at AS activatedAt, m.id AS materialId, m.name AS materialName, m.slug AS materialSlug
     FROM licenses l JOIN materials m ON m.id = l.material_id WHERE l.material_id=? ORDER BY l.created_at DESC LIMIT ?`,
  ).bind(materialId, limit).all<{ id: number; displayPrefix: string; displaySuffix: string; lot: string; status: "active" | "revoked"; ownerProfileId: string | null; expiresAt: string | null; createdAt: string; activatedAt: string | null; materialId: number; materialName: string; materialSlug: string }>();
  return results.map((row) => ({
    id: row.id,
    material: { id: row.materialId, name: row.materialName, slug: row.materialSlug },
    serial: `${row.displayPrefix}-••••-••••-••••-${row.displaySuffix}`,
    lot: row.lot,
    status: effectiveStatus(row),
    ownerProfileId: row.ownerProfileId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
  }));
}

export async function listLicensesForOwner(db: D1Database, profileId: string): Promise<MaskedLicense[]> {
  const { results } = await db.prepare(
    `SELECT l.id, l.display_prefix AS displayPrefix, l.display_suffix AS displaySuffix, l.lot, l.status, l.owner_profile_id AS ownerProfileId, l.expires_at AS expiresAt, l.created_at AS createdAt, l.activated_at AS activatedAt, m.id AS materialId, m.name AS materialName, m.slug AS materialSlug
     FROM licenses l JOIN materials m ON m.id = l.material_id WHERE l.owner_profile_id=? ORDER BY l.activated_at DESC`,
  ).bind(profileId).all<{ id: number; displayPrefix: string; displaySuffix: string; lot: string; status: "active" | "revoked"; ownerProfileId: string | null; expiresAt: string | null; createdAt: string; activatedAt: string | null; materialId: number; materialName: string; materialSlug: string }>();
  return results.map((row) => ({
    id: row.id,
    material: { id: row.materialId, name: row.materialName, slug: row.materialSlug },
    serial: `${row.displayPrefix}-••••-••••-••••-${row.displaySuffix}`,
    lot: row.lot,
    status: effectiveStatus(row),
    ownerProfileId: row.ownerProfileId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
  }));
}
