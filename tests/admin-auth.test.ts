import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({ env }));

const { adminConfigured, authenticateAdmin, createAdminCookie, hasPermission, isAdmin, listAdminSessions, requirePermission, resolveAdmin, revokeAdminSession } = await import("../lib/admin-auth");

function reqWithCookie(cookie?: string) {
  return new Request("https://verificafarma.example/api/admin/session", cookie ? { headers: { cookie: `vf_admin=${cookie}` } } : {});
}

let db: ReturnType<typeof createFakeD1>;

beforeEach(() => {
  env.ADMIN_USER = "saveadmin";
  env.ADMIN_PASSWORD = "correct horse battery staple";
  env.SESSION_SECRET = "s".repeat(32);
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
});

describe("adminConfigured", () => {
  it("is false without SESSION_SECRET, regardless of legacy env vars", () => {
    delete env.SESSION_SECRET;
    expect(adminConfigured()).toBe(false);
  });
});

describe("authenticateAdmin bootstrap (first login provisions admin_users from legacy env vars)", () => {
  it("creates the first admin with full permissions on a correct first login", async () => {
    const admin = await authenticateAdmin("saveadmin", "correct horse battery staple");
    expect(admin).not.toBeNull();
    expect(admin!.permissions.length).toBeGreaterThan(0);
    const row = db.raw.prepare("SELECT COUNT(*) AS n FROM admin_users").get() as { n: number };
    expect(row.n).toBe(1);
  });

  it("does not provision anything on a wrong bootstrap password", async () => {
    expect(await authenticateAdmin("saveadmin", "wrong")).toBeNull();
    const row = db.raw.prepare("SELECT COUNT(*) AS n FROM admin_users").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("only bootstraps once — a second distinct username doesn't get auto-created after the table is non-empty", async () => {
    await authenticateAdmin("saveadmin", "correct horse battery staple");
    const second = await authenticateAdmin("someoneelse", "whatever-they-typed");
    expect(second).toBeNull();
    const row = db.raw.prepare("SELECT COUNT(*) AS n FROM admin_users").get() as { n: number };
    expect(row.n).toBe(1);
  });
});

describe("authenticateAdmin against a real admin_users row", () => {
  beforeEach(async () => {
    await authenticateAdmin("saveadmin", "correct horse battery staple"); // bootstraps one row
  });

  it("accepts the right username/password", async () => {
    expect(await authenticateAdmin("saveadmin", "correct horse battery staple")).not.toBeNull();
  });

  it("rejects a wrong password", async () => {
    expect(await authenticateAdmin("saveadmin", "nope")).toBeNull();
  });

  it("rejects an unknown username without throwing", async () => {
    expect(await authenticateAdmin("nobody", "correct horse battery staple")).toBeNull();
  });

  it("rejects a disabled admin even with the correct password", async () => {
    db.raw.prepare("UPDATE admin_users SET disabled=1 WHERE username='saveadmin'").run();
    expect(await authenticateAdmin("saveadmin", "correct horse battery staple")).toBeNull();
  });

  it("is case-insensitive on username", async () => {
    expect(await authenticateAdmin("SaveAdmin", "correct horse battery staple")).not.toBeNull();
  });
});

describe("admin session cookie", () => {
  async function bootstrapAdminId() {
    const admin = await authenticateAdmin("saveadmin", "correct horse battery staple");
    return admin!.id;
  }

  it("round-trips: a freshly issued cookie resolves back to the same admin", async () => {
    const id = await bootstrapAdminId();
    const cookie = await createAdminCookie(id, { ip: "127.0.0.1", device: "test" });
    const resolved = await resolveAdmin(reqWithCookie(cookie));
    expect(resolved?.id).toBe(id);
    expect(await isAdmin(reqWithCookie(cookie))).toBe(true);
  });

  it("rejects a request with no cookie", async () => {
    expect(await isAdmin(reqWithCookie())).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await createAdminCookie(await bootstrapAdminId(), { ip: "127.0.0.1", device: "test" });
    const [payload, signature] = cookie.split(/\.(?=[0-9a-f]{64}$)/);
    const tampered = `${payload}.${signature.replace(/^./, signature[0] === "0" ? "1" : "0")}`;
    expect(await isAdmin(reqWithCookie(tampered))).toBe(false);
  });

  it("rejects a cookie forged for a different admin id without the real secret", async () => {
    const forged = `admin.adm_attacker.ses_${crypto.randomUUID()}.${Date.now() + 999 * 60 * 60 * 1000}.${"a".repeat(64)}`;
    expect(await isAdmin(reqWithCookie(forged))).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    vi.useFakeTimers();
    try {
      const cookie = await createAdminCookie(await bootstrapAdminId(), { ip: "127.0.0.1", device: "test" });
      vi.advanceTimersByTime(9 * 60 * 60 * 1000);
      expect(await isAdmin(reqWithCookie(cookie))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops accepting a previously-valid cookie once SESSION_SECRET is rotated", async () => {
    const cookie = await createAdminCookie(await bootstrapAdminId(), { ip: "127.0.0.1", device: "test" });
    env.SESSION_SECRET = "t".repeat(32);
    expect(await isAdmin(reqWithCookie(cookie))).toBe(false);
  });

  it("rejects a session for an admin who was disabled after the cookie was issued", async () => {
    const id = await bootstrapAdminId();
    const cookie = await createAdminCookie(id, { ip: "127.0.0.1", device: "test" });
    db.raw.prepare("UPDATE admin_users SET disabled=1 WHERE id=?").run(id);
    expect(await isAdmin(reqWithCookie(cookie))).toBe(false);
  });
});

describe("requirePermission / hasPermission — real RBAC, not just isAdmin", () => {
  it("401s a request with no admin session at all", async () => {
    const result = await requirePermission(reqWithCookie(), "admin.live.view");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("403s a real admin who lacks the specific permission", async () => {
    const id = `adm_${crypto.randomUUID()}`;
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, 'limited', 'x', '[]', '2026-01-01T00:00:00.000Z')").run(id);
    const cookie = await createAdminCookie(id, { ip: "127.0.0.1", device: "test" });
    const result = await requirePermission(reqWithCookie(cookie), "admin.live.view");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns the AdminUser when the permission is granted", async () => {
    const id = `adm_${crypto.randomUUID()}`;
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, 'live-viewer', 'x', '[\"admin.live.view\"]', '2026-01-01T00:00:00.000Z')").run(id);
    const cookie = await createAdminCookie(id, { ip: "127.0.0.1", device: "test" });
    const result = await requirePermission(reqWithCookie(cookie), "admin.live.view");
    expect(result).not.toBeInstanceOf(Response);
    expect(hasPermission(result as never, "admin.live.view")).toBe(true);
    expect(hasPermission(result as never, "admin.security.ip.view")).toBe(false);
  });
});

describe("admin sessions — view/revoke (item 2)", () => {
  async function makeAdmin(username: string, permissionsJson = "[]") {
    const id = `adm_${crypto.randomUUID()}`;
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, ?, 'x', ?, '2026-01-01T00:00:00.000Z')").run(id, username, permissionsJson);
    return id;
  }

  it("createAdminCookie records a real session row with the ip/device passed in", async () => {
    const id = await makeAdmin("alice");
    await createAdminCookie(id, { ip: "1.2.3.4", device: "Chrome on macOS" });
    const rows = db.raw.prepare("SELECT admin_id AS adminId, ip, device, revoked_at AS revokedAt FROM admin_sessions").all() as { adminId: string; ip: string; device: string; revokedAt: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adminId: id, ip: "1.2.3.4", device: "Chrome on macOS", revokedAt: null });
  });

  it("resolveAdmin includes the sessionId, and it matches the session row that was created", async () => {
    const id = await makeAdmin("alice");
    const cookie = await createAdminCookie(id, { ip: "1.2.3.4", device: "test" });
    const resolved = await resolveAdmin(reqWithCookie(cookie));
    expect(resolved?.sessionId).toMatch(/^ses_/);
    const row = db.raw.prepare("SELECT id FROM admin_sessions WHERE admin_id=?").get(id) as { id: string };
    expect(resolved?.sessionId).toBe(row.id);
  });

  it("a revoked session is refused immediately, even though its signature and expiry are still perfectly valid", async () => {
    const id = await makeAdmin("alice");
    const cookie = await createAdminCookie(id, { ip: "1.2.3.4", device: "test" });
    expect(await isAdmin(reqWithCookie(cookie))).toBe(true);

    const sessionId = (db.raw.prepare("SELECT id FROM admin_sessions WHERE admin_id=?").get(id) as { id: string }).id;
    expect(await revokeAdminSession(db as never, sessionId, { id, canManageAll: false })).toBe(true);

    expect(await isAdmin(reqWithCookie(cookie))).toBe(false);
  });

  it("revoking twice is a no-op the second time (idempotent, not an error)", async () => {
    const id = await makeAdmin("alice");
    await createAdminCookie(id, { ip: "1.2.3.4", device: "test" });
    const sessionId = (db.raw.prepare("SELECT id FROM admin_sessions WHERE admin_id=?").get(id) as { id: string }).id;
    expect(await revokeAdminSession(db as never, sessionId, { id, canManageAll: false })).toBe(true);
    expect(await revokeAdminSession(db as never, sessionId, { id, canManageAll: false })).toBe(false);
  });

  it("refuses to let one admin revoke another admin's session without admin.admins.manage", async () => {
    const ownerId = await makeAdmin("owner");
    const attackerId = await makeAdmin("mallory");
    await createAdminCookie(ownerId, { ip: "1.2.3.4", device: "test" });
    const sessionId = (db.raw.prepare("SELECT id FROM admin_sessions WHERE admin_id=?").get(ownerId) as { id: string }).id;
    expect(await revokeAdminSession(db as never, sessionId, { id: attackerId, canManageAll: false })).toBe(false);
    // Still logged in — the refused attempt didn't revoke it.
    const row = db.raw.prepare("SELECT revoked_at AS revokedAt FROM admin_sessions WHERE id=?").get(sessionId) as { revokedAt: string | null };
    expect(row.revokedAt).toBeNull();
  });

  it("lets an admin.admins.manage-equivalent caller revoke someone else's session (the 'stolen laptop' case)", async () => {
    const victimId = await makeAdmin("victim");
    await createAdminCookie(victimId, { ip: "1.2.3.4", device: "stolen laptop" });
    const sessionId = (db.raw.prepare("SELECT id FROM admin_sessions WHERE admin_id=?").get(victimId) as { id: string }).id;
    expect(await revokeAdminSession(db as never, sessionId, { id: "adm_someone_else", canManageAll: true })).toBe(true);
  });

  it("listAdminSessions scoped to one admin never leaks another admin's sessions", async () => {
    const aliceId = await makeAdmin("alice");
    const bobId = await makeAdmin("bob");
    await createAdminCookie(aliceId, { ip: "1.1.1.1", device: "alice-device" });
    await createAdminCookie(bobId, { ip: "2.2.2.2", device: "bob-device" });

    const aliceSessions = await listAdminSessions(db as never, aliceId);
    expect(aliceSessions).toHaveLength(1);
    expect(aliceSessions[0].device).toBe("alice-device");

    const everyone = await listAdminSessions(db as never);
    expect(everyone).toHaveLength(2);
  });
});
