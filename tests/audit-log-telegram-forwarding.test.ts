import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({ env }));

const { logAudit } = await import("../lib/audit-log");

let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.TELEGRAM_BOT_TOKEN = "123:ABC";
  env.TELEGRAM_CHAT_ID = "999";
  fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logAudit — every entry forwards to Telegram by default", () => {
  it("forwards an ordinary entry (e.g. LICENSE_CREATED) as a generic message", async () => {
    await logAudit(db as never, { actor: "owner", action: "LICENSE_CREATED", resource: "licenses", resourceId: "42", result: "success", ip: "1.2.3.4" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
    expect(text).toContain("LICENSE_CREATED");
    expect(text).toContain("owner");
    expect(text).toContain("licenses #42");
    expect(text).toContain("1.2.3.4");
  });

  it("shows the product name (not just the id) when metadata carries one — LICENSE_CREATED uses `material`", async () => {
    await logAudit(db as never, { actor: "owner", action: "LICENSE_CREATED", resource: "licenses", resourceId: "42", result: "success", metadata: { serial: "****1234", material: "LIPOLESS 2.5MG" } });
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
    expect(text).toContain("Produto: LIPOLESS 2.5MG");
  });

  it("shows the product name from `name` — MATERIAL_CREATED", async () => {
    await logAudit(db as never, { actor: "owner", action: "MATERIAL_CREATED", resource: "materials", resourceId: "7", result: "success", metadata: { name: "LIPOLESS 2.5MG", prefixCode: "LIPO" } });
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
    expect(text).toContain("Produto: LIPOLESS 2.5MG");
  });

  it("omits the product line entirely when metadata has no name/material", async () => {
    await logAudit(db as never, { actor: "owner", action: "LICENSE_REVOKED", resource: "licenses", resourceId: "42", result: "success" });
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
    expect(text).not.toContain("Produto:");
  });

  it("still writes the Audit Log row even when Telegram isn't configured", async () => {
    delete env.TELEGRAM_BOT_TOKEN;
    delete env.TELEGRAM_CHAT_ID;
    await logAudit(db as never, { actor: "owner", action: "LICENSE_CREATED", result: "success" });
    expect(fetchMock).not.toHaveBeenCalled();
    const row = db.raw.prepare("SELECT action FROM audit_logs").get() as { action: string };
    expect(row.action).toBe("LICENSE_CREATED");
  });

  it("respects `silent: true` — writes the Audit Log row but sends nothing", async () => {
    await logAudit(db as never, { actor: "owner", action: "LICENSE_CREATED", result: "success", silent: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.raw.prepare("SELECT COUNT(*) AS c FROM audit_logs").get()).toMatchObject({ c: 1 });
  });

  it("never forwards an ALERT_* action — those send their own purpose-written message from lib/alerts.ts instead", async () => {
    await logAudit(db as never, { actor: "security-alert", action: "ALERT_ADMIN_LOGIN_RATE_LIMITED", result: "failure", ip: "1.2.3.4" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a bulk loop marking every per-row entry silent still lets one non-silent summary entry through", async () => {
    for (let i = 0; i < 50; i++) {
      await logAudit(db as never, { actor: "owner", action: "LICENSE_CREATED", result: "success", metadata: { source: "bulk_import" }, silent: true });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await logAudit(db as never, { actor: "owner", action: "LICENSES_IMPORTED", result: "success", metadata: { total: 50, created: 50 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.raw.prepare("SELECT COUNT(*) AS c FROM audit_logs").get()).toMatchObject({ c: 51 });
  });
});
