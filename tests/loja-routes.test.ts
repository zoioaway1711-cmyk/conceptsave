import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { applySeedCatalog } from "./helpers/loja-catalog";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const adminOrders = await import("../app/api/admin/loja/orders/route");
const adminOrder = await import("../app/api/admin/loja/orders/[id]/route");
const adminStock = await import("../app/api/admin/loja/stock/route");
const adminMetrics = await import("../app/api/admin/loja/metrics/route");
const publicOrder = await import("../app/api/loja/orders/[id]/route");
const events = await import("../app/api/loja/events/route");
const { createOrder, orderAccessToken } = await import("../lib/loja-orders");

let db: ReturnType<typeof createFakeD1>;
beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  applySeedCatalog();
});

const url = (path: string) => `https://loja.test${path}`;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("admin store routes require an admin session", () => {
  it("rejects anonymous access to orders, order actions, stock and metrics", async () => {
    expect((await adminOrders.GET(new Request(url("/api/admin/loja/orders")))).status).toBe(401);
    const patch = new Request(url("/api/admin/loja/orders/x"), { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
    expect((await adminOrder.PATCH(patch, params("x"))).status).toBe(401);
    const reveal = new Request(url("/api/admin/loja/orders/x"), { method: "POST", body: JSON.stringify({ action: "reveal_cpf" }) });
    expect((await adminOrder.POST(reveal, params("x"))).status).toBe(401);
    expect((await adminStock.GET(new Request(url("/api/admin/loja/stock")))).status).toBe(401);
    expect((await adminMetrics.GET(new Request(url("/api/admin/loja/metrics")))).status).toBe(401);
  });
});

describe("public order route", () => {
  it("returns 404 for a wrong token, same as a missing order", async () => {
    const r = await createOrder(db as never, {
      customer: { name: "Maria Teste Silva", email: "m@example.com", cpf: "52998224725", phone: "11987654321" },
      address: { cep: "01310100", street: "Av", number: "1", complement: "", district: "B", city: "São Paulo", uf: "SP" },
      payment: { method: "pix", installments: 1 },
      items: [{ slug: "diluente-bacteriostatico", qty: 1 }],
      expectedTotal: 89,
    });
    if (!r.ok) throw new Error("setup");
    const wrong = await publicOrder.GET(new Request(url(`/api/loja/orders/${r.id}?t=${"0".repeat(32)}`)), params(r.id));
    expect(wrong.status).toBe(404);
    const missing = await publicOrder.GET(new Request(url(`/api/loja/orders/ord_00000000-0000-0000-0000-000000000000?t=${"0".repeat(32)}`)), params("ord_00000000-0000-0000-0000-000000000000"));
    expect(missing.status).toBe(404);
  });

  it("takes the token from the x-order-token header (kept out of the URL and its logs)", async () => {
    const r = await createOrder(db as never, {
      customer: { name: "Maria Teste Silva", email: "m@example.com", cpf: "52998224725", phone: "11987654321" },
      address: { cep: "01310100", street: "Av", number: "1", complement: "", district: "B", city: "São Paulo", uf: "SP" },
      payment: { method: "pix", installments: 1 },
      items: [{ slug: "diluente-bacteriostatico", qty: 1 }],
      expectedTotal: 89,
    });
    if (!r.ok) throw new Error("setup");
    const token = await orderAccessToken(r.id);
    const ok = await publicOrder.GET(new Request(url(`/api/loja/orders/${r.id}`), { headers: { "x-order-token": token } }), params(r.id));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { order: { id: string } }).order.id).toBe(r.id);
    const wrong = await publicOrder.GET(new Request(url(`/api/loja/orders/${r.id}`), { headers: { "x-order-token": "0".repeat(32) } }), params(r.id));
    expect(wrong.status).toBe(404);
    // A wrong header is never rescued by a right ?t=: the header always wins.
    const mixed = await publicOrder.GET(new Request(url(`/api/loja/orders/${r.id}?t=${token}`), { headers: { "x-order-token": "0".repeat(32) } }), params(r.id));
    expect(mixed.status).toBe(404);
    // Legacy ?t= (order pages still open with the previous script) keeps working.
    const legacy = await publicOrder.GET(new Request(url(`/api/loja/orders/${r.id}?t=${token}`)), params(r.id));
    expect(legacy.status).toBe(200);
    const none = await publicOrder.GET(new Request(url(`/api/loja/orders/${r.id}`)), params(r.id));
    expect(none.status).toBe(404);
  });
});

describe("events intake", () => {
  it("always answers 204 and stores nothing for an invalid batch", async () => {
    const res = await events.POST(new Request(url("/api/loja/events"), { method: "POST", body: JSON.stringify({ sessionId: "x", events: [] }) }));
    expect(res.status).toBe(204);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM loja_events").get()).toEqual({ n: 0 });
  });

  it("stores a valid batch with sanitized params", async () => {
    const body = { sessionId: "abcdefgh1234", events: [{ name: "search", path: "/loja/busca?q=maria", params: { search_term: "diluente", results: 1, email: "x@y.z" } }] };
    await events.POST(new Request(url("/api/loja/events"), { method: "POST", body: JSON.stringify(body) }));
    expect(db.raw.prepare("SELECT path, params_json AS p FROM loja_events").get()).toEqual({ path: "/loja/busca", p: '{"search_term":"diluente","results":1}' });
  });
});
