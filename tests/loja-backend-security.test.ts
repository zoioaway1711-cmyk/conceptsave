import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { applySeedCatalog } from "./helpers/loja-catalog";

/*
 * Store backend hardening (round 3). One describe block per fix; see the
 * comments in each route / lib file for the reasoning.
 */

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const ordersRoute = await import("../app/api/loja/orders/route");
const orderRead = await import("../app/api/loja/orders/[id]/route");
const subscribeRoute = await import("../app/api/loja/subscribe/route");
const adminSubs = await import("../app/api/admin/loja/subscribers/route");
const adminOrder = await import("../app/api/admin/loja/orders/[id]/route");
const adminStock = await import("../app/api/admin/loja/stock/route");
const productRoute = await import("../app/api/admin/loja/catalog/products/[slug]/route");
const sitemap = await import("../app/loja/sitemap.xml/route");
const { createAdminCookie } = await import("../lib/admin-auth");
const { createOrder, getOrder } = await import("../lib/loja-orders");
const { invalidateCatalog } = await import("../lib/loja-catalog");
const { SEED_PRODUCTS } = await import("../lib/loja-catalog-seed");
const { cleanLine, cleanMultiline, isStrictEmail } = await import("../lib/text-sanitize");
const { publicOrigin } = await import("../lib/public-origin");

const ORIGIN = "https://loja.test";
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);
const BEL = String.fromCharCode(0x07);

let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  env.TELEGRAM_BOT_TOKEN = "test-token";
  env.TELEGRAM_CHAT_ID = "123";
  invalidateCatalog();
  applySeedCatalog();
  fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete env.TELEGRAM_BOT_TOKEN;
  delete env.TELEGRAM_CHAT_ID;
});

const kit = SEED_PRODUCTS.find((p) => p.slug === "kit-aplicacao-premium")!;

function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    customer: { name: "Maria Teste Silva", email: "maria@example.com", cpf: "529.982.247-25", phone: "(11) 98765-4321" },
    address: { cep: "01310-100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", uf: "SP" },
    payment: { method: "pix", installments: 1 },
    items: [{ slug: kit.slug, qty: 1 }],
    expectedTotal: kit.price,
    ...overrides,
  };
}

const postJson = (path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const placeOrder = (body: unknown) => ordersRoute.POST(postJson("/api/loja/orders", body));
const subscribe = (body: unknown) => subscribeRoute.POST(postJson("/api/loja/subscribe", body));

const count = (table: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const auditActions = () => (db.raw.prepare("SELECT action FROM audit_logs ORDER BY id").all() as { action: string }[]).map((r) => r.action);
const telegramTexts = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("api.telegram.org")).map(([, init]) => JSON.parse(init.body).text as string);

async function adminHeaders(permissions: string[]) {
  const id = `adm_${crypto.randomUUID()}`;
  db.raw
    .prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, 'owner', 'x', ?, '2026-01-01T00:00:00.000Z')")
    .run(id, JSON.stringify(permissions));
  const cookie = await createAdminCookie(id, { ip: "127.0.0.1", device: "test" });
  return { "content-type": "application/json", cookie: `__Host-vf_admin=${cookie}`, origin: ORIGIN };
}

/* 1 ─ anti-bot honeypot + minimum fill time (cross-agent contract) */
describe("anti-bot fields on POST /api/loja/orders and /api/loja/subscribe", () => {
  it("honeypot filled → 400 invalid_body, nothing stored, no Telegram, one silent LOJA_BOT_REJECTED row", async () => {
    const res = await placeOrder({ ...orderBody(), hp: "http://spam.example", elapsedMs: 60_000 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(count("loja_orders")).toBe(0);
    expect(telegramTexts()).toEqual([]);
    expect(auditActions()).toEqual(["LOJA_BOT_REJECTED"]);
    const meta = JSON.parse((db.raw.prepare("SELECT metadata_json AS m FROM audit_logs").get() as { m: string }).m);
    expect(meta).toMatchObject({ form: "order", reason: "honeypot", hpLength: 19 });
    expect(JSON.stringify(meta)).not.toContain("spam.example");
  });

  it("orders: faster than 2.5 s is rejected; slower or absent (legacy clients) is accepted", async () => {
    expect((await placeOrder({ ...orderBody(), elapsedMs: 2499 })).status).toBe(400);
    expect(count("loja_orders")).toBe(0);
    expect((await placeOrder({ ...orderBody(), hp: "", elapsedMs: 2500 })).status).toBe(201);
    const legacy = orderBody({ customer: { ...orderBody().customer, email: "outra@example.com" } });
    expect((await placeOrder(legacy)).status).toBe(201);
    expect(count("loja_orders")).toBe(2);
  });

  it("the anti-bot fields are validated and never persisted", async () => {
    expect((await placeOrder({ ...orderBody(), elapsedMs: -1 })).status).toBe(400);
    expect((await placeOrder({ ...orderBody(), elapsedMs: 1.5e3 + 0.5 })).status).toBe(400);
    expect((await placeOrder({ ...orderBody(), hp: "x".repeat(201) })).status).toBe(400);
    expect(auditActions()).toEqual([]); // schema failures are plain bad bodies
    expect((await placeOrder({ ...orderBody(), hp: "", elapsedMs: 9000 })).status).toBe(201);
    const row = JSON.stringify(db.raw.prepare("SELECT * FROM loja_orders").get());
    expect(row).not.toMatch(/elapsedMs|"hp"|9000/);
    // A tab left open for days is clamped to 24 h, never refused (the same order again → deduplicated, still 201).
    expect((await placeOrder({ ...orderBody(), elapsedMs: 3 * 86_400_000 })).status).toBe(201);
  });

  it("subscribe: honeypot or < 1.2 s → 400 and nothing stored; ≥ 1.2 s or absent → 204", async () => {
    const base = { email: "ana@example.com", kind: "news", consent: true };
    expect((await subscribe({ ...base, hp: "bot" })).status).toBe(400);
    expect((await subscribe({ ...base, elapsedMs: 1199 })).status).toBe(400);
    expect(count("loja_subscribers")).toBe(0);
    expect(auditActions()).toEqual(["LOJA_BOT_REJECTED", "LOJA_BOT_REJECTED"]);
    expect(telegramTexts()).toEqual([]);
    expect((await subscribe({ ...base, hp: "", elapsedMs: 1200 })).status).toBe(204);
    expect((await subscribe({ ...base, email: "bia@example.com" })).status).toBe(204);
    expect(count("loja_subscribers")).toBe(2);
    expect(JSON.stringify(db.raw.prepare("SELECT * FROM loja_subscribers").all())).not.toMatch(/elapsedMs|"hp"/);
  });
});

/* 2 ─ order body: strict nested objects, slug charset, finite numbers */
describe("order body schema", () => {
  it("refuses unknown nested keys, markup in slugs, Infinity, fractional qty and unknown payment methods", async () => {
    expect((await placeOrder(orderBody({ customer: { ...orderBody().customer, role: "admin" } }))).status).toBe(400);
    expect((await placeOrder(orderBody({ items: [{ slug: kit.slug, qty: 1, price: 0 }] }))).status).toBe(400);
    const echo = await placeOrder(orderBody({ items: [{ slug: "<img src=x onerror=alert(1)>", qty: 1 }] }));
    expect(echo.status).toBe(400);
    expect(await echo.text()).not.toContain("<img");
    const inf = JSON.stringify(orderBody()).replace(/"expectedTotal":[0-9.]+/, '"expectedTotal":1e999');
    expect((await placeOrder(inf)).status).toBe(400);
    expect((await placeOrder(orderBody({ items: [{ slug: kit.slug, qty: 1.5 }] }))).status).toBe(400);
    expect((await placeOrder(orderBody({ payment: { method: "crypto", installments: 1 } }))).status).toBe(400);
    expect(count("loja_orders")).toBe(0);
  });
});

/* 3 ─ CPF / phone / CEP / e-mail format beyond the shared digit checks */
describe("strict contact formats", () => {
  it("rejects letters mixed into CPF/phone/CEP, over-long phones and e-mails with list-smuggling characters", async () => {
    const r = await placeOrder(
      orderBody({
        customer: { name: "Maria Teste Silva", email: 'a"b,c@example.com', cpf: "abc529.982.247-25", phone: "11987654321123456789" },
        address: { ...orderBody().address, cep: "01310-100x" },
      }),
    );
    expect(r.status).toBe(422);
    const { detail } = (await r.json()) as { detail: { fields: Record<string, string> } };
    expect(Object.keys(detail.fields).sort()).toEqual(["cep", "cpf", "email", "phone"]);
    expect(count("loja_orders")).toBe(0);
  });

  it("isStrictEmail accepts normal and IDN addresses only", () => {
    expect(isStrictEmail("maria.silva+loja@example.com.br")).toBe(true);
    expect(isStrictEmail("o'brien@example.com")).toBe(true);
    expect(isStrictEmail("ana@exemplo-ção.com.br")).toBe(true);
    for (const bad of ["a<b>@x.com", "a,b@x.com", "a@b", "a@-x.com", "a b@x.com", "a@x.c0m"]) expect(isStrictEmail(bad)).toBe(false);
  });
});

/* 4 ─ invisible / bidi / control characters in stored customer text */
describe("free-text normalization", () => {
  it("strips bidi overrides, zero-width and control characters before storing an order", async () => {
    const res = await placeOrder(
      orderBody({
        customer: { ...orderBody().customer, name: `Maria${ZWSP} Teste${BEL}  Silva`, email: `MARIA${ZWSP}@Example.com` },
        address: { ...orderBody().address, street: `Rua ${RLO}0001 A`, complement: `apto${ZWSP} 12` },
      }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const order = await getOrder(db as never, id);
    expect(order?.customer.name).toBe("Maria Teste Silva");
    expect(order?.customer.email).toBe("maria@example.com");
    expect(order?.address.street).toBe("Rua 0001 A");
    expect(order?.address.complement).toBe("apto 12");
  });

  it("subscribe stores one normalized e-mail, so zero-width variants can't duplicate the list", async () => {
    expect((await subscribe({ email: "ana@example.com", kind: "news", consent: true })).status).toBe(204);
    expect((await subscribe({ email: `An${ZWSP}a@Example.com`, kind: "news", consent: true })).status).toBe(204);
    expect(db.raw.prepare("SELECT email FROM loja_subscribers").all()).toEqual([{ email: "ana@example.com" }]);
  });

  it("cleanLine / cleanMultiline", () => {
    expect(cleanLine(`  a${RLO}b\t\n c  `)).toBe("ab c");
    expect(cleanMultiline(`linha 1${ZWSP}\r\n\r\n\r\n\r\nlinha  2 `)).toBe("linha 1\n\nlinha 2");
  });
});

/* 5 ─ duplicate order protection */
describe("duplicate submissions", () => {
  it("an identical re-submission returns the same order (201, same token) without a second row or alert", async () => {
    const first = await placeOrder(orderBody());
    const second = await placeOrder(orderBody());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a = (await first.json()) as { id: string; token: string };
    const b = (await second.json()) as { id: string; token: string };
    expect(b).toEqual(a);
    expect(count("loja_orders")).toBe(1);
    expect(telegramTexts()).toHaveLength(1);
  });

  it("anything different (e.g. another CPF) is a new order", async () => {
    await placeOrder(orderBody());
    const other = await placeOrder(orderBody({ customer: { ...orderBody().customer, cpf: "111.444.777-35" } }));
    expect(other.status).toBe(201);
    expect(count("loja_orders")).toBe(2);
  });

  it("a paid (no longer 'received') order is never returned as a duplicate", async () => {
    const r = await createOrder(db as never, orderBody() as never);
    if (!r.ok) throw new Error("setup");
    db.raw.prepare("UPDATE loja_orders SET status = 'payment_approved'").run();
    const again = await createOrder(db as never, orderBody() as never);
    expect(again.ok && again.id).not.toBe(r.id);
  });
});

/* 6 ─ Telegram flood cap for new-order alerts */
describe("new-order Telegram alerts", () => {
  it("past 30/hour store-wide, sends one 'paused' notice and then stays quiet (orders still created)", async () => {
    const windowMs = 3600 * 1000;
    const bucket = Math.floor(Date.now() / windowMs);
    db.raw.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 30, ?)").run(`loja_order_alert:all:${bucket}`, (bucket + 1) * windowMs);
    expect((await placeOrder(orderBody())).status).toBe(201);
    expect((await placeOrder(orderBody({ customer: { ...orderBody().customer, email: "b@example.com" } }))).status).toBe(201);
    const texts = telegramTexts();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("Alertas por pedido pausados");
    expect(count("loja_orders")).toBe(2);
  });

  it("the per-order alert carries no customer data", async () => {
    await placeOrder(orderBody());
    const [text] = telegramTexts();
    expect(text).not.toMatch(/Maria|maria@|98765|529|Paulista|01310/);
  });
});

/* 7 ─ order read: private, no-referrer, noindex on every answer */
describe("GET /api/loja/orders/[id] headers", () => {
  it("sets no-store / no-referrer / noindex on success and on 404", async () => {
    const created = (await (await placeOrder(orderBody())).json()) as { id: string; token: string };
    const ok = await orderRead.GET(new Request(`${ORIGIN}/api/loja/orders/${created.id}?t=${created.token}`), { params: Promise.resolve({ id: created.id }) });
    const missing = await orderRead.GET(new Request(`${ORIGIN}/api/loja/orders/${created.id}?t=${"0".repeat(32)}`), { params: Promise.resolve({ id: created.id }) });
    for (const res of [ok, missing]) {
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("cache-control")).toContain("private");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-robots-tag")).toContain("noindex");
    }
    expect(ok.status).toBe(200);
    expect(missing.status).toBe(404);
  });
});

/* 8 ─ subscriber list export: audited + capped per admin */
describe("admin subscriber list", () => {
  it("every read is audit-logged (silently) and the 31st read in an hour is refused", async () => {
    const headers = await adminHeaders(["admin.store.orders"]);
    await subscribe({ email: "ana@example.com", kind: "news", consent: true });
    const first = await adminSubs.GET(new Request(`${ORIGIN}/api/admin/loja/subscribers`, { headers }));
    expect(first.status).toBe(200);
    const row = db.raw.prepare("SELECT action, metadata_json AS m FROM audit_logs WHERE action = 'STORE_SUBSCRIBERS_LISTED'").get() as { action: string; m: string };
    expect(JSON.parse(row.m)).toEqual({ count: 1 });
    expect(telegramTexts().some((t) => t.includes("STORE_SUBSCRIBERS_LISTED"))).toBe(false);
    for (let i = 0; i < 29; i++) await adminSubs.GET(new Request(`${ORIGIN}/api/admin/loja/subscribers`, { headers }));
    const blocked = await adminSubs.GET(new Request(`${ORIGIN}/api/admin/loja/subscribers`, { headers }));
    expect(blocked.status).toBe(429);
    expect(auditActions()).toContain("STORE_SUBSCRIBERS_LIST_RATE_LIMITED");
  });
});

/* 9 ─ regulatory lock: vials / vial kits never purchasable */
describe("regulated categories", () => {
  const vial = SEED_PRODUCTS.find((p) => p.slug === "tirzepatida-60mg")!;
  const edit = (p: (typeof SEED_PRODUCTS)[number], patch: Record<string, unknown>) => ({
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
  });

  it("the admin API refuses to make a vial purchasable (422 on the purchasable field, audit row, DB unchanged)", async () => {
    const headers = await adminHeaders(["admin.store.catalog"]);
    const res = await productRoute.PUT(
      new Request(`${ORIGIN}/api/admin/loja/catalog/products/${vial.slug}`, { method: "PUT", headers, body: JSON.stringify(edit(vial, { purchasable: true })) }),
      { params: Promise.resolve({ slug: vial.slug }) },
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { fields: Record<string, string> }).fields.purchasable).toMatch(/regulat/);
    expect(db.raw.prepare("SELECT purchasable FROM loja_products WHERE slug = ?").get(vial.slug)).toEqual({ purchasable: 0 });
    expect(auditActions()).toContain("STORE_PRODUCT_REGULATED_BLOCKED");
  });

  it("createOrder refuses a vial even if its row was flipped to purchasable directly in the DB", async () => {
    db.raw.prepare("UPDATE loja_products SET purchasable = 1 WHERE category IN ('frascos', 'kits')").run();
    invalidateCatalog();
    const r = await createOrder(db as never, orderBody({ items: [{ slug: vial.slug, qty: 1 }], expectedTotal: vial.price }) as never);
    expect(r).toMatchObject({ ok: false, error: { code: "not_purchasable" } });
    expect(count("loja_orders")).toBe(0);
  });

  it("accessories stay editable and purchasable", async () => {
    const headers = await adminHeaders(["admin.store.catalog"]);
    const res = await productRoute.PUT(
      new Request(`${ORIGIN}/api/admin/loja/catalog/products/${kit.slug}`, { method: "PUT", headers, body: JSON.stringify(edit(kit, { name: `Kit${ZWSP} de Aplicação ${RLO}Premium` })) }),
      { params: Promise.resolve({ slug: kit.slug }) },
    );
    expect(res.status).toBe(200);
    // 12 ─ catalog text published on every store page is normalized too.
    expect(db.raw.prepare("SELECT name FROM loja_products WHERE slug = ?").get(kit.slug)).toEqual({ name: "Kit de Aplicação Premium" });
  });
});

/* 10 ─ admin order PATCH / reveal input */
describe("admin order status update", () => {
  it("tracking codes must look like tracking codes; spaces are dropped and the code uppercased", async () => {
    const headers = await adminHeaders(["admin.store.orders"]);
    const r = await createOrder(db as never, orderBody() as never);
    if (!r.ok) throw new Error("setup");
    const patch = (body: unknown, id = r.id) =>
      adminOrder.PATCH(new Request(`${ORIGIN}/api/admin/loja/orders/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    expect((await patch({ status: "payment_approved" })).status).toBe(200);
    expect((await patch({ status: "preparing" })).status).toBe(200);
    const phishing = await patch({ status: "shipped", trackingCode: "Pague via Pix para a chave 11999999999" });
    expect(phishing.status).toBe(400);
    expect(await phishing.json()).toEqual({ error: "invalid_tracking_code" });
    expect((await patch({ status: "shipped", trackingCode: "<b>AB</b>" })).status).toBe(400);
    expect((await patch({ status: "shipped", trackingCode: "ABCDEFGH12" })).status).toBe(400);
    expect((await patch({ status: "shipped", trackingCode: "ab 123 456 789 br", extra: 1 })).status).toBe(400);
    const ok = await patch({ status: "shipped", trackingCode: "ab 123 456 789 br" });
    expect(ok.status).toBe(200);
    expect((await getOrder(db as never, r.id))?.trackingCode).toBe("AB123456789BR");
    expect((await patch({ status: "delivered" }, "../../etc")).status).toBe(404);
  });

  it("stock changes are audited with the previous value", async () => {
    const headers = await adminHeaders(["admin.store.orders"]);
    const put = (body: unknown) => adminStock.PUT(new Request(`${ORIGIN}/api/admin/loja/stock`, { method: "PUT", headers, body: JSON.stringify(body) }));
    expect((await put({ sku: kit.sku, quantity: 5, expected: null })).status).toBe(200);
    expect((await put({ sku: kit.sku, quantity: 2, expected: 5 })).status).toBe(200);
    expect((await put({ sku: "Kit<script>", quantity: 2, expected: 5 })).status).toBe(400);
    const metas = (db.raw.prepare("SELECT metadata_json AS m FROM audit_logs WHERE action = 'STORE_STOCK_SET' ORDER BY id").all() as { m: string }[]).map((x) => JSON.parse(x.m));
    expect(metas).toEqual([{ from: null, quantity: 5 }, { from: 5, quantity: 2 }]);
  });
});

/* 11 ─ public origin: never reflects a malformed Host into sitemap / robots */
describe("publicOrigin / sitemap", () => {
  it("falls back to the request URL's host when the Host header isn't a valid host name", async () => {
    const req = (host: string) => new Request(`${ORIGIN}/loja/sitemap.xml`, { headers: { host } });
    expect(publicOrigin(req("loja.test"))).toBe("https://loja.test");
    expect(publicOrigin(req("Loja.Test:8443"))).toBe("https://loja.test:8443");
    expect(publicOrigin(req('evil.example"><x>'))).toBe("https://loja.test");
    expect(publicOrigin(req("evil.example/phish?"))).toBe("https://loja.test");
    const xml = await (await sitemap.GET(req("a<b>.example"))).text();
    expect(xml).not.toContain("<b>");
    expect(xml).toContain("<loc>https://loja.test/loja</loc>");
  });
});

/* 12 ─ catalog admin writes: bounded body, strict keys, sanitized text */
describe("catalog admin body limits", () => {
  it("refuses oversized and unknown-key product bodies", async () => {
    const headers = await adminHeaders(["admin.store.catalog"]);
    const put = (body: string) =>
      productRoute.PUT(new Request(`${ORIGIN}/api/admin/loja/catalog/products/${kit.slug}`, { method: "PUT", headers, body }), { params: Promise.resolve({ slug: kit.slug }) });
    expect((await put(JSON.stringify({ padding: "x".repeat(20_000) }))).status).toBe(400);
    const p = SEED_PRODUCTS.find((x) => x.slug === kit.slug)!;
    const valid = { name: p.name, presentation: p.presentation, summary: p.summary, description: p.description, price: p.price, oldPrice: p.oldPrice ?? null, badge: p.badge ?? null, specs: p.specs, freeShipping: p.freeShipping, available: p.available, purchasable: p.purchasable, coldChain: p.coldChain };
    expect((await put(JSON.stringify({ ...valid, sku: "hijack" }))).status).toBe(422);
    expect((await put(JSON.stringify({ ...valid, description: `Linha 1${BEL}\n\n\n\nLinha 2` }))).status).toBe(200);
    expect(db.raw.prepare("SELECT description FROM loja_products WHERE slug = ?").get(kit.slug)).toEqual({ description: "Linha 1\n\nLinha 2" });
  });
});
