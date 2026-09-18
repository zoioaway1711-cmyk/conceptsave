import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { seedLicense, seedMaterial } from "./helpers/seed";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { claimLicense } = await import("../lib/licenses");

let db: ReturnType<typeof createFakeD1>;
let materialId: number;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  materialId = seedMaterial(db, { prefixCode: "MATX", name: "Test Material" });
});

describe("claimLicense — concurrent activation (double-credit / race protection)", () => {
  it("only the first of two simultaneous claims on the same license succeeds", async () => {
    const licenseId = await seedLicense(db, materialId, { serial: "MATX-AAAA-BBBB-CCCC-DDDD" });
    const [first, second] = await Promise.all([
      claimLicense(db as never, licenseId, "cus_alice"),
      claimLicense(db as never, licenseId, "cus_bob"),
    ]);
    // D1 serializes writes — real concurrency doesn't exist at the SQL
    // layer, but the guard (owner_profile_id IS NULL in the WHERE clause)
    // must still ensure exactly one caller sees changes > 0.
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const row = db.raw.prepare("SELECT owner_profile_id AS ownerProfileId FROM licenses WHERE id=?").get(licenseId) as { ownerProfileId: string };
    expect(["cus_alice", "cus_bob"]).toContain(row.ownerProfileId);
  });

  it("claiming a genuinely fresh unclaimed license succeeds (the guard isn't just always-false)", async () => {
    const licenseId = await seedLicense(db, materialId, { serial: "MATX-1111-2222-3333-4444" });
    expect(await claimLicense(db as never, licenseId, "cus_alice")).toBe(true);
  });

  it("never lets a second profile claim an already-owned license", async () => {
    const licenseId = await seedLicense(db, materialId, { serial: "MATX-5555-6666-7777-8888", ownerProfileId: "cus_alice" });
    expect(await claimLicense(db as never, licenseId, "cus_bob")).toBe(false);
    const row = db.raw.prepare("SELECT owner_profile_id AS ownerProfileId FROM licenses WHERE id=?").get(licenseId) as { ownerProfileId: string };
    expect(row.ownerProfileId).toBe("cus_alice");
  });

  it("never claims a revoked license, even if unowned", async () => {
    const licenseId = await seedLicense(db, materialId, { serial: "MATX-9999-0000-1234-5678", status: "revoked" });
    expect(await claimLicense(db as never, licenseId, "cus_alice")).toBe(false);
  });

  it("never claims an expired license", async () => {
    const licenseId = await seedLicense(db, materialId, { serial: "MATX-2222-3333-4444-5555", expiresAt: "2020-01-01T00:00:00.000Z" });
    expect(await claimLicense(db as never, licenseId, "cus_alice")).toBe(false);
  });
});
