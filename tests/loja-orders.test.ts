import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { applySeedCatalog } from "./helpers/loja-catalog";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { createOrder, decryptCpf, getOrder, listOrders, orderAccessToken, publicOrderView, transitionOrder, verifyOrderAccessToken } = await import("../lib/loja-orders");
const { setStock } = await import("../lib/loja-stock");
const { getProduct } = await import("../app/loja/_lib/catalog");
applySeedCatalog();

let db: ReturnType<typeof createFakeD1>;
beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  applySeedCatalog();
});

const kit = getProduct("kit-aplicacao-premium")!;

function input(overrides: Record<string, unknown> = {}) {
  return {
    customer: { name: "Maria Teste Silva", email: "Maria@Example.com", cpf: "529.982.247-25", phone: "(11) 98765-4321" },
    address: { cep: "01310-100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", uf: "sp" },
    payment: { method: "pix" as const, installments: 1 },
    items: [{ slug: kit.slug, qty: 2 }],
    expectedTotal: kit.price * 2,
    ...overrides,
  };
}

describe("createOrder", () => {
  it("creates an order priced by the server catalog, CPF encrypted, status received", async () => {
    const r = await createOrder(db as never, input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.number).toMatch(/^SC\d{6}-[A-Z2-9]{4}$/);
    const order = await getOrder(db as never, r.id);
    expect(order?.status).toBe("received");
    expect(order?.total).toBe(kit.price * 2);
    expect(order?.customer.email).toBe("maria@example.com");
    expect(order?.address.uf).toBe("SP");
    expect(order?.history).toHaveLength(1);
    const raw = db.raw.prepare("SELECT customer_cpf_encrypted AS enc, cpf_last2 AS last2 FROM loja_orders").get() as { enc: string; last2: string };
    expect(raw.enc).not.toContain("52998224725");
    expect(await decryptCpf(raw.enc)).toBe("52998224725");
    expect(raw.last2).toBe("25");
  });

  it("refuses products that aren't sold online (vials) server-side", async () => {
    const r = await createOrder(db as never, input({ items: [{ slug: "tirzepatida-60mg", qty: 1 }], expectedTotal: 1290 }));
    expect(r).toEqual({ ok: false, error: { code: "not_purchasable", skus: ["tirzepatida-60-individual"] } });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM loja_orders").get()).toEqual({ n: 0 });
  });

  it("answers price_changed instead of charging a total the shopper didn't see", async () => {
    const r = await createOrder(db as never, input({ expectedTotal: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("price_changed");
  });

  it("re-validates every field server-side with the checkout rules", async () => {
    const r = await createOrder(db as never, input({ customer: { name: "Maria", email: "x", cpf: "111.111.111-11", phone: "(20) 98765-4321" } }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "invalid_fields") expect(Object.keys(r.error.fields).sort()).toEqual(["cpf", "email", "name", "phone"]);
  });

  it("checks stock at creation but does NOT reserve it (unpaid orders can't sell the store out)", async () => {
    await setStock(db as never, kit.sku, 3, null, "test");
    for (let i = 0; i < 3; i++) expect((await createOrder(db as never, input())).ok).toBe(true);
    // Three unpaid orders of 2 each: stock untouched.
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 3 });
    const over = await createOrder(db as never, input({ items: [{ slug: kit.slug, qty: 4 }], expectedTotal: kit.price * 4 }));
    expect(over).toEqual({ ok: false, error: { code: "out_of_stock", skus: [kit.sku] } });
  });
});

describe("order transitions", () => {
  it("follows the allowed flow, requires tracking to ship, and records history", async () => {
    const r = await createOrder(db as never, input());
    if (!r.ok) throw new Error("setup");
    expect((await transitionOrder(db as never, r.id, "shipped")).ok).toBe(false);
    expect((await transitionOrder(db as never, r.id, "payment_approved")).ok).toBe(true);
    expect((await transitionOrder(db as never, r.id, "preparing")).ok).toBe(true);
    expect(await transitionOrder(db as never, r.id, "shipped")).toEqual({ ok: false, error: "tracking_required" });
    const shipped = await transitionOrder(db as never, r.id, "shipped", { trackingCode: "AB123456789BR" });
    expect(shipped.ok && shipped.order.trackingCode).toBe("AB123456789BR");
    expect(await transitionOrder(db as never, r.id, "cancelled")).toEqual({ ok: false, error: "invalid_transition" });
    const order = await getOrder(db as never, r.id);
    expect(order?.history.map((h) => h.status)).toEqual(["received", "payment_approved", "preparing", "shipped"]);
  });

  it("reserves stock on payment approval, refuses to oversell, and cancel returns exactly what was reserved", async () => {
    await setStock(db as never, kit.sku, 3, null, "test");
    const a = await createOrder(db as never, input());
    const b = await createOrder(db as never, input());
    if (!a.ok || !b.ok) throw new Error("setup");
    expect((await transitionOrder(db as never, a.id, "payment_approved")).ok).toBe(true);
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 1 });
    // Second approval would need 2 with only 1 left: nothing changes.
    expect(await transitionOrder(db as never, b.id, "payment_approved")).toEqual({ ok: false, error: "out_of_stock", skus: [kit.sku] });
    expect((await getOrder(db as never, b.id))?.status).toBe("received");
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 1 });
    // Cancelling the approved order returns its 2, once.
    expect((await transitionOrder(db as never, a.id, "cancelled")).ok).toBe(true);
    expect((await transitionOrder(db as never, a.id, "cancelled")).ok).toBe(false);
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 3 });
  });

  it("never returns stock an order didn't take (SKU controlled only after the order)", async () => {
    const r = await createOrder(db as never, input());
    if (!r.ok) throw new Error("setup");
    await setStock(db as never, kit.sku, 10, null, "test");
    expect((await transitionOrder(db as never, r.id, "cancelled")).ok).toBe(true);
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 10 });
  });
});

describe("customer access", () => {
  it("order token verifies only for its own order", async () => {
    const t = await orderAccessToken("ord_00000000-0000-0000-0000-000000000001");
    expect(await verifyOrderAccessToken("ord_00000000-0000-0000-0000-000000000001", t)).toBe(true);
    expect(await verifyOrderAccessToken("ord_00000000-0000-0000-0000-000000000002", t)).toBe(false);
  });

  it("public view masks contact data and never exposes the CPF", async () => {
    const r = await createOrder(db as never, input());
    if (!r.ok) throw new Error("setup");
    const view = publicOrderView((await getOrder(db as never, r.id))!);
    expect(view.customer).toEqual({ name: "Maria", email: "ma•••@example.com", phone: "(11) •••••-4321", cpfMasked: "***.***.***-25" });
    expect(JSON.stringify(view)).not.toContain("52998224725");
  });
});

describe("admin listing", () => {
  it("paginates newest-first and searches by number/e-mail", async () => {
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await createOrder(db as never, input({ customer: { name: `Cliente Teste ${i}`, email: `c${i}@example.com`, cpf: "52998224725", phone: "11987654321" } }));
      if (!r.ok) throw new Error("setup");
      created.push(r.number);
      db.raw.prepare("UPDATE loja_orders SET created_at = ? WHERE number = ?").run(`2026-09-2${i}T10:00:00.000Z`, r.number);
    }
    const first = await listOrders(db as never, { limit: 2 });
    expect(first.orders.map((o) => o.number)).toEqual([created[2], created[1]]);
    const second = await listOrders(db as never, { limit: 2, before: first.nextBefore! });
    expect(second.orders.map((o) => o.number)).toEqual([created[0]]);
    expect(second.nextBefore).toBeNull();
    expect((await listOrders(db as never, { q: "c1@example" })).orders.map((o) => o.number)).toEqual([created[1]]);
  });
});
