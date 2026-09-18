import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { seedLicense, seedMaterial, upsertProfile } from "./helpers/seed";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { POST } = await import("../app/api/verifications/route");
const { customerCookie } = await import("../lib/customer-auth");

let db: ReturnType<typeof createFakeD1>;
let materialId: number;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  materialId = seedMaterial(db, { prefixCode: "PROD", name: "Product Material" });
  upsertProfile(db, "cus_viewer");
});

async function postAsProfile(serial: string, body: Record<string, unknown> = {}) {
  const cookie = await customerCookie("cus_viewer");
  return POST(new Request("https://verificafarma.example/api/verifications", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `vf_customer=${cookie}`, origin: "https://verificafarma.example" },
    body: JSON.stringify({ serial, ...body }),
  }));
}

describe("POST /api/verifications — product enrichment and cross-ownership handling", () => {
  it("returns not_found with a null product for an unknown serial", async () => {
    const response = await postAsProfile("PROD-AAAA-BBBB-CCCC-DDDD");
    const body = await response.json() as { status: string; product: unknown };
    expect(body.status).toBe("not_found");
    expect(body.product).toBeNull();
  });

  it("claims a fresh license and returns the material name/serial as `product`", async () => {
    const serial = "PROD-1111-2222-3333-4444";
    await seedLicense(db, materialId, { serial });
    const response = await postAsProfile(serial);
    const body = await response.json() as { status: string; credited: boolean; product: { name: string; serial: string } };
    expect(body.status).toBe("active");
    expect(body.credited).toBe(true);
    expect(body.product.name).toBe("Product Material");
    expect(body.product.serial).toContain("••••");
    expect(body.product.serial).not.toBe(serial);
  });

  it("marks a license already owned by a different profile as unavailable, without crediting", async () => {
    const serial = "PROD-5555-6666-7777-8888";
    await seedLicense(db, materialId, { serial, ownerProfileId: "cus_someone_else" });
    const response = await postAsProfile(serial);
    const body = await response.json() as { status: string; credited: boolean };
    expect(body.status).toBe("unavailable");
    expect(body.credited).toBe(false);
  });

  it("rejects a profileId in the body that doesn't match the session", async () => {
    const response = await postAsProfile("PROD-9999-0000-1234-5678", { profileId: "cus_someone_else" });
    expect(response.status).toBe(403);
  });
});
