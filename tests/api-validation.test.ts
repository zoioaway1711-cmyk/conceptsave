import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { isSameOrigin, adminProfileSchema, profileSchema, licenseCheckSchema, materialCreateSchema } = await import("../lib/api-validation");

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("isSameOrigin", () => {
  it("allows a request with no Origin/Referer (e.g. same-site fetch in some browsers)", () => {
    expect(isSameOrigin(req("https://verificafarma.example/api/verifications"))).toBe(true);
  });

  it("allows a matching Origin", () => {
    expect(isSameOrigin(req("https://verificafarma.example/api/verifications", { origin: "https://verificafarma.example" }))).toBe(true);
  });

  it("rejects a cross-site Origin — the CSRF case", () => {
    expect(isSameOrigin(req("https://verificafarma.example/api/verifications", { origin: "https://attacker.example" }))).toBe(false);
  });

  it("falls back to Referer when Origin is absent and rejects a cross-site one", () => {
    expect(isSameOrigin(req("https://verificafarma.example/api/verifications", { referer: "https://attacker.example/phish" }))).toBe(false);
  });
});

describe("mass-assignment resistance of the request schemas", () => {
  it("adminProfileSchema strips fields that aren't part of the allowlisted shape (e.g. a forged role)", () => {
    const result = adminProfileSchema.safeParse({ id: "cus_1", isSuperAdmin: true, points: 10 });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("isSuperAdmin");
  });

  it("adminProfileSchema no longer accepts serials/revokedSerials — revocation is only via the licenses endpoint now", () => {
    const result = adminProfileSchema.safeParse({ id: "cus_1", serials: ["x"], revokedSerials: ["y"] });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("serials");
    expect(result.data).not.toHaveProperty("revokedSerials");
  });

  it("profileSchema drops unknown fields like a forged points/level override", () => {
    const result = profileSchema.safeParse({ id: "cus_1", points: 999999, level: 5 });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("points");
    expect(result.data).not.toHaveProperty("level");
  });

  it("licenseCheckSchema rejects a malformed serial", () => {
    expect(licenseCheckSchema.safeParse({ serial: "not-a-real-serial" }).success).toBe(false);
  });

  it("licenseCheckSchema accepts a well-formed serial and normalizes it to uppercase", () => {
    const result = licenseCheckSchema.safeParse({ serial: "cura-aaaa-bbbb-cccc-dddd" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.serial).toBe("CURA-AAAA-BBBB-CCCC-DDDD");
  });

  it("licenseCheckSchema drops unknown top-level fields such as a forged `credited` flag", () => {
    const result = licenseCheckSchema.safeParse({ serial: "CURA-AAAA-BBBB-CCCC-DDDD", credited: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("credited");
  });

  it("licenseCheckSchema rejects an oversized metadata payload", () => {
    const result = licenseCheckSchema.safeParse({ serial: "CURA-AAAA-BBBB-CCCC-DDDD", metadata: { blob: "x".repeat(7000) } });
    expect(result.success).toBe(false);
  });

  it("materialCreateSchema rejects a prefix code that isn't 2-10 uppercase letters/digits", () => {
    expect(materialCreateSchema.safeParse({ name: "X", prefixCode: "a" }).success).toBe(false);
    expect(materialCreateSchema.safeParse({ name: "X", prefixCode: "-BAD-" }).success).toBe(false);
    expect(materialCreateSchema.safeParse({ name: "X", prefixCode: "cura" }).success).toBe(true);
  });
});
