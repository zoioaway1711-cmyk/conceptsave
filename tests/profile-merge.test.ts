import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { upsertProfile, seedMaterial, seedLicense } from "./helpers/seed";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { mergeProfiles } = await import("../lib/profile-merge");
const { resolveMergedProfileId } = await import("../lib/customer-profile");

let db: ReturnType<typeof createFakeD1>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
});

function setProfileFields(id: string, fields: Partial<{ points: number; level: number; rankOverride: number; blocked: number; benefitsJson: string }>) {
  const sets = Object.entries(fields).map(([key]) => `${key === "rankOverride" ? "rank_override" : key === "benefitsJson" ? "benefits_json" : key}=?`).join(", ");
  db.raw.prepare(`UPDATE customer_profiles SET ${sets} WHERE id=?`).run(...Object.values(fields), id);
}

describe("mergeProfiles", () => {
  it("sums points, keeps the higher level, and marks the loser as merged into the survivor", async () => {
    upsertProfile(db, "cus_survivor");
    upsertProfile(db, "cus_loser");
    setProfileFields("cus_survivor", { points: 300, level: 2 });
    setProfileFields("cus_loser", { points: 150, level: 3 });

    const result = await mergeProfiles(db as never, { survivorId: "cus_survivor", loserId: "cus_loser", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });
    expect(result).not.toHaveProperty("error");
    if ("error" in result) throw new Error("unreachable");
    expect(result.points).toBe(450);
    expect(result.level).toBe(3);
    expect(result.levelName).toBe("Ouro");

    const loser = db.raw.prepare("SELECT merged_into AS mergedInto FROM customer_profiles WHERE id=?").get("cus_loser") as { mergedInto: string };
    expect(loser.mergedInto).toBe("cus_survivor");
  });

  it("carries a blocked flag over from either side — merging can't launder a blocked account clean", async () => {
    upsertProfile(db, "cus_clean");
    upsertProfile(db, "cus_flagged");
    setProfileFields("cus_flagged", { blocked: 1 });

    await mergeProfiles(db as never, { survivorId: "cus_clean", loserId: "cus_flagged", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });
    const survivor = db.raw.prepare("SELECT blocked FROM customer_profiles WHERE id=?").get("cus_clean") as { blocked: number };
    expect(Boolean(survivor.blocked)).toBe(true);
  });

  it("reassigns the loser's licenses, notes and change history to the survivor", async () => {
    upsertProfile(db, "cus_survivor");
    upsertProfile(db, "cus_loser");
    const materialId = seedMaterial(db, { prefixCode: "MERG", name: "Merge Material" });
    await seedLicense(db, materialId, { serial: "MERG-AAAA-BBBB-CCCC-DDDD", ownerProfileId: "cus_loser" });
    db.raw.prepare("INSERT INTO admin_notes (profile_id, admin_id, admin_username, body, created_at) VALUES (?, 'adm_1', 'owner', 'note', '2026-01-01T00:00:00.000Z')").run("cus_loser");
    db.raw.prepare("INSERT INTO admin_profile_changes (profile_id, admin_id, admin_username, changes_json, created_at) VALUES (?, 'adm_1', 'owner', '{}', '2026-01-01T00:00:00.000Z')").run("cus_loser");
    db.raw.prepare("INSERT INTO live_events (type, severity, actor_profile_id, ip, country, region, city, device, device_fingerprint, reason, metadata_json, created_at) VALUES ('USER_LOGIN', 'info', ?, '', '', '', '', '', '', '', '{}', '2026-01-01T00:00:00.000Z')").run("cus_loser");

    await mergeProfiles(db as never, { survivorId: "cus_survivor", loserId: "cus_loser", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });

    expect((db.raw.prepare("SELECT owner_profile_id AS o FROM licenses WHERE display_prefix='MERG'").get() as { o: string }).o).toBe("cus_survivor");
    expect((db.raw.prepare("SELECT COUNT(*) AS c FROM admin_notes WHERE profile_id=?").get("cus_survivor") as { c: number }).c).toBe(1);
    expect((db.raw.prepare("SELECT COUNT(*) AS c FROM live_events WHERE actor_profile_id=?").get("cus_survivor") as { c: number }).c).toBeGreaterThanOrEqual(1);
    // The pre-existing describe's own merge-record write plus the seeded row — both now under the survivor.
    expect((db.raw.prepare("SELECT COUNT(*) AS c FROM admin_profile_changes WHERE profile_id=?").get("cus_survivor") as { c: number }).c).toBe(2);
  });

  it("refuses to merge a profile into itself", async () => {
    upsertProfile(db, "cus_a");
    const result = await mergeProfiles(db as never, { survivorId: "cus_a", loserId: "cus_a", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });
    expect(result).toMatchObject({ error: "same_profile" });
  });

  it("refuses to merge an already-merged-away profile again (no multi-hop chains by design)", async () => {
    upsertProfile(db, "cus_a");
    upsertProfile(db, "cus_b");
    upsertProfile(db, "cus_c");
    await mergeProfiles(db as never, { survivorId: "cus_a", loserId: "cus_b", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });
    const second = await mergeProfiles(db as never, { survivorId: "cus_c", loserId: "cus_b", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });
    expect(second).toMatchObject({ error: "loser_already_merged" });
  });

  it("404s cleanly for a nonexistent profile id on either side", async () => {
    upsertProfile(db, "cus_real");
    expect(await mergeProfiles(db as never, { survivorId: "cus_real", loserId: "cus_ghost", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" })).toMatchObject({ error: "loser_not_found" });
    expect(await mergeProfiles(db as never, { survivorId: "cus_ghost", loserId: "cus_real", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" })).toMatchObject({ error: "survivor_not_found" });
  });
});

describe("resolveMergedProfileId", () => {
  it("returns the id unchanged when it was never merged", async () => {
    upsertProfile(db, "cus_standalone");
    expect(await resolveMergedProfileId("cus_standalone")).toBe("cus_standalone");
  });

  it("follows merged_into to the survivor — this is what keeps an old device's cookie working after a merge", async () => {
    upsertProfile(db, "cus_survivor");
    upsertProfile(db, "cus_loser");
    await mergeProfiles(db as never, { survivorId: "cus_survivor", loserId: "cus_loser", adminId: "adm_1", adminUsername: "owner", ip: "127.0.0.1" });
    expect(await resolveMergedProfileId("cus_loser")).toBe("cus_survivor");
    expect(await resolveMergedProfileId("cus_survivor")).toBe("cus_survivor");
  });
});
