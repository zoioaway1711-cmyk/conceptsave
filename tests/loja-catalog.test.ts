import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { invalidateCatalog, loadCatalog, productUpdateSchema, readCatalog, settingsSchema, updateProduct, updateSettings } = await import("../lib/loja-catalog");
const { SEED_PRODUCTS, SEED_SETTINGS } = await import("../lib/loja-catalog-seed");
const { STORE, getProduct } = await import("../app/loja/_lib/catalog");
const { createOrder } = await import("../lib/loja-orders");
const productRoute = await import("../app/api/admin/loja/catalog/products/[slug]/route");
const settingsRoute = await import("../app/api/admin/loja/catalog/settings/route");
const catalogRoute = await import("../app/api/admin/loja/catalog/route");

let db: ReturnType<typeof createFakeD1>;
beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  invalidateCatalog();
});

const edit = (slug: string, patch: Record<string, unknown> = {}) => {
  const p = SEED_PRODUCTS.find((x) => x.slug === slug)!;
  return {
    name: p.name,
    presentation: p.presentation,
    summary: p.summary,
    description: p.description,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    badge: p.badge ?? null,
    specs: p.specs,
    freeShipping: p.freeShipping,
    available: p.available,
    purchasable: p.purchasable,
    coldChain: p.coldChain,
    ...patch,
  };
};

describe("catalog in D1", () => {
  it("migration 0015 seeded exactly the catalog that used to be hardcoded", async () => {
    const snap = await readCatalog(db as never);
    // 0017 appends accessories after them (higher sort_order); the seed itself is untouched.
    expect(snap.products.slice(0, SEED_PRODUCTS.length)).toEqual(SEED_PRODUCTS);
    expect(snap.settings).toEqual(SEED_SETTINGS);
  });

  it("migration 0017 adds only accessories, with no invented reviews and an image that exists", async () => {
    const snap = await readCatalog(db as never);
    const added = snap.products.slice(SEED_PRODUCTS.length);
    expect(added.map((p) => p.slug)).toEqual([
      "seringas-1ml-31g",
      "agulhas-caneta-32g-4mm",
      "lencos-alcool-70",
      "coletor-perfurocortantes-1-5l",
      "bolsa-termica-gel",
    ]);
    const { existsSync } = await import("node:fs");
    for (const p of added) {
      expect(p.category).toBe("acessorios");
      expect(p.reviewCount).toBe(0);
      expect(p.rating).toBe(0);
      expect(existsSync(`public${p.image.base}-960.webp`) && existsSync(`public${p.image.base}-480.webp`)).toBe(true);
      for (const slug of [...p.related, ...p.boughtTogether]) expect(snap.products.some((q) => q.slug === slug)).toBe(true);
    }
  });

  it("loadCatalog fills the registry (products + derived store settings)", async () => {
    await loadCatalog(db as never);
    expect(getProduct("diluente-bacteriostatico")?.price).toBe(89);
    expect(STORE.delivery.window).toBe(SEED_SETTINGS.deliveryWindow);
    expect(STORE.payment.find((p) => p.id === "cartao")?.detail).toBe("Em até 3x sem juros.");
  });

  it("an admin price change is what the server charges on the next order", async () => {
    await updateProduct(db as never, "diluente-bacteriostatico", edit("diluente-bacteriostatico", { price: 95 }), "admin");
    await loadCatalog(db as never);
    const base = {
      customer: { name: "Maria Teste Silva", email: "m@example.com", cpf: "52998224725", phone: "11987654321" },
      address: { cep: "01310100", street: "Av", number: "1", complement: "", district: "B", city: "São Paulo", uf: "SP" },
      payment: { method: "pix" as const, installments: 1 },
      items: [{ slug: "diluente-bacteriostatico", qty: 1 }],
    };
    expect((await createOrder(db as never, { ...base, expectedTotal: 89 })).ok).toBe(false); // stale page price
    expect((await createOrder(db as never, { ...base, expectedTotal: 95 })).ok).toBe(true);
  });

  it("rejects an old price that isn't above the current one (schema and DB CHECK)", () => {
    expect(productUpdateSchema.safeParse(edit("kit-aplicacao-premium", { oldPrice: 100 })).success).toBe(false);
    expect(() =>
      db.raw.prepare("UPDATE loja_products SET old_price = 10 WHERE slug = 'kit-aplicacao-premium'").run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("settings validation: only real wa.me / instagram links and valid e-mails", () => {
    expect(settingsSchema.safeParse({ ...SEED_SETTINGS, whatsappUrl: "https://evil.example/x" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...SEED_SETTINGS, whatsappUrl: "https://wa.me/5511999999999" }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...SEED_SETTINGS, privacyEmail: "nope" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...SEED_SETTINGS, maxInstallments: 0 }).success).toBe(false);
  });

  it("settings updates reach the store after the cache is invalidated", async () => {
    await updateSettings(db as never, { ...SEED_SETTINGS, supportEmail: "contato@example.com", maxInstallments: 6 }, "admin");
    await loadCatalog(db as never);
    expect(STORE.supportEmail).toBe("contato@example.com");
    expect(STORE.payment.find((p) => p.id === "cartao")?.detail).toBe("Em até 6x sem juros.");
  });

  it("regression: card installments follow the LIVE setting (not a value frozen at module load)", async () => {
    const base = {
      customer: { name: "Maria Teste Silva", email: "m@example.com", cpf: "52998224725", phone: "11987654321" },
      address: { cep: "01310100", street: "Av", number: "1", complement: "", district: "B", city: "São Paulo", uf: "SP" },
      items: [{ slug: "kit-aplicacao-premium", qty: 1 }],
      expectedTotal: 219,
    };
    expect((await createOrder(db as never, { ...base, payment: { method: "cartao", installments: 3 } })).ok).toBe(true);
    const over = await createOrder(db as never, { ...base, payment: { method: "cartao", installments: 4 } });
    expect(over.ok).toBe(false);
    if (!over.ok && over.error.code === "invalid_fields") expect(over.error.fields.installments).toMatch(/até 3x/);
    // The HTTP schema itself must accept 3x too (it used to reject anything > 1).
    const { orderCreateSchema } = await import("../lib/loja-orders");
    expect(orderCreateSchema.safeParse({ ...base, payment: { method: "cartao", installments: 3 } }).success).toBe(true);
  });

  it("regression: a missing/invalid setting falls back instead of taking the store down", async () => {
    db.raw.prepare("DELETE FROM loja_settings WHERE key = 'returns'").run();
    db.raw.prepare("UPDATE loja_settings SET value_json = 'not json' WHERE key = 'deliveryWindow'").run();
    const snap = await readCatalog(db as never);
    expect(snap.settings.returns).toBe(SEED_SETTINGS.returns);
    expect(snap.settings.deliveryWindow).toBe(SEED_SETTINGS.deliveryWindow);
  });

  it("regression: stock/subscribe load the catalog themselves and reject unknown SKUs", async () => {
    const { setStock } = await import("../lib/loja-stock");
    const { subscribe } = await import("../lib/loja-subscribers");
    expect(await setStock(db as never, "nao-existe", 3, null, "admin")).toBe("unknown_sku");
    expect(await setStock(db as never, "kit-aplicacao-premium", 3, null, "admin")).toBe("ok");
    // Stale view (someone changed it meanwhile) → refused, value untouched.
    expect(await setStock(db as never, "kit-aplicacao-premium", 10, 5, "admin")).toBe("conflict");
    expect(await setStock(db as never, "kit-aplicacao-premium", 10, null, "admin")).toBe("conflict");
    expect(await setStock(db as never, "kit-aplicacao-premium", 10, 3, "admin")).toBe("ok");
    expect(await subscribe(db as never, { email: "a@example.com", kind: "restock", sku: "nao-existe", consent: true })).toBe(false);
  });

  it("admin catalog routes require an admin session", async () => {
    expect((await catalogRoute.GET(new Request("https://loja.test/api/admin/loja/catalog"))).status).toBe(401);
    const put = new Request("https://loja.test/x", { method: "PUT", body: JSON.stringify(edit("kit-aplicacao-premium")) });
    expect((await productRoute.PUT(put, { params: Promise.resolve({ slug: "kit-aplicacao-premium" }) })).status).toBe(401);
    expect((await settingsRoute.PUT(new Request("https://loja.test/x", { method: "PUT", body: JSON.stringify(SEED_SETTINGS) }))).status).toBe(401);
  });
});
