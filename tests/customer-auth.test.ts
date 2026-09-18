import { beforeEach, describe, expect, it, vi } from "vitest";

const env: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({ env }));

const { customerCookie, customerId } = await import("../lib/customer-auth");

function reqWithCookie(cookie?: string) {
  return new Request("https://verificafarma.example/api/verifications", cookie ? { headers: { cookie: `vf_customer=${cookie}` } } : {});
}

beforeEach(() => {
  env.SESSION_SECRET = "s".repeat(32);
});

describe("customer session cookie", () => {
  it("round-trips for an opaque profile id — the cookie never embeds a license serial", async () => {
    const cookie = await customerCookie("cus_11111111-1111-1111-1111-111111111111");
    expect(cookie).not.toContain("MAT-");
    expect(await customerId(reqWithCookie(cookie))).toBe("cus_11111111-1111-1111-1111-111111111111");
  });

  it("rejects a request with no cookie", async () => {
    expect(await customerId(reqWithCookie())).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const cookie = await customerCookie("cus_a");
    const [payload, signature] = cookie.split(/\.(?=[0-9a-f]{64}$)/);
    const tampered = `${payload}.${signature.replace(/^./, signature[0] === "0" ? "1" : "0")}`;
    expect(await customerId(reqWithCookie(tampered))).toBeNull();
  });

  it("rejects a profile id swapped in after signing (identity forgery)", async () => {
    const cookie = await customerCookie("cus_victim");
    const forged = cookie.replace("cus_victim", "cus_attacker");
    expect(await customerId(reqWithCookie(forged))).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    vi.useFakeTimers();
    try {
      const cookie = await customerCookie("cus_a");
      vi.advanceTimersByTime(9 * 60 * 60 * 1000);
      expect(await customerId(reqWithCookie(cookie))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops accepting a previously-valid cookie once SESSION_SECRET is rotated", async () => {
    const cookie = await customerCookie("cus_a");
    env.SESSION_SECRET = "t".repeat(32);
    expect(await customerId(reqWithCookie(cookie))).toBeNull();
  });
});
