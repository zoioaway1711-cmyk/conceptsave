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
  const cookie = await createAdminCookie(adminId);
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
    const response = await postAsAdmin({ id: "cus_35172", blocked: false });
    expect(response.status).toBe(200);
    expect(auditActions()).not.toContain("ADMIN_PROFILE_BLOCKED");
    expect(auditActions()).not.toContain("ADMIN_PROFILE_UNBLOCKED");
    expect(auditActions()).toContain("ADMIN_PROFILE_UPDATED");
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
    const cookie = await createAdminCookie(otherId);
    const response = await POST(new Request("https://verificafarma.example/api/admin/profiles", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `vf_admin=${cookie}`, origin: "https://verificafarma.example" },
      body: JSON.stringify({ id: "cus_35172", blocked: true }),
    }));
    expect(response.status).toBe(403);
  });
});
