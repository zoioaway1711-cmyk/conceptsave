import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { upsertProfile } from "./helpers/seed";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { createAdminCookie } = await import("../lib/admin-auth");
const { POST } = await import("../app/api/admin/profiles/route");

let db: ReturnType<typeof createFakeD1>;
let adminId: string;

beforeEach(async () => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  upsertProfile(db, "cus_35172");
  adminId = `adm_${crypto.randomUUID()}`;
  db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, 'owner', 'x', '[\"admin.profiles.manage\"]', '2026-01-01T00:00:00.000Z')").run(adminId);
});

async function postAsAdmin(body: unknown) {
  const cookie = await createAdminCookie(adminId, { ip: "127.0.0.1", device: "test" });
  return POST(new Request("https://verificafarma.example/api/admin/profiles", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `vf_admin=${cookie}`, origin: "https://verificafarma.example" },
    body: JSON.stringify(body),
  }));
}

function auditActions() {
  return (db.raw.prepare("SELECT action FROM audit_logs ORDER BY id").all() as { action: string }[]).map((row) => row.action);
}

describe("POST /api/admin/profiles audit trail", () => {
  it("logs ADMIN_PROFILE_BLOCKED when blocking a profile", async () => {
    const response = await postAsAdmin({ id: "cus_35172", blocked: true });
    expect(response.status).toBe(200);
    expect(auditActions()).toContain("ADMIN_PROFILE_BLOCKED");
    expect(auditActions()).not.toContain("ADMIN_PROFILE_UNBLOCKED");
  });

  it("logs ADMIN_PROFILE_UNBLOCKED when unblocking a previously blocked profile", async () => {
    db.raw.prepare("UPDATE customer_profiles SET blocked=1 WHERE id=?").run("cus_35172");
    const response = await postAsAdmin({ id: "cus_35172", blocked: false });
    expect(response.status).toBe(200);
    expect(auditActions()).toContain("ADMIN_PROFILE_UNBLOCKED");
    expect(auditActions()).not.toContain("ADMIN_PROFILE_BLOCKED");
  });

  it("never fires block/unblock noise when blocked doesn't change", async () => {
    const response = await postAsAdmin({ id: "cus_35172", blocked: false, points: 50 });
    expect(response.status).toBe(200);
    expect(auditActions()).not.toContain("ADMIN_PROFILE_BLOCKED");
    expect(auditActions()).not.toContain("ADMIN_PROFILE_UNBLOCKED");
    expect(auditActions()).toContain("ADMIN_PROFILE_UPDATED");
  });

  it("logs nothing at all for a true no-op save (resubmitting identical values) — an unchanged profile isn't an audit event", async () => {
    // The freshly-seeded profile already has every field at the same
    // defaults adminProfileSchema would apply, so this body changes
    // nothing. Recording "ADMIN_PROFILE_UPDATED" here would be a log
    // entry that says something changed when nothing did — exactly the
    // noise a real "what changed" history (admin_profile_changes) needs
    // to not have.
    const response = await postAsAdmin({ id: "cus_35172", blocked: false });
    expect(response.status).toBe(200);
    expect(auditActions()).toEqual([]);
  });

  it("rejects the request outright without a valid admin session", async () => {
    const response = await POST(new Request("https://verificafarma.example/api/admin/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "cus_35172", blocked: true }),
    }));
    expect(response.status).toBe(401);
    expect(auditActions()).toHaveLength(0);
  });

  it("403s an admin who lacks admin.profiles.manage", async () => {
    const otherId = `adm_${crypto.randomUUID()}`;
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, 'no-perms', 'x', '[]', '2026-01-01T00:00:00.000Z')").run(otherId);
    const cookie = await createAdminCookie(otherId, { ip: "127.0.0.1", device: "test" });
    const response = await POST(new Request("https://verificafarma.example/api/admin/profiles", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `vf_admin=${cookie}`, origin: "https://verificafarma.example" },
      body: JSON.stringify({ id: "cus_35172", blocked: true }),
    }));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/admin/profiles field-level change history", () => {
  function changesForProfile() {
    return (db.raw.prepare("SELECT admin_username AS adminUsername, changes_json AS changesJson FROM admin_profile_changes WHERE profile_id=? ORDER BY id").all("cus_35172") as { adminUsername: string; changesJson: string }[])
      .map((row) => ({ adminUsername: row.adminUsername, fields: JSON.parse(row.changesJson) }));
  }

  it("records only the fields that actually changed, each as {from, to}", async () => {
    const response = await postAsAdmin({ id: "cus_35172", points: 250, level: 2 });
    expect(response.status).toBe(200);
    const rows = changesForProfile();
    expect(rows).toHaveLength(1);
    expect(rows[0].adminUsername).toBe("owner");
    expect(rows[0].fields).toMatchObject({
      points: { from: 0, to: 250 },
      level: { from: 1, to: 2 },
    });
    // levelName/rankOverride/blocked weren't touched — must not appear at all, not even as a no-op {from: x, to: x}.
    expect(rows[0].fields).not.toHaveProperty("levelName");
    expect(rows[0].fields).not.toHaveProperty("rankOverride");
    expect(rows[0].fields).not.toHaveProperty("blocked");
  });

  it("records a blocked change as booleans, not the raw 0/1 the column stores", async () => {
    await postAsAdmin({ id: "cus_35172", blocked: true });
    const rows = changesForProfile();
    expect(rows[0].fields.blocked).toEqual({ from: false, to: true });
  });

  it("writes no row at all for a true no-op save", async () => {
    await postAsAdmin({ id: "cus_35172", blocked: false });
    expect(changesForProfile()).toHaveLength(0);
  });

  it("accumulates one row per edit, each scoped to its own diff — not a running snapshot", async () => {
    await postAsAdmin({ id: "cus_35172", points: 100 });
    await postAsAdmin({ id: "cus_35172", points: 200 });
    const rows = changesForProfile();
    expect(rows).toHaveLength(2);
    expect(rows[0].fields.points).toEqual({ from: 0, to: 100 });
    expect(rows[1].fields.points).toEqual({ from: 100, to: 200 });
  });
});
