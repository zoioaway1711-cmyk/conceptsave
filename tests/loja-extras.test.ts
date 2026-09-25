import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { applySeedCatalog } from "./helpers/loja-catalog";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const subscribeRoute = await import("../app/api/loja/subscribe/route");
const adminSubs = await import("../app/api/admin/loja/subscribers/route");
const adminSummary = await import("../app/api/admin/loja/summary/route");
const sitemap = await import("../app/loja/sitemap.xml/route");
const robots = await import("../app/robots.txt/route");
const { listSubscribers } = await import("../lib/loja-subscribers");
const { createOrder, ordersSummary, transitionOrder } = await import("../lib/loja-orders");
const { OPT_IN_TEXT } = await import("../app/loja/_lib/consent-texts");

let db: ReturnType<typeof createFakeD1>;
beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  applySeedCatalog();
});

const post = (body: unknown) => subscribeRoute.POST(new Request("https://loja.test/api/loja/subscribe", { method: "POST", body: JSON.stringify(body) }));

describe("e-mail opt-ins", () => {
  it("requires explicit consent and a valid e-mail", async () => {
    expect((await post({ email: "ana@example.com", kind: "news" })).status).toBe(400);
    expect((await post({ email: "ana@example.com", kind: "news", consent: false })).status).toBe(400);
    expect((await post({ email: "not-an-email", kind: "news", consent: true })).status).toBe(400);
  });

  it("restock needs a real SKU; stores the exact consent wording; duplicates are silent", async () => {
    expect((await post({ email: "ana@example.com", kind: "restock", sku: "nope", consent: true })).status).toBe(400);
    expect((await post({ email: "Ana@Example.com", kind: "restock", sku: "kit-aplicacao-premium", consent: true })).status).toBe(204);
    expect((await post({ email: "ana@example.com", kind: "restock", sku: "kit-aplicacao-premium", consent: true })).status).toBe(204);
    const rows = await listSubscribers(db as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "ana@example.com", kind: "restock", sku: "kit-aplicacao-premium", consentText: OPT_IN_TEXT.restock });
  });

  it("admin list/delete require a session", async () => {
    expect((await adminSubs.GET(new Request("https://loja.test/api/admin/loja/subscribers"))).status).toBe(401);
    expect((await adminSubs.DELETE(new Request("https://loja.test/api/admin/loja/subscribers?id=1", { method: "DELETE" }))).status).toBe(401);
    expect((await adminSummary.GET(new Request("https://loja.test/api/admin/loja/summary"))).status).toBe(401);
  });
});

describe("orders summary", () => {
  it("separates awaiting payment from confirmed revenue", async () => {
    const base = {
      customer: { name: "Maria Teste Silva", email: "m@example.com", cpf: "52998224725", phone: "11987654321" },
      address: { cep: "01310100", street: "Av", number: "1", complement: "", district: "B", city: "São Paulo", uf: "SP" },
      payment: { method: "pix" as const, installments: 1 },
    };
    const a = await createOrder(db as never, { ...base, items: [{ slug: "diluente-bacteriostatico", qty: 1 }], expectedTotal: 89 });
    await createOrder(db as never, { ...base, items: [{ slug: "kit-aplicacao-premium", qty: 1 }], expectedTotal: 219 });
    if (!a.ok) throw new Error("setup");
    await transitionOrder(db as never, a.id, "payment_approved");
    const s = await ordersSummary(db as never);
    expect(s.awaitingPayment).toEqual({ n: 1, value: 219 });
    expect(s.confirmed).toEqual({ n: 1, value: 89 });
    expect(s.toShip.n).toBe(1);
  });
});

describe("sitemap / robots", () => {
  it("ignores an unverified x-vf-forwarded-host (no cache poisoning)", async () => {
    const res = await sitemap.GET(new Request("https://loja.test/loja/sitemap.xml", { headers: { host: "loja.test", "x-vf-forwarded-host": "evil.example" } }));
    const xml = await res.text();
    expect(xml).toContain("https://loja.test/loja/produto/");
    expect(xml).not.toContain("evil.example");
    expect(xml).not.toMatch(/checkout|carrinho|conta|pedido/);
  });

  it("robots never names the admin console path", async () => {
    const txt = await (await robots.GET(new Request("https://loja.test/robots.txt", { headers: { host: "loja.test" } }))).text();
    expect(txt).toContain("Sitemap: https://loja.test/loja/sitemap.xml");
    expect(txt).not.toMatch(/sc-629f1dc76b|admin/);
  });
});
