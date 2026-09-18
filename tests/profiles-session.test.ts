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

  it("logging in again with the same serial doesn't double-credit points", async () => {
    const { serial } = await createLicense(db as never, materialId);
    await POST(loginRequest(serial));
    const second = await POST(loginRequest(serial));
    const body = await second.json() as { profile: { points: number } };
    expect(body.profile.points).toBe(100);
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

  it("rejects login for a blocked profile even with the right, already-owned serial", async () => {
    const { serial } = await createLicense(db as never, materialId);
    const first = await POST(loginRequest(serial));
    const cookie = await cookieFrom(first);
    const profileId = await customerId(new Request("https://x", { headers: { cookie: `vf_customer=${cookie}` } }));
    db.raw.prepare("UPDATE customer_profiles SET blocked=1 WHERE id=?").run(profileId);
    const second = await POST(loginRequest(serial));
    expect(second.status).toBe(403);
  });

  it("DELETE always clears the cookie, even with no session", async () => {
    const response = await DELETE(new Request("https://verificafarma.example/api/profiles/session", { method: "DELETE" }));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
