import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { seedLicense, seedMaterial } from "./helpers/seed";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { createLicense, findLicenseByInput, effectiveStatus, revokeLicense, replaceLicense, claimLicense, importLicense, updateLicense } = await import("../lib/licenses");
const { serialDigest, ANY_SERIAL_PATTERN } = await import("../lib/serial");

let db: ReturnType<typeof createFakeD1>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
});

describe("createLicense", () => {
  it("generates a well-formed serial with the material's prefix and never persists the plaintext", async () => {
    const materialId = seedMaterial(db, { prefixCode: "CURA", name: "Curso A" });
    const { id, serial } = await createLicense(db as never, materialId);
    expect(serial.startsWith("CURA-")).toBe(true);
    expect(ANY_SERIAL_PATTERN.test(serial)).toBe(true);
    const row = db.raw.prepare("SELECT serial_digest AS digest, display_prefix AS displayPrefix, display_suffix AS displaySuffix FROM licenses WHERE id=?").get(id) as { digest: string; displayPrefix: string; displaySuffix: string };
    expect(row.digest).toBe(await serialDigest(serial));
    expect(row.displayPrefix).toBe("CURA");
    expect(serial.endsWith(row.displaySuffix)).toBe(true);
    // The plaintext itself never appears anywhere in the stored row.
    const allColumns = JSON.stringify(row);
    expect(allColumns).not.toContain(serial);
  });

  it("retries on a digest collision instead of failing outright", async () => {
    const materialId = seedMaterial(db, { prefixCode: "COLL", name: "Collision Material" });
    const randomValues = vi.spyOn(crypto, "getRandomValues");
    let call = 0;
    randomValues.mockImplementation((arr: unknown) => {
      call += 1;
      const bytes = arr as Uint8Array;
      // First 4 calls (one license's worth of segments) always produce the
      // exact same bytes, so the second createLicense() call collides on
      // its first attempt and must retry with different bytes afterwards.
      bytes.fill(call <= 4 ? 1 : call);
      return arr as never;
    });
    try {
      const first = await createLicense(db as never, materialId);
      const second = await createLicense(db as never, materialId);
      expect(second.serial).not.toBe(first.serial);
      const row = db.raw.prepare("SELECT COUNT(*) AS n FROM licenses").get() as { n: number };
      expect(row.n).toBe(2);
    } finally {
      randomValues.mockRestore();
    }
  });

  it("rejects generation for a material that doesn't exist", async () => {
    await expect(createLicense(db as never, 999999)).rejects.toThrow();
  });
});

describe("findLicenseByInput", () => {
  it("resolves a valid license and reports the right material", async () => {
    const materialId = seedMaterial(db, { prefixCode: "LOOK", name: "Lookup Material" });
    const licenseId = await seedLicense(db, materialId, { serial: "LOOK-AAAA-BBBB-CCCC-DDDD" });
    const found = await findLicenseByInput(db as never, "LOOK-AAAA-BBBB-CCCC-DDDD");
    expect(found?.id).toBe(licenseId);
    expect(found?.materialId).toBe(materialId);
  });

  it("is case-insensitive and trims whitespace", async () => {
    const materialId = seedMaterial(db, { prefixCode: "LOOK", name: "Lookup Material" });
    await seedLicense(db, materialId, { serial: "LOOK-AAAA-BBBB-CCCC-DDDD" });
    const found = await findLicenseByInput(db as never, "  look-aaaa-bbbb-cccc-dddd  ");
    expect(found).not.toBeNull();
  });

  it("returns null for a malformed serial without ever hitting the database", async () => {
    const spy = vi.spyOn(db, "prepare");
    expect(await findLicenseByInput(db as never, "not-a-real-serial")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns null for a well-formed but unknown serial", async () => {
    expect(await findLicenseByInput(db as never, "ZZZZ-AAAA-BBBB-CCCC-DDDD")).toBeNull();
  });

  it("a license minted for material A can never resolve/activate as material B, even with B's prefix spliced on", async () => {
    const materialA = seedMaterial(db, { prefixCode: "MATA", name: "Material A" });
    seedMaterial(db, { prefixCode: "MATB", name: "Material B" });
    await seedLicense(db, materialA, { serial: "MATA-QQQQ-WWWW-EEEE-RRRR" });
    // Same random segments, but claiming to be material B's prefix — the
    // digest is over the WHOLE string, so this must not resolve to A's
    // license (or anything at all): authorization never comes from the
    // prefix text, only from the digest match found in `licenses`.
    const spoofed = await findLicenseByInput(db as never, "MATB-QQQQ-WWWW-EEEE-RRRR");
    expect(spoofed).toBeNull();
  });
});

describe("importLicense", () => {
  it("stores a caller-supplied serial (not generated) under its own prefix/suffix, and it resolves via the normal lookup", async () => {
    const materialId = seedMaterial(db, { prefixCode: "IMPX", name: "Imported Material" });
    // Deliberately includes I/L/O/U — outside the ALPHABET used by
    // generateSerial() — to prove the import path accepts a full A-Z0-9
    // serial minted by an external source, not just this system's own
    // ambiguity-avoiding subset.
    const external = "SAVEC-WILO-UILO-AAAA-BBBB";
    const { id, serial } = await importLicense(db as never, materialId, external, { lot: "LOT-1" });
    expect(serial).toBe(external);
    const row = db.raw.prepare("SELECT display_prefix AS displayPrefix, display_suffix AS displaySuffix, lot FROM licenses WHERE id=?").get(id) as { displayPrefix: string; displaySuffix: string; lot: string };
    expect(row.displayPrefix).toBe("SAVEC");
    expect(row.displaySuffix).toBe("BBBB");
    expect(row.lot).toBe("LOT-1");
    const found = await findLicenseByInput(db as never, external);
    expect(found?.id).toBe(id);
  });

  it("rejects a malformed serial without writing anything", async () => {
    const materialId = seedMaterial(db, { prefixCode: "IMPX", name: "Imported Material" });
    await expect(importLicense(db as never, materialId, "not-a-serial")).rejects.toThrow("invalid_serial_format");
    const row = db.raw.prepare("SELECT COUNT(*) AS n FROM licenses").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("surfaces a duplicate serial as duplicate_serial instead of silently regenerating it", async () => {
    const materialId = seedMaterial(db, { prefixCode: "IMPX", name: "Imported Material" });
    const serial = "IMPX-AAAA-BBBB-CCCC-DDDD";
    await importLicense(db as never, materialId, serial);
    await expect(importLicense(db as never, materialId, serial)).rejects.toThrow("duplicate_serial");
    const row = db.raw.prepare("SELECT COUNT(*) AS n FROM licenses").get() as { n: number };
    expect(row.n).toBe(1);
  });

  it("rejects import against a material that doesn't exist", async () => {
    await expect(importLicense(db as never, 999999, "ABCD-AAAA-BBBB-CCCC-DDDD")).rejects.toThrow("material_not_found");
  });
});

describe("updateLicense", () => {
  it("updates lot and expiry without touching the serial or status", async () => {
    const materialId = seedMaterial(db, { prefixCode: "EDIT", name: "Editable Material" });
    const licenseId = await seedLicense(db, materialId, { serial: "EDIT-AAAA-BBBB-CCCC-DDDD" });
    expect(await updateLicense(db as never, licenseId, { lot: "NEW-LOT", expiresAt: "2030-01-01T00:00:00.000Z" })).toBe(true);
    const row = db.raw.prepare("SELECT lot, expires_at AS expiresAt, serial_digest AS digest FROM licenses WHERE id=?").get(licenseId) as { lot: string; expiresAt: string; digest: string };
    expect(row.lot).toBe("NEW-LOT");
    expect(row.expiresAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("returns false for a license id that doesn't exist", async () => {
    expect(await updateLicense(db as never, 999999, { lot: "X" })).toBe(false);
  });
});

describe("effectiveStatus", () => {
  it("is 'active' for a non-expired active license", () => {
    expect(effectiveStatus({ status: "active", expiresAt: null })).toBe("active");
  });
  it("is 'expired' once past expiresAt even if status is still 'active'", () => {
    expect(effectiveStatus({ status: "active", expiresAt: "2020-01-01T00:00:00.000Z" })).toBe("expired");
  });
  it("is 'revoked' regardless of expiresAt", () => {
    expect(effectiveStatus({ status: "revoked", expiresAt: "2999-01-01T00:00:00.000Z" })).toBe("revoked");
  });
});

describe("revokeLicense / replaceLicense", () => {
  it("revoke is a one-way transition — revoking twice the second time is a no-op (changes=0)", async () => {
    const materialId = seedMaterial(db, { prefixCode: "REVK", name: "Revoke Material" });
    const licenseId = await seedLicense(db, materialId, { serial: "REVK-AAAA-BBBB-CCCC-DDDD" });
    expect(await revokeLicense(db as never, licenseId)).toBe(true);
    expect(await revokeLicense(db as never, licenseId)).toBe(false);
  });

  it("replace revokes the old license and transfers ownership to a brand new one for the same material", async () => {
    const materialId = seedMaterial(db, { prefixCode: "REPL", name: "Replace Material" });
    const licenseId = await seedLicense(db, materialId, { serial: "REPL-AAAA-BBBB-CCCC-DDDD", ownerProfileId: "cus_owner" });
    const replacement = await replaceLicense(db as never, licenseId);
    expect(replacement).not.toBeNull();
    expect(replacement!.serial.startsWith("REPL-")).toBe(true);

    const old = db.raw.prepare("SELECT status FROM licenses WHERE id=?").get(licenseId) as { status: string };
    expect(old.status).toBe("revoked");
    const fresh = await findLicenseByInput(db as never, replacement!.serial);
    expect(fresh?.ownerProfileId).toBe("cus_owner");
    expect(fresh?.status).toBe("active");

    // The old serial is truly dead — it was never re-usable, and claiming
    // it again must fail rather than silently reactivating it.
    expect(await findLicenseByInput(db as never, "REPL-AAAA-BBBB-CCCC-DDDD")).toMatchObject({ status: "revoked" });
    expect(await claimLicense(db as never, licenseId, "cus_attacker")).toBe(false);
  });

  it("replacing an unclaimed license just issues a fresh unclaimed one (no owner to transfer)", async () => {
    const materialId = seedMaterial(db, { prefixCode: "FREE", name: "Free Material" });
    const licenseId = await seedLicense(db, materialId, { serial: "FREE-AAAA-BBBB-CCCC-DDDD" });
    const replacement = await replaceLicense(db as never, licenseId);
    const fresh = await findLicenseByInput(db as never, replacement!.serial);
    expect(fresh?.ownerProfileId).toBeNull();
  });
});
