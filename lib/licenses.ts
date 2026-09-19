import { ANY_SERIAL_PATTERN, decryptSerial, displaySuffixOf, encryptSerial, generateSerial, normalizeSerial, serialDigest } from "./serial";
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
 * Returns the plaintext serial directly to the caller (shown once in the
 * UI) — callers must not persist it themselves. The DB only ever stores
 * the one-way digest, the display prefix/suffix, and a separate AES-GCM
 * ENCRYPTED copy (`serial_encrypted`) recoverable only via
 * `revealLicenseSerial()` below, gated behind admin auth.
 */
export async function createLicense(db: D1Database, materialId: number, opts: { lot?: string; expiresAt?: string | null } = {}, maxAttempts = 5): Promise<{ id: number; serial: string }> {
  const material = await getMaterial(db, materialId);
  if (!material) throw new Error("material_not_found");
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const serial = generateSerial(material.prefixCode);
    const digest = await serialDigest(serial);
    const encrypted = await encryptSerial(serial);
    try {
      const row = await db.prepare(
        "INSERT INTO licenses (material_id, serial_digest, serial_encrypted, display_prefix, display_suffix, lot, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING id",
      ).bind(materialId, digest, encrypted, material.prefixCode, displaySuffixOf(serial), opts.lot ?? "", opts.expiresAt ?? null, now).first<{ id: number }>();
      return { id: row!.id, serial };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue; // digest collision — regenerate and retry
      throw error;
    }
  }
  throw new Error("license_generation_failed");
}

/**
 * Imports one license for a PRE-EXISTING plaintext serial (e.g. from a
 * pre-printed batch on an external sheet) instead of generating a fresh
 * random one. Unlike `createLicense`, a digest collision here is NOT
 * silently retried with a new value — the caller supplied this exact
 * serial (already possibly printed on packaging) and swapping it for a
 * different one behind their back would desync the batch — so a collision
 * is surfaced as `"duplicate_serial"` instead. displayPrefix/displaySuffix
 * are taken from the SERIAL ITSELF (not the material's prefixCode, which
 * may not match an externally-sourced serial's own prefix).
 */
export async function importLicense(db: D1Database, materialId: number, rawSerial: string, opts: { lot?: string; expiresAt?: string | null } = {}): Promise<{ id: number; serial: string }> {
  const serial = normalizeSerial(rawSerial);
  if (!ANY_SERIAL_PATTERN.test(serial)) throw new Error("invalid_serial_format");
  const material = await getMaterial(db, materialId);
  if (!material) throw new Error("material_not_found");
  const digest = await serialDigest(serial);
  const encrypted = await encryptSerial(serial);
  const now = new Date().toISOString();
  try {
    const row = await db.prepare(
      "INSERT INTO licenses (material_id, serial_digest, serial_encrypted, display_prefix, display_suffix, lot, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING id",
    ).bind(materialId, digest, encrypted, serial.split("-")[0], displaySuffixOf(serial), opts.lot ?? "", opts.expiresAt ?? null, now).first<{ id: number }>();
    return { id: row!.id, serial };
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("duplicate_serial");
    throw error;
  }
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
 * Decrypts and returns a license's full serial for support cases (e.g.
 * resending the exact, already-printed serial a customer has). Deliberately
 * a separate, narrowly-scoped query — `serial_encrypted` is never selected
 * by `LICENSE_COLUMNS`/`LicenseRow`, so nothing else in the codebase can
 * accidentally pull it into a listing or log. Returns `null` for licenses
 * minted before this column existed (nothing to recover) as well as for a
 * missing id. Callers MUST audit-log every successful reveal — this
 * function only does the decryption, not the accountability trail.
 */
export async function revealLicenseSerial(db: D1Database, licenseId: number): Promise<string | null> {
  const row = await db.prepare("SELECT serial_encrypted AS serialEncrypted FROM licenses WHERE id=?").bind(licenseId).first<{ serialEncrypted: string | null }>();
  if (!row?.serialEncrypted) return null;
  return decryptSerial(row.serialEncrypted);
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

/** Edits the non-authorization metadata of a license (lot/expiry) — never the serial itself, which can only be reissued via `replaceLicense`. */
export async function updateLicense(db: D1Database, licenseId: number, patch: { lot?: string; expiresAt?: string | null }): Promise<boolean> {
  if (patch.lot === undefined && patch.expiresAt === undefined) return true;
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.lot !== undefined) { sets.push("lot=?"); values.push(patch.lot); }
  if (patch.expiresAt !== undefined) { sets.push("expires_at=?"); values.push(patch.expiresAt); }
  values.push(licenseId);
  const result = await db.prepare(`UPDATE licenses SET ${sets.join(", ")} WHERE id=?`).bind(...values).run();
  return result.meta.changes > 0;
}

export async function revokeLicense(db: D1Database, licenseId: number, now = new Date().toISOString()): Promise<boolean> {
  const result = await db.prepare("UPDATE licenses SET status='revoked', revoked_at=? WHERE id=? AND status='active'").bind(now, licenseId).run();
  return result.meta.changes > 0;
}

/** REVOKE + GENERATE REPLACEMENT: issues a brand new serial for the same material and, if the lost license had an owner, transfers entitlement to the new one immediately. Doesn't itself reveal the revoked license's old serial — call `revealLicenseSerial(db, licenseId)` separately if that's what's actually needed (e.g. the customer's product still has the old code printed on it). */
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
