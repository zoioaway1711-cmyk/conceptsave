import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { seedLicense, seedMaterial, upsertProfile } from "./helpers/seed";

const env: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({ env }));

const sessionRoute = await import("../app/api/admin/session/route");
const adminsRoute = await import("../app/api/admin/admins/route");
const licenseRoute = await import("../app/api/admin/licenses/[id]/route");
const verificationsRoute = await import("../app/api/verifications/route");
const profilesRoute = await import("../app/api/profiles/route");
const webhookRoute = await import("../app/api/telegram/webhook/route");
const { authenticateAdmin, createAdminCookie, isAdmin } = await import("../lib/admin-auth");
const { customerCookie, customerId } = await import("../lib/customer-auth");
const { readCookie } = await import("../lib/session-cookie");
const { sanitizeAlertText } = await import("../lib/telegram");
const { logAudit } = await import("../lib/audit-log");
const { encryptCpf, decryptCpf } = await import("../lib/loja-orders");
const { proxy } = await import("../proxy");

const ORIGIN = "https://verificafarma.example";
const PASSWORD = "correct horse battery staple";
let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  env.SESSION_SECRET = "s".repeat(32);
  env.ADMIN_USER = "owner";
  env.ADMIN_PASSWORD = PASSWORD;
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function login(body: unknown, ip: string) {
  return sessionRoute.POST(new Request(`${ORIGIN}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  }));
}

async function ownerCookie() {
  const owner = await authenticateAdmin("owner", PASSWORD);
  return createAdminCookie(owner!.id, { ip: "127.0.0.1", device: "test" });
}

function adminRequest(path: string, cookie: string, method: string, body: unknown) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, cookie: `__Host-vf_admin=${cookie}`, "cf-connecting-ip": "203.0.113.50" },
    body: JSON.stringify(body),
  });
}

describe("__Host- session cookies", () => {
  it("login issues __Host-vf_admin (Secure, HttpOnly, SameSite=Strict, Path=/) and clears the legacy name", async () => {
    const response = await login({ user: "owner", password: PASSWORD }, "198.51.100.1");
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies[0]).toMatch(/^__Host-vf_admin=admin\./);
    expect(cookies[0]).toContain("HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800");
    expect(cookies[0]).not.toMatch(/Domain=/i);
    expect(cookies[1]).toMatch(/^vf_admin=; .*Max-Age=0/);
  });

  it("still accepts the legacy cookie name, but the prefixed one wins when both are sent", async () => {
    const cookie = await ownerCookie();
    expect(await isAdmin(new Request(ORIGIN, { headers: { cookie: `vf_admin=${cookie}` } }))).toBe(true);
    expect(await isAdmin(new Request(ORIGIN, { headers: { cookie: `vf_admin=${cookie}; __Host-vf_admin=garbage` } }))).toBe(false);
    expect(readCookie("a=1; __Host-vf_customer=new; vf_customer=old", ["__Host-vf_customer", "vf_customer"])).toBe("new");
  });

  it("customer cookies are read under the new name too", async () => {
    const cookie = await customerCookie("cus_abc");
    expect(await customerId(new Request(ORIGIN, { headers: { cookie: `__Host-vf_customer=${cookie}` } }))).toBe("cus_abc");
  });
});

describe("admin login hardening", () => {
  it("locks one ACCOUNT after 10 failures even when every attempt comes from a different IP", async () => {
    await authenticateAdmin("owner", PASSWORD); // provision the account
    for (let i = 0; i < 10; i++) {
      expect((await login({ user: "owner", password: "wrong" }, `192.0.2.${i + 1}`)).status).toBe(401);
    }
    const locked = await login({ user: "owner", password: PASSWORD }, "192.0.2.200");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Other accounts are unaffected.
    expect((await login({ user: "someone", password: "wrong" }, "192.0.2.201")).status).toBe(401);
  });

  it("rate-limits and auto-blocks a whole IPv6 /64, not just one address", async () => {
    let last!: Response;
    for (let i = 0; i < 21; i++) last = await login({ user: `user${i}`, password: "wrong" }, `2001:db8:1:2::${(i + 1).toString(16)}`);
    expect(last.status).toBe(429);
    expect(db.raw.prepare("SELECT ip FROM blocked_ips").get()).toMatchObject({ ip: "2001:db8:1:2::/64" });
    const fresh = await login({ user: "owner", password: PASSWORD }, "2001:db8:1:2:ffff::9");
    expect(fresh.status).toBe(403);
    expect(await fresh.json()).toMatchObject({ error: "ip_blocked" });
  });

  it("forwards at most 10 failed logins per hour to Telegram, but audits every one", async () => {
    env.TELEGRAM_BOT_TOKEN = "t";
    env.TELEGRAM_CHAT_ID = "1";
    for (let i = 0; i < 14; i++) await login({ user: `u${i}`, password: "wrong" }, `192.0.2.${i + 1}`);
    const telegramCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.telegram.org"));
    expect(telegramCalls).toHaveLength(10);
    const audited = db.raw.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='ADMIN_LOGIN' AND result='failure'").get() as { n: number };
    expect(audited.n).toBe(14);
  });
});

describe("Telegram alert injection", () => {
  it("strips line breaks, bidi and control characters and caps the length", () => {
    expect(sanitizeAlertText("x\n✅ SAVE LOGS — ADMIN_LOGIN\r\nIP: 1.2.3.4")).toBe("x ✅ SAVE LOGS — ADMIN_LOGIN IP: 1.2.3.4");
    expect(sanitizeAlertText("a‮b\u0000c")).toBe("a b c");
    expect(sanitizeAlertText("y".repeat(200), 10)).toHaveLength(10);
  });

  it("an attacker-typed username can't add lines to the forwarded audit message", async () => {
    env.TELEGRAM_BOT_TOKEN = "t";
    env.TELEGRAM_CHAT_ID = "1";
    await logAudit(db as never, { actor: "evil\n✅ SAVE LOGS — ADMIN_LOGIN\nPor: owner", action: "ADMIN_LOGIN", result: "failure", ip: "1.2.3.4" });
    const text = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).text as string;
    expect(text.split("\n")).toHaveLength(3); // header, Por:, IP:
  });

  it("the webhook still rejects a wrong secret (now compared in constant time)", async () => {
    env.TELEGRAM_CHAT_ID = "1";
    env.TELEGRAM_WEBHOOK_SECRET = "a".repeat(40);
    const response = await webhookRoute.POST(new Request(`${ORIGIN}/api/telegram/webhook`, { method: "POST", headers: { "x-telegram-bot-api-secret-token": "a".repeat(39) + "b" }, body: "{}" }));
    expect(response.status).toBe(403);
  });
});

describe("admin sessions", () => {
  it("expire after 2h without activity even inside the 8h lifetime", async () => {
    const cookie = await ownerCookie();
    const request = () => new Request(ORIGIN, { headers: { cookie: `__Host-vf_admin=${cookie}` } });
    expect(await isAdmin(request())).toBe(true);
    db.raw.prepare("UPDATE admin_sessions SET last_seen_at=?").run(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());
    expect(await isAdmin(request())).toBe(false);
  });

  it("disabling an admin revokes every session, so re-enabling doesn't resurrect old cookies", async () => {
    const managerCookie = await ownerCookie();
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES ('adm_2', 'helper', 'x', '[]', '2026-01-01')").run();
    const helperCookie = await createAdminCookie("adm_2", { ip: "1.1.1.1", device: "laptop" });
    const helperRequest = () => new Request(ORIGIN, { headers: { cookie: `__Host-vf_admin=${helperCookie}` } });
    expect(await isAdmin(helperRequest())).toBe(true);
    expect((await adminsRoute.PATCH(adminRequest("/api/admin/admins", managerCookie, "PATCH", { id: "adm_2", disabled: true }))).status).toBe(200);
    expect((await adminsRoute.PATCH(adminRequest("/api/admin/admins", managerCookie, "PATCH", { id: "adm_2", disabled: false }))).status).toBe(200);
    expect(await isAdmin(helperRequest())).toBe(false);
  });

  it("caps full-serial reveals per admin (30/hour) and audits a burst alert", async () => {
    const cookie = await ownerCookie();
    const reveal = () => licenseRoute.PATCH(adminRequest("/api/admin/licenses/999", cookie, "PATCH", { action: "reveal" }), { params: Promise.resolve({ id: "999" }) });
    for (let i = 0; i < 30; i++) expect((await reveal()).status).toBe(404);
    expect((await reveal()).status).toBe(429);
    const alert = db.raw.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='ALERT_SENSITIVE_REVEAL_BURST'").get() as { n: number };
    expect(alert.n).toBe(1);
  });
});

describe("customer endpoints", () => {
  it("verifications have a per-profile budget that survives IP rotation", async () => {
    upsertProfile(db, "cus_viewer");
    const cookie = await customerCookie("cus_viewer");
    const send = (i: number) => verificationsRoute.POST(new Request(`${ORIGIN}/api/verifications`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: `vf_customer=${cookie}`, "cf-connecting-ip": `10.0.${Math.floor(i / 250)}.${i % 250}` },
      body: JSON.stringify({ serial: "not-a-serial" }),
    }));
    for (let i = 0; i < 60; i++) expect((await send(i)).status).toBe(400);
    expect((await send(60)).status).toBe(429);
  });

  it("benefit codes carry 30 random bits on top of the profile id suffix", async () => {
    upsertProfile(db, "cus_abcd1234");
    const materialId = seedMaterial(db, { prefixCode: "PROD", name: "Product" });
    for (const serial of ["PROD-AAAA-BBBB-CCCC-0001", "PROD-AAAA-BBBB-CCCC-0002", "PROD-AAAA-BBBB-CCCC-0003"]) {
      await seedLicense(db, materialId, { serial, ownerProfileId: "cus_abcd1234", activatedAt: "2026-01-01T00:00:00.000Z" });
    }
    const cookie = await customerCookie("cus_abcd1234");
    const response = await profilesRoute.POST(new Request(`${ORIGIN}/api/profiles`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: `vf_customer=${cookie}` },
      body: JSON.stringify({ id: "cus_abcd1234", benefits: [{ threshold: 3 }] }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { profile: { benefits: { code: string }[] } };
    expect(body.profile.benefits[0].code).toMatch(/^SAVEFRETE-1234-[0-9A-HJKMNP-TV-Z]{6}$/);
  });
});

describe("CPF encryption with the optional LOJA_DATA_KEY", () => {
  it("keeps legacy (SESSION_SECRET) ciphertexts readable and uses the dedicated key for new ones", async () => {
    const legacy = await encryptCpf("12345678909");
    expect(legacy.startsWith("v2:")).toBe(false);
    env.LOJA_DATA_KEY = "k".repeat(48);
    const modern = await encryptCpf("98765432100");
    expect(modern.startsWith("v2:")).toBe(true);
    expect(await decryptCpf(legacy)).toBe("12345678909");
    expect(await decryptCpf(modern)).toBe("98765432100");
    // New CPFs survive a SESSION_SECRET rotation.
    env.SESSION_SECRET = "z".repeat(32);
    expect(await decryptCpf(modern)).toBe("98765432100");
    await expect(decryptCpf(legacy)).rejects.toThrow();
  });

  it("ignores a too-short LOJA_DATA_KEY (falls back to the legacy scheme)", async () => {
    env.LOJA_DATA_KEY = "short";
    expect((await encryptCpf("12345678909")).startsWith("v2:")).toBe(false);
  });
});

describe("proxy.ts", () => {
  it("API responses get a no-load CSP plus CORP/COOP; pages keep the nonce CSP and get COOP", async () => {
    const api = await proxy(new NextRequest(`${ORIGIN}/api/health`));
    expect(api.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    expect(api.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const page = await proxy(new NextRequest(`${ORIGIN}/loja`));
    expect(page.headers.get("content-security-policy")).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(page.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
    expect(page.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("the Vercel reverse proxy drops visitor-supplied x-vf-* headers before stamping its own", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PRODUCTION_URL", "https://worker.example");
    vi.stubEnv("PROXY_TRUST_SECRET", "p".repeat(40));
    try {
      await proxy(new NextRequest("https://www.public.example/loja", {
        headers: { "x-forwarded-for": "198.51.100.3", "x-vf-real-city": "Forged", "x-vf-real-region": "XX", "x-vf-anything": "1" },
      }));
      const sent = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
      expect(sent.get("x-vf-real-city")).toBeNull();
      expect(sent.get("x-vf-real-region")).toBeNull();
      expect(sent.get("x-vf-anything")).toBeNull();
      expect(sent.get("x-vf-real-ip")).toBe("198.51.100.3");
      expect(sent.get("x-vf-proxy-secret")).toBe("p".repeat(40));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
