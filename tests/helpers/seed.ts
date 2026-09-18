import type { FakeD1 } from "./fake-d1";
// Dynamically imported inside seedLicense() rather than statically here:
// a static import would load lib/serial.ts (which imports
// "cloudflare:workers") before a calling test file's `vi.mock(...)` factory
// variable has finished initializing, tripping a temporal-dead-zone error.

/** Upserts a product row — the migrations seed ~200 real legacy serials, so tests must not assume a digit-serial is free. */
export function upsertProduct(db: FakeD1, serial: string, status: "authentic" | "invalid") {
  db.raw.prepare(
    "INSERT INTO products (serial, name, maker, lot, expiry, status) VALUES (?, 'Test product', 'Test maker', 'LOT-TEST', '12/2027', ?) ON CONFLICT(serial) DO UPDATE SET status=excluded.status",
  ).run(serial, status);
}

/** Upserts a bare customer profile row, resetting it to a known-clean state. */
export function upsertProfile(db: FakeD1, id: string, now = "2026-01-01T00:00:00.000Z") {
  db.raw.prepare(
    "INSERT INTO customer_profiles (id, first_seen, last_active) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET blocked=0",
  ).run(id, now, now);
}

export function seedMaterial(db: FakeD1, opts: { slug?: string; prefixCode: string; name: string }, now = "2026-01-01T00:00:00.000Z"): number {
  const slug = opts.slug ?? opts.prefixCode.toLowerCase();
  const info = db.raw.prepare(
    "INSERT INTO materials (slug, prefix_code, name, created_at) VALUES (?, ?, ?, ?)",
  ).run(slug, opts.prefixCode, opts.name, now);
  return Number(info.lastInsertRowid);
}

/** Mints a real (digest-backed) license row directly, bypassing lib/licenses.ts's CSPRNG generator — the tests choose the plaintext serial explicitly so assertions can reference it. */
export async function seedLicense(db: FakeD1, materialId: number, opts: { serial: string; status?: "active" | "revoked"; ownerProfileId?: string | null; expiresAt?: string | null; activatedAt?: string | null }, now = "2026-01-01T00:00:00.000Z"): Promise<number> {
  const { serialDigest, displaySuffixOf } = await import("../../lib/serial");
  const digest = await serialDigest(opts.serial);
  const [prefix] = opts.serial.split("-");
  const info = db.raw.prepare(
    "INSERT INTO licenses (material_id, serial_digest, display_prefix, display_suffix, status, owner_profile_id, expires_at, created_at, activated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(materialId, digest, prefix, displaySuffixOf(opts.serial), opts.status ?? "active", opts.ownerProfileId ?? null, opts.expiresAt ?? null, now, opts.activatedAt ?? null);
  return Number(info.lastInsertRowid);
}
