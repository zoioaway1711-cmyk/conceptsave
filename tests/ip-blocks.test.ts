import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { isIpBlocked, blockIp, unblockIp, listBlockedIps } = await import("../lib/ip-blocks");

let db: ReturnType<typeof createFakeD1>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
});

describe("blockIp / isIpBlocked", () => {
  it("a fresh IP is never blocked", async () => {
    expect(await isIpBlocked(db as never, "1.2.3.4")).toBe(false);
  });

  it("blocks with a duration — active immediately, and the row records who/why/until when", async () => {
    await blockIp(db as never, "1.2.3.4", { reason: "sustained_admin_login_abuse", blockedBy: "auto", durationHours: 24 });
    expect(await isIpBlocked(db as never, "1.2.3.4")).toBe(true);
    const row = db.raw.prepare("SELECT reason, blocked_by AS blockedBy, expires_at AS expiresAt FROM blocked_ips WHERE ip=?").get("1.2.3.4") as { reason: string; blockedBy: string; expiresAt: string };
    expect(row.reason).toBe("sustained_admin_login_abuse");
    expect(row.blockedBy).toBe("auto");
    expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("blocks indefinitely when no duration is given (manual block)", async () => {
    await blockIp(db as never, "1.2.3.4", { reason: "manual (telegram)", blockedBy: "telegram-bot" });
    const row = db.raw.prepare("SELECT expires_at AS expiresAt FROM blocked_ips WHERE ip=?").get("1.2.3.4") as { expiresAt: string | null };
    expect(row.expiresAt).toBeNull();
    expect(await isIpBlocked(db as never, "1.2.3.4")).toBe(true);
  });

  it("a block that already expired no longer counts as blocked", async () => {
    const pastIso = new Date(Date.now() - 1000).toISOString();
    db.raw.prepare("INSERT INTO blocked_ips (ip, reason, blocked_by, blocked_at, expires_at) VALUES (?, 'x', 'auto', ?, ?)").run("1.2.3.4", pastIso, pastIso);
    expect(await isIpBlocked(db as never, "1.2.3.4")).toBe(false);
  });

  it("re-blocking an already-blocked IP upserts (refreshes reason/expiry) instead of erroring", async () => {
    await blockIp(db as never, "1.2.3.4", { reason: "first", blockedBy: "auto", durationHours: 1 });
    await blockIp(db as never, "1.2.3.4", { reason: "second", blockedBy: "telegram-bot" });
    const row = db.raw.prepare("SELECT reason, blocked_by AS blockedBy FROM blocked_ips WHERE ip=?").get("1.2.3.4") as { reason: string; blockedBy: string };
    expect(row).toEqual({ reason: "second", blockedBy: "telegram-bot" });
    expect((db.raw.prepare("SELECT COUNT(*) AS c FROM blocked_ips").get() as { c: number }).c).toBe(1);
  });

  it("never treats an empty/'unknown' ip as blocked (avoids a shared 'unknown' identifier blocking everyone)", async () => {
    expect(await isIpBlocked(db as never, "")).toBe(false);
    expect(await isIpBlocked(db as never, "unknown")).toBe(false);
  });
});

describe("unblockIp", () => {
  it("removes an active block and returns true", async () => {
    await blockIp(db as never, "1.2.3.4", { reason: "x", blockedBy: "auto", durationHours: 1 });
    expect(await unblockIp(db as never, "1.2.3.4")).toBe(true);
    expect(await isIpBlocked(db as never, "1.2.3.4")).toBe(false);
  });

  it("is idempotent — returns false for an IP that was never blocked, not an error", async () => {
    expect(await unblockIp(db as never, "9.9.9.9")).toBe(false);
  });
});

describe("listBlockedIps", () => {
  it("lists only currently-active blocks, newest first, excluding expired ones", async () => {
    await blockIp(db as never, "1.1.1.1", { reason: "old", blockedBy: "auto", durationHours: 1 });
    await new Promise((r) => setTimeout(r, 2));
    await blockIp(db as never, "2.2.2.2", { reason: "new", blockedBy: "auto", durationHours: 1 });
    const pastIso = new Date(Date.now() - 1000).toISOString();
    db.raw.prepare("INSERT INTO blocked_ips (ip, reason, blocked_by, blocked_at, expires_at) VALUES ('3.3.3.3', 'expired', 'auto', ?, ?)").run(pastIso, pastIso);

    const list = await listBlockedIps(db as never);
    expect(list.map((b) => b.ip)).toEqual(["2.2.2.2", "1.1.1.1"]);
  });
});
