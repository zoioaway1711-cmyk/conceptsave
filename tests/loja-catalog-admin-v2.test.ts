import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const catalog = await import("../lib/loja-catalog");
const { SEED_PRODUCTS, SEED_SETTINGS } = await import("../lib/loja-catalog-seed");
const { STORE, getProduct } = await import("../app/loja/_lib/catalog");
const { createOrder, orderAccessToken, transitionOrder } = await import("../lib/loja-orders");
const reviews = await import("../lib/loja-reviews");
const images = await import("../lib/loja-images");
const { setStock } = await import("../lib/loja-stock");
const reviewRoute = await import("../app/api/loja/orders/[id]/reviews/route");
const imageRoute = await import("../app/loja-img/[file]/route");

let db: ReturnType<typeof createFakeD1>;
beforeEach(async () => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  catalog.invalidateCatalog();
  await catalog.loadCatalog(db as never);
});

const kit = SEED_PRODUCTS.find((p) => p.slug === "kit-aplicacao-premium")!;
const edit = (slug: string, patch: Record<string, unknown> = {}) => {
  const p = getProduct(slug)!;
  return {
    name: p.name,
    presentation: p.presentation,
    category: p.category,
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
    image: p.image,
    ...patch,
  };
};

async function deliveredOrder(items = [{ slug: kit.slug, qty: 1 }], total = kit.price) {
  const r = await createOrder(db as never, {
    customer: { name: "Maria Teste Silva", email: "m@example.com", cpf: "52998224725", phone: "11987654321" },
    address: { cep: "01310100", street: "Av", number: "1", complement: "", district: "B", city: "Campinas", uf: "sp" },
    payment: { method: "pix", installments: 1 },
    items,
    expectedTotal: total,
  });
  if (!r.ok) throw new Error(`setup: ${JSON.stringify(r)}`);
  return r.id;
}
async function deliver(id: string) {
  for (const to of ["payment_approved", "preparing"] as const) expect((await transitionOrder(db as never, id, to)).ok).toBe(true);
  expect((await transitionOrder(db as never, id, "shipped", { trackingCode: "AB123456789BR" })).ok).toBe(true);
  expect((await transitionOrder(db as never, id, "delivered")).ok).toBe(true);
}

describe("real reviews", () => {
  it("migration 0026 removes every invented rating: the store starts with no reviews", async () => {
    const snap = await catalog.readCatalog(db as never);
    expect(snap.products.every((p) => p.rating === 0 && p.reviewCount === 0)).toBe(true);
    expect(snap.reviews?.latest).toEqual([]);
    expect(snap.reviews?.breakdown.every((b) => b.count === 0)).toBe(true);
  });

  it("only a delivered order can review, once per product of that order", async () => {
    const id = await deliveredOrder();
    const input = { slug: kit.slug, rating: 5, text: "Chegou bem embalado e rápido.", author: "Maria S." };
    expect(await reviews.submitReview(db as never, id, input)).toEqual({ ok: false, error: "not_delivered" });
    await deliver(id);
    expect(await reviews.submitReview(db as never, id, { ...input, slug: "diluente-bacteriostatico" })).toEqual({ ok: false, error: "not_in_order" });
    expect((await reviews.submitReview(db as never, id, input)).ok).toBe(true);
    expect(await reviews.submitReview(db as never, id, input)).toEqual({ ok: false, error: "already_reviewed" });
    expect(await reviews.orderReviewState(db as never, id)).toEqual({ [kit.slug]: "pending" });
  });

  it("nothing is public until approved; the rating is recomputed from approved reviews only", async () => {
    const a = await deliveredOrder();
    // A different cart: an identical one would be folded into `a` as a duplicate.
    const b = await deliveredOrder([{ slug: kit.slug, qty: 2 }], kit.price * 2);
    await deliver(a);
    await deliver(b);
    const ra = await reviews.submitReview(db as never, a, { slug: kit.slug, rating: 5, text: "Excelente, recomendo muito.", author: "Maria S." });
    const rb = await reviews.submitReview(db as never, b, { slug: kit.slug, rating: 2, text: "Demorou mais que o previsto.", author: "João P." });
    if (!ra.ok || !rb.ok) throw new Error("setup");

    catalog.invalidateCatalog();
    let snap = await catalog.readCatalog(db as never);
    expect(snap.products.find((p) => p.slug === kit.slug)).toMatchObject({ rating: 0, reviewCount: 0 });

    await reviews.moderateReview(db as never, ra.id, "approved", "admin");
    await reviews.moderateReview(db as never, rb.id, "approved", "admin");
    snap = await catalog.readCatalog(db as never);
    expect(snap.products.find((p) => p.slug === kit.slug)).toMatchObject({ rating: 3.5, reviewCount: 2 });
    expect(snap.reviews?.breakdown).toEqual([
      { stars: 5, count: 1 },
      { stars: 4, count: 0 },
      { stars: 3, count: 0 },
      { stars: 2, count: 1 },
      { stars: 1, count: 0 },
    ]);
    expect(snap.reviews?.latest[0]).toMatchObject({ author: expect.any(String), city: "Campinas, SP", productName: kit.name });

    await reviews.moderateReview(db as never, rb.id, "rejected", "admin");
    snap = await catalog.readCatalog(db as never);
    expect(snap.products.find((p) => p.slug === kit.slug)).toMatchObject({ rating: 5, reviewCount: 1 });
  });

  it("the public name defaults to first name + initial, never the full name", () => {
    expect(reviews.defaultAuthor("Maria Teste Silva")).toBe("Maria S.");
    expect(reviews.defaultAuthor("Ana")).toBe("Ana");
  });

  it("the customer route needs the order's token and a delivered order", async () => {
    const id = await deliveredOrder();
    const body = JSON.stringify({ slug: kit.slug, rating: 4, text: "Tudo certo com o pedido.", author: "Maria S." });
    const post = (token: string) =>
      reviewRoute.POST(new Request(`https://loja.test/api/loja/orders/${id}/reviews`, { method: "POST", headers: { "x-order-token": token, "content-type": "application/json" }, body }), {
        params: Promise.resolve({ id }),
      });
    expect((await post("0".repeat(32))).status).toBe(404);
    const token = await orderAccessToken(id);
    expect((await post(token)).status).toBe(422); // not delivered yet
    await deliver(id);
    expect((await post(token)).status).toBe(201);
    expect((await post(token)).status).toBe(409);
    const state = await reviewRoute.GET(new Request(`https://loja.test/api/loja/orders/${id}/reviews`, { headers: { "x-order-token": token } }), { params: Promise.resolve({ id }) });
    expect(await state.json()).toEqual({ canReview: true, reviewed: { [kit.slug]: "pending" }, suggestedAuthor: "Maria S." });
  });
});

// Smallest valid-looking files: the server only checks the magic bytes.
const WEBP = btoa(String.fromCharCode(...[0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]));
const PNG = btoa(String.fromCharCode(...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]));

describe("uploaded product photos", () => {
  it("stores only real WebP/JPEG bytes and serves them, cached, at /loja-img", async () => {
    const bad = await images.saveImage(db as never, { mime: "image/webp", large: { data: PNG, width: 960, height: 1280 }, small: { data: PNG, width: 480, height: 640 } }, "admin");
    expect(bad).toEqual({ ok: false, error: "invalid_image" });
    const ok = await images.saveImage(db as never, { mime: "image/webp", large: { data: WEBP, width: 960, height: 1280 }, small: { data: WEBP, width: 480, height: 640 } }, "admin");
    if (!ok.ok) throw new Error("upload");
    expect(ok.base).toMatch(images.UPLOADED_IMAGE_BASE_RE);
    const id = ok.base.slice("/loja-img/".length);
    const res = await imageRoute.GET(new Request(`https://loja.test${ok.base}-480.webp`), { params: Promise.resolve({ file: `${id}-480.webp` }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())[8]).toBe(0x57);
    const missing = await imageRoute.GET(new Request("https://loja.test/x"), { params: Promise.resolve({ file: "../../etc-480.webp" }) });
    expect(missing.status).toBe(404);
  });

  it("refuses mismatched proportions between the two sizes", async () => {
    const r = await images.saveImage(db as never, { mime: "image/webp", large: { data: WEBP, width: 960, height: 1280 }, small: { data: WEBP, width: 480, height: 480 } }, "admin");
    expect(r).toEqual({ ok: false, error: "invalid_image" });
  });

  it("a product can point only at a store photo or an uploaded one", () => {
    expect(catalog.productUpdateSchema.safeParse(edit(kit.slug, { image: { ...kit.image, base: "https://evil.example/x" } })).success).toBe(false);
    expect(catalog.productUpdateSchema.safeParse(edit(kit.slug, { image: { ...kit.image, base: "/loja-img/" + "a".repeat(32) } })).success).toBe(true);
  });
});

describe("create, delete, reorder, category", () => {
  const newProduct = (patch: Record<string, unknown> = {}) => ({ ...edit(kit.slug), slug: "gaze-esteril", sku: "gaze-esteril", brand: "Save Concept", name: "Gaze Estéril", price: 12, ...patch });

  it("creates a product at the end of the list with no reviews", async () => {
    const input = catalog.productCreateSchema.parse(newProduct());
    expect(await catalog.createProduct(db as never, input, "admin")).toEqual({ ok: true });
    const snap = await catalog.readCatalog(db as never);
    expect(snap.products.at(-1)).toMatchObject({ slug: "gaze-esteril", price: 12, rating: 0, reviewCount: 0, related: [] });
    expect(await catalog.createProduct(db as never, input, "admin")).toEqual({ error: "slug_taken" });
    expect(await catalog.createProduct(db as never, { ...input, slug: "outra" }, "admin")).toEqual({ error: "sku_taken" });
  });

  it("a new vial can't be created for online sale and always gets the label notice", async () => {
    const vial = catalog.productCreateSchema.parse(newProduct({ category: "frascos", purchasable: true }));
    expect(await catalog.createProduct(db as never, vial, "admin")).toEqual({ error: "regulated" });
    await catalog.createProduct(db as never, { ...vial, purchasable: false }, "admin");
    expect(db.raw.prepare("SELECT health_notice AS h, purchasable AS p FROM loja_products WHERE slug = 'gaze-esteril'").get()).toEqual({ h: 1, p: 0 });
  });

  it("a vial can't be moved out of its category (no way around the sale lock)", async () => {
    expect(await catalog.updateProduct(db as never, "tirzepatida-60mg", catalog.productUpdateSchema.parse(edit("tirzepatida-60mg", { category: "acessorios" })), "admin")).toEqual({
      error: "regulated_category",
    });
    expect(getProduct("tirzepatida-60mg")?.category).toBe("frascos");
    const moved = await catalog.updateProduct(db as never, "tirzepatida-60mg", catalog.productUpdateSchema.parse(edit("tirzepatida-60mg", { category: "kits" })), "admin");
    expect(moved && "changed" in moved && moved.changed).toEqual(["category"]);
  });

  it("deletes a product and its stock row; orders keep their own copy", async () => {
    const order = await deliveredOrder();
    expect(await setStock(db as never, kit.sku, 5, null, "admin")).toBe("ok");
    expect(await catalog.deleteProduct(db as never, kit.slug)).toEqual({ sku: kit.sku, name: kit.name });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ n: 0 });
    expect((await catalog.readCatalog(db as never)).products.some((p) => p.slug === kit.slug)).toBe(false);
    expect(db.raw.prepare("SELECT items_json AS i FROM loja_orders WHERE id = ?").get(order)).toMatchObject({ i: expect.stringContaining(kit.name) });
    expect(await catalog.deleteProduct(db as never, kit.slug)).toBeNull();
  });

  it("reorders only with the full, exact list of products", async () => {
    const slugs = (await catalog.readCatalog(db as never)).products.map((p) => p.slug);
    expect(await catalog.reorderProducts(db as never, slugs.slice(1), "admin")).toBe(false);
    expect(await catalog.reorderProducts(db as never, [...slugs.slice(1), "nao-existe"], "admin")).toBe(false);
    const reversed = [...slugs].reverse();
    expect(await catalog.reorderProducts(db as never, reversed, "admin")).toBe(true);
    expect((await catalog.readCatalog(db as never)).products.map((p) => p.slug)).toEqual(reversed);
  });
});

describe("home page copy", () => {
  it("falls back to the current texts and reaches the store when edited", async () => {
    expect(STORE.home.heroTitle).toBe(SEED_SETTINGS.heroTitle);
    await catalog.updateSettings(db as never, catalog.settingsSchema.parse({ ...SEED_SETTINGS, heroTitle: "Nova chamada da loja" }), "admin");
    await catalog.loadCatalog(db as never);
    expect(STORE.home.heroTitle).toBe("Nova chamada da loja");
    expect(catalog.settingsSchema.safeParse({ ...SEED_SETTINGS, heroTitle: "x".repeat(200) }).success).toBe(false);
  });
});
