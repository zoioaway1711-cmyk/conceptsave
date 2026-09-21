import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({ env }));

const { sendTelegramAlert, maybeAlertAdminLoginRateLimited, maybeAlertUnrecognizedAdminLogin, maybeAlertLicenseRevokeBurst } = await import("../lib/alerts");

let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  delete env.TELEGRAM_BOT_TOKEN;
  delete env.TELEGRAM_CHAT_ID;
  fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function auditActions() {
  return (db.raw.prepare("SELECT action FROM audit_logs ORDER BY id").all() as { action: string }[]).map((row) => row.action);
}

describe("sendTelegramAlert", () => {
  it("is a silent no-op when the secrets aren't configured — never throws, never calls fetch", async () => {
    await expect(sendTelegramAlert("test")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the Telegram Bot API with the configured token/chat id once both are set", async () => {
    env.TELEGRAM_BOT_TOKEN = "123:ABC";
    env.TELEGRAM_CHAT_ID = "999";
    await sendTelegramAlert("hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "999", text: "hello" });
  });

  it("swallows a network failure instead of throwing — a Telegram outage must never break the admin action that triggered it", async () => {
    env.TELEGRAM_BOT_TOKEN = "123:ABC";
    env.TELEGRAM_CHAT_ID = "999";
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(sendTelegramAlert("hello")).resolves.toBeUndefined();
  });
});

describe("maybeAlertAdminLoginRateLimited", () => {
  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = "123:ABC";
    env.TELEGRAM_CHAT_ID = "999";
  });

  it("sends exactly one alert even if called repeatedly for the same IP within the throttle window, and logs exactly one matching Audit Log row", async () => {
    await maybeAlertAdminLoginRateLimited(db as never, "1.2.3.4");
    await maybeAlertAdminLoginRateLimited(db as never, "1.2.3.4");
    await maybeAlertAdminLoginRateLimited(db as never, "1.2.3.4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auditActions().filter((a) => a === "ALERT_ADMIN_LOGIN_RATE_LIMITED")).toHaveLength(1);
  });

  it("alerts independently per IP — one attacker's throttle doesn't silence another's", async () => {
    await maybeAlertAdminLoginRateLimited(db as never, "1.1.1.1");
    await maybeAlertAdminLoginRateLimited(db as never, "2.2.2.2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("maybeAlertUnrecognizedAdminLogin", () => {
  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = "123:ABC";
    env.TELEGRAM_CHAT_ID = "999";
  });

  it("stays silent on an admin's very first-ever login (priorSessionCount 0) — everything is new at that point", async () => {
    await maybeAlertUnrecognizedAdminLogin(db as never, "adm_1", "owner", "1.2.3.4", "Chrome", 0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent when this exact IP has a prior session for this admin", async () => {
    db.raw.prepare("INSERT INTO admin_sessions (id, admin_id, created_at, last_seen_at, expires_at, ip, device) VALUES ('ses_old', 'adm_1', '2026-01-01', '2026-01-01', '2099-01-01', '1.2.3.4', 'Chrome')").run();
    await maybeAlertUnrecognizedAdminLogin(db as never, "adm_1", "owner", "1.2.3.4", "Chrome", 1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("alerts when this admin has logged in before, but never from this IP, and logs it to the Audit Log with the real IP/admin", async () => {
    db.raw.prepare("INSERT INTO admin_sessions (id, admin_id, created_at, last_seen_at, expires_at, ip, device) VALUES ('ses_old', 'adm_1', '2026-01-01', '2026-01-01', '2099-01-01', '9.9.9.9', 'Chrome')").run();
    await maybeAlertUnrecognizedAdminLogin(db as never, "adm_1", "owner", "1.2.3.4", "Chrome", 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain("owner");
    const row = db.raw.prepare("SELECT actor, ip FROM audit_logs WHERE action='ALERT_ADMIN_LOGIN_NEW_IP'").get() as { actor: string; ip: string };
    expect(row).toMatchObject({ actor: "owner", ip: "1.2.3.4" });
  });
});

describe("maybeAlertLicenseRevokeBurst", () => {
  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = "123:ABC";
    env.TELEGRAM_CHAT_ID = "999";
  });

  it("fires exactly at the threshold, not before and not after, with one matching Audit Log row", async () => {
    for (let count = 1; count <= 4; count++) await maybeAlertLicenseRevokeBurst(db as never, "owner", "1.2.3.4", count, 5);
    expect(fetchMock).not.toHaveBeenCalled();

    await maybeAlertLicenseRevokeBurst(db as never, "owner", "1.2.3.4", 5, 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await maybeAlertLicenseRevokeBurst(db as never, "owner", "1.2.3.4", 6, 5);
    await maybeAlertLicenseRevokeBurst(db as never, "owner", "1.2.3.4", 12, 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auditActions().filter((a) => a === "ALERT_LICENSE_REVOKE_BURST")).toHaveLength(1);
  });
});
