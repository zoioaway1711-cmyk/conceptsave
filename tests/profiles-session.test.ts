import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { seedMaterial } from "./helpers/seed";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { createLicense } = await import("../lib/licenses");
const { POST, DELETE } = await import("../app/api/profiles/session/route");
const { customerId } = await import("../lib/customer-auth");

let db: ReturnType<typeof createFakeD1>;
let materialId: number;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  materialId = seedMaterial(db, { prefixCode: "SESS", name: "Session Material" });
});

function loginRequest(serial: string) {
  return new Request("https://verificafarma.example/api/profiles/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://verificafarma.example" },
    body: JSON.stringify({ serial }),
  });
}

async function cookieFrom(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.match(/vf_customer=([^;]+)/)?.[1];
}

describe("POST /api/profiles/session — first login is a claim, and must credit points immediately", () => {
  it("credits 100 points on the very first login for a fresh license (no follow-up /api/verifications call needed)", async () => {
    const { serial } = await createLicense(db as never, materialId);
    const response = await POST(loginRequest(serial));
    expect(response.status).toBe(200);
    const body = await response.json() as { authenticated: boolean; profile: { points: number } };
    expect(body.authenticated).toBe(true);
    expect(body.profile.points).toBe(100);
  });

  it("a serial is single-use: logging in again with the same (already-claimed) serial is rejected, not re-authenticated", async () => {
    const { serial } = await createLicense(db as never, materialId);
    const first = await POST(loginRequest(serial));
    expect((await first.json() as { profile: { points: number } }).profile.points).toBe(100);
    const second = await POST(loginRequest(serial));
    expect(second.status).toBe(401);
    expect((await second.json() as { error: string }).error).toBe("serial_already_used");
    // Confirms this was a hard rejection, not a silent no-op re-login:
    // no session cookie is issued for the second attempt.
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an unknown (well-formed) serial", async () => {
    const response = await POST(loginRequest("SESS-AAAA-BBBB-CCCC-DDDD"));
    expect(response.status).toBe(401);
  });

  it("rejects a malformed serial without ever querying the licenses table for it", async () => {
    const spy = vi.spyOn(db, "prepare");
    const response = await POST(loginRequest("not-a-real-serial"));
    expect(response.status).toBe(400);
    // Rate-limit bookkeeping runs first (by design, before format
    // validation) — the important guarantee is that a malformed serial
    // never reaches a `licenses` lookup.
    expect(spy.mock.calls.some(([sql]) => String(sql).includes("FROM licenses"))).toBe(false);
    spy.mockRestore();
  });

  // A blocked profile can no longer be reached through THIS route at all:
  // since serials are single-use, the only way in is the claim path, which
  // always mints a brand-new (never-blocked) profile — there is no
  // "re-present your serial" path for an existing, possibly-blocked
  // customer to even attempt. Enforcement for an already-blocked customer
  // now lives where they actually keep coming back through: GET/POST
  // /api/profiles (session-cookie-authenticated), which still checks
  // `profile.blocked` on every call.
  it("still creates a fresh (unblocked) profile via a different, never-used serial after an unrelated profile was blocked", async () => {
    const { serial: firstSerial } = await createLicense(db as never, materialId);
    const first = await POST(loginRequest(firstSerial));
    const cookie = await cookieFrom(first);
    const blockedProfileId = await customerId(new Request("https://x", { headers: { cookie: `vf_customer=${cookie}` } }));
    db.raw.prepare("UPDATE customer_profiles SET blocked=1 WHERE id=?").run(blockedProfileId);

    const { serial: secondSerial } = await createLicense(db as never, materialId);
    const second = await POST(loginRequest(secondSerial));
    expect(second.status).toBe(200);
    const body = await second.json() as { profile: { id: string } };
    expect(body.profile.id).not.toBe(blockedProfileId);
  });

  it("DELETE always clears the cookie, even with no session", async () => {
    const response = await DELETE(new Request("https://verificafarma.example/api/profiles/session", { method: "DELETE" }));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
