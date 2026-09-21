import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { POST } = await import("../app/api/admin/session/route");

let db: ReturnType<typeof createFakeD1>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES ('adm_1', 'owner', ?, '[\"admin.dashboard.view\"]', '2026-01-01T00:00:00.000Z')")
    .run("pbkdf2$1$00$" + "0".repeat(64)); // unused password hash placeholder — authenticateAdmin below always re-derives, so real login uses the bootstrap path instead where needed
});

function loginRequest(body: unknown, opts: { ip?: string; ua?: string } = {}) {
  return new Request("https://verificafarma.example/api/admin/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://verificafarma.example",
      ...(opts.ip ? { "cf-connecting-ip": opts.ip } : {}),
      ...(opts.ua ? { "user-agent": opts.ua } : {}),
    },
    body: JSON.stringify(body),
  });
}

function auditRows() {
  return db.raw.prepare("SELECT actor, action, result, ip, metadata_json AS metadataJson, created_at AS createdAt FROM audit_logs ORDER BY id").all() as { actor: string; action: string; result: string; ip: string; metadataJson: string; createdAt: string }[];
}

describe("POST /api/admin/session — detailed audit trail for every attempt", () => {
  it("logs a failed login with the exact IP, a real timestamp, and device metadata", async () => {
    const response = await POST(loginRequest({ user: "owner", password: "wrong" }, { ip: "203.0.113.9", ua: "Mozilla/5.0 (Macintosh) Chrome/120" }));
    expect(response.status).toBe(401);
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "owner", action: "ADMIN_LOGIN", result: "failure", ip: "203.0.113.9" });
    expect(rows[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const metadata = JSON.parse(rows[0].metadataJson);
    expect(metadata).toMatchObject({ reason: "invalid_credentials" });
    expect(metadata.userAgent).toContain("Chrome");
  });

  it("logs a rate-limited attempt (before credentials are even checked) with IP and device, actor 'unknown'", async () => {
    for (let i = 0; i < 9; i++) {
      await POST(loginRequest({ user: "owner", password: "wrong" }, { ip: "203.0.113.9", ua: "curl/8.0" }));
    }
    const rows = auditRows();
    const rateLimited = rows.filter((r) => r.action === "ADMIN_LOGIN_RATE_LIMITED");
    expect(rateLimited.length).toBeGreaterThan(0);
    expect(rateLimited[0]).toMatchObject({ actor: "unknown", result: "failure", ip: "203.0.113.9" });
    expect(JSON.parse(rateLimited[0].metadataJson).userAgent).toBe("curl/8.0");
  });

  it("logs a successful login with IP, device and the admin's own id in metadata", async () => {
    // Bootstrap path: empty admin_users + legacy env vars auto-provisions on first correct login.
    db.raw.prepare("DELETE FROM admin_users").run();
    env.ADMIN_USER = "owner";
    env.ADMIN_PASSWORD = "correct horse battery staple";
    const response = await POST(loginRequest({ user: "owner", password: "correct horse battery staple" }, { ip: "198.51.100.5", ua: "Mozilla/5.0 (Windows NT 10.0) Firefox/121" }));
    expect(response.status).toBe(200);
    const rows = auditRows();
    const success = rows.find((r) => r.action === "ADMIN_LOGIN" && r.result === "success");
    expect(success).toMatchObject({ actor: "owner", ip: "198.51.100.5" });
    const metadata = JSON.parse(success!.metadataJson);
    expect(metadata.userAgent).toContain("Firefox");
    expect(metadata.adminId).toMatch(/^adm_/);
  });
});

describe("POST /api/admin/session — IP auto-block on sustained abuse", () => {
  it("blocks the IP outright once the sustained 20-in-15min cap is crossed, and every request after that is refused before even touching credentials", async () => {
    let last!: Response;
    for (let i = 0; i < 21; i++) {
      last = await POST(loginRequest({ user: "owner", password: "wrong" }, { ip: "198.51.100.7" }));
    }
    // The 21st request is the one that crossed the threshold — it's still
    // a normal rate-limit response, not the block itself surfacing yet.
    expect(last.status).toBe(429);
    expect((await db.raw.prepare("SELECT ip FROM blocked_ips").get()) as { ip: string }).toMatchObject({ ip: "198.51.100.7" });

    // The 22nd request — now genuinely blocked — gets a distinct response
    // and (critically) never reaches the password check, even with the
    // CORRECT password.
    db.raw.prepare("DELETE FROM admin_users").run();
    env.ADMIN_USER = "owner";
    env.ADMIN_PASSWORD = "correct horse battery staple";
    const blocked = await POST(loginRequest({ user: "owner", password: "correct horse battery staple" }, { ip: "198.51.100.7" }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: "ip_blocked" });
    expect((await db.raw.prepare("SELECT COUNT(*) AS c FROM admin_users").get()) as { c: number }).toMatchObject({ c: 0 }); // bootstrap never ran — proves credentials were never even checked
  });

  it("never blocks an IP that only trips the tighter burst limit (8/60s) without sustained abuse", async () => {
    for (let i = 0; i < 10; i++) {
      await POST(loginRequest({ user: "owner", password: "wrong" }, { ip: "198.51.100.8" }));
    }
    expect(await db.raw.prepare("SELECT COUNT(*) AS c FROM blocked_ips").get()).toMatchObject({ c: 0 });
  });

  it("a different IP is completely unaffected by another IP's block", async () => {
    for (let i = 0; i < 21; i++) {
      await POST(loginRequest({ user: "owner", password: "wrong" }, { ip: "198.51.100.9" }));
    }
    const response = await POST(loginRequest({ user: "owner", password: "wrong" }, { ip: "198.51.100.10" }));
    expect(response.status).toBe(401); // invalid_credentials, not ip_blocked — this IP has never been seen
  });
});
