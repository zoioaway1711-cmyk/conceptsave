import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { applySeedCatalog } from "./helpers/loja-catalog";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { createOrder, getOrder, orderAccessToken } = await import("../lib/loja-orders");
const { setStock } = await import("../lib/loja-stock");
const { getProduct } = await import("../app/loja/_lib/catalog");
const webhook = await import("../app/api/loja/webhooks/pix/route");
const cryptoWebhook = await import("../app/api/loja/webhooks/crypto/route");
const receiptRoute = await import("../app/api/loja/orders/[id]/receipt/route");
const paymentRoute = await import("../app/api/loja/orders/[id]/payment/route");
const orderRoute = await import("../app/api/loja/orders/[id]/route");
applySeedCatalog();

const WEBHOOK_SECRET = "whsec_test_" + "x".repeat(32);
const CHARGE_ID = "pix_1hcRSweeHE9P5-sPMd7v923l";
const COPY_PASTE = "00020101021226640014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540443805802BR5925LUMINA UP COMERCIAL LTDA6009SAO PAULO62070503***6304ABCD";

let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;
/** What the fake pix-checkout answers for GET /api/pix/order/:id. */
let providerStatus: "pending" | "paid" | "expired" | "held" = "pending";
let createdAmount: number | null = null;

function charge(amountCents: number, merchantRef: string, status = "pending") {
  return {
    order_id: CHARGE_ID,
    status,
    amount_cents: amountCents,
    merchant_ref: merchantRef,
    description: "Pedido",
    pix_copy_paste: COPY_PASTE,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    pay_url: `https://pix.sidebridgeswap.com/pay/${CHARGE_ID}`,
    qr_code_url: `https://pix.sidebridgeswap.com/pay/${CHARGE_ID}/qr.png`,
    receipt_url: null,
    end_to_end_id: status === "paid" ? "E18236120202609231333s001572ff3c" : null,
    fee_cents: null,
    net_cents: null,
    paid_at: null,
    confirmed_at: null,
    error: null,
    created_at: Math.floor(Date.now() / 1000),
  };
}

let lastMerchantRef = "";

const CRYPTO_SECRET = "crypto_webhook_secret_" + "z".repeat(24);
const CRYPTO_ORDER = "ord_cfc3645bbb804f83aab8";
const WALLET = "TXMavviZXca4Z88hJQTFsJ825WNNjryrgH";
let cryptoStatus: "pending" | "confirmed" | "paid_late" | "underpaid" | "expired" = "pending";
let quoteFailures = 0;
let quotedBrl = 0;

function cryptoProvider(url: string, init?: RequestInit): Response | null {
  const base = "https://crypto.sidebridgeswap.com/api/crypto";
  if (url === `${base}/quote` && init?.method === "POST") {
    if (quoteFailures > 0) {
      quoteFailures--;
      return Response.json({ error: "price_unavailable", message: "x" }, { status: 503 });
    }
    quotedBrl = (JSON.parse(String(init.body)) as { amount_brl: number }).amount_brl;
    return Response.json({ quote_id: "qt_9358d531a3ab4326b132", amount_brl: quotedBrl, usdt_amount: 43.15, price_brl: 5.0754, expires_at: Math.floor(Date.now() / 1000) + 600, expires_in: 600 });
  }
  if (url === `${base}/order` && init?.method === "POST") {
    lastMerchantRef = (JSON.parse(String(init.body)) as { merchant_ref: string }).merchant_ref;
    return Response.json({
      order_id: CRYPTO_ORDER,
      status: "pending",
      network: "tron",
      token: "USDT-TRC20",
      contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      pay_to_address: WALLET,
      amount_usdt: 43.1501,
      amount_brl: quotedBrl,
      price_brl: 5.0754,
      expires_at: Math.floor(Date.now() / 1000) + 600,
      expires_in: 600,
    });
  }
  if (url === `${base}/order/${CRYPTO_ORDER}`) {
    return Response.json({ order_id: CRYPTO_ORDER, status: cryptoStatus, merchant_ref: lastMerchantRef, amount_usdt: 43.1501, amount_brl: quotedBrl, txid: cryptoStatus === "confirmed" ? "b1f2aa9e9" : null });
  }
  if (url === `${base}/order/${CRYPTO_ORDER}/receipt`) {
    return new Response("%PDF-1.4 fake", { headers: { "content-type": "application/pdf" } });
  }
  return null;
}

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  env.PIX_API_KEY = "pk_test_" + "k".repeat(40);
  env.PIX_STORE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  env.CRYPTO_API_KEY = "ck_live_" + "c".repeat(32);
  env.CRYPTO_WEBHOOK_SECRET = CRYPTO_SECRET;
  cryptoStatus = "pending";
  quoteFailures = 0;
  delete env.LOJA_TEST_BUYER_EMAIL;
  providerStatus = "pending";
  createdAmount = null;
  applySeedCatalog();
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://pix.sidebridgeswap.com/api/pix/order" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { amount_cents: number; merchant_ref: string };
      createdAmount = body.amount_cents;
      lastMerchantRef = body.merchant_ref;
      return Response.json(charge(body.amount_cents, body.merchant_ref), { status: 201 });
    }
    const crypto = cryptoProvider(url, init);
    if (crypto) return crypto;
    if (url === `https://pix.sidebridgeswap.com/api/pix/order/${CHARGE_ID}`) {
      return Response.json(charge(createdAmount ?? 0, lastMerchantRef, providerStatus));
    }
    return new Response("{}"); // Telegram and anything else
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const kit = getProduct("kit-aplicacao-premium")!;

async function newOrder(method: "pix" | "boleto" | "crypto" = "pix", qty = 1) {
  const r = await createOrder(db as never, {
    customer: { name: "Maria Teste Silva", email: "maria@example.com", cpf: "529.982.247-25", phone: "(11) 98765-4321" },
    address: { cep: "01310-100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", uf: "SP" },
    payment: { method, installments: 1 },
    items: [{ slug: kit.slug, qty }],
    expectedTotal: kit.price * qty,
  });
  if (!r.ok) throw new Error("order not created");
  return { id: r.id, token: await orderAccessToken(r.id) };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function startRequest(id: string, token: string) {
  return new Request(`https://loja.test/api/loja/orders/${id}/payment`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://loja.test", host: "loja.test" },
    body: JSON.stringify({ t: token }),
  });
}

function signed(body: unknown, { secret = WEBHOOK_SECRET, event }: { secret?: string; event?: string } = {}) {
  const raw = JSON.stringify(body);
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("https://loja.test/api/loja/webhooks/pix", {
    method: "POST",
    headers: { "content-type": "application/json", "x-pix-checkout-signature": sig, "x-pix-checkout-event": event ?? (body as { event: string }).event },
    body: raw,
  });
}

function paidEvent(merchantRef: string, amountCents = Math.round(kit.price * 100), event = "order.paid") {
  return {
    event,
    order_id: CHARGE_ID,
    merchant_ref: merchantRef,
    status: event === "order.paid" ? "paid" : event === "order.held" ? "held" : "expired",
    amount_cents: amountCents,
    paid_at: "2026-09-29T13:32:50.312Z",
    confirmed_at: 1790170397,
    end_to_end_id: "E18236120202609231333s001572ff3c",
    fee_cents: 1195,
    net_cents: amountCents - 1195,
  };
}

async function startCharge(id: string, token: string) {
  const res = await paymentRoute.POST(startRequest(id, token), params(id));
  return { status: res.status, body: (await res.json()) as { payment?: { mode: string; current?: { status: string; pix?: { copyPaste: string } } }; error?: string } };
}

describe("Pix charge creation", () => {
  it("creates one charge for the exact order total, tied to the order by merchant_ref, and reuses it", async () => {
    const { id, token } = await newOrder();
    const first = await startCharge(id, token);
    expect(first.status).toBe(200);
    expect(first.body.payment?.mode).toBe("auto");
    expect(first.body.payment?.current?.status).toBe("pending");
    expect(first.body.payment?.current?.pix?.copyPaste).toBe(COPY_PASTE);
    expect(createdAmount).toBe(Math.round(kit.price * 100));
    expect(lastMerchantRef).toBe(id);

    const again = await startCharge(id, token);
    expect(again.body.payment?.current?.status).toBe("pending");
    const creations = fetchMock.mock.calls.filter(([u, i]) => String(u).endsWith("/api/pix/order") && (i as RequestInit)?.method === "POST");
    expect(creations).toHaveLength(1);
  });

  it("never sends the API key anywhere but the provider, and never from a wrong token", async () => {
    const { id } = await newOrder();
    const bad = await startCharge(id, "0".repeat(32));
    expect(bad.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the manual flow when the gateway isn't configured", async () => {
    delete env.PIX_API_KEY;
    const { id, token } = await newOrder();
    const r = await startCharge(id, token);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("not_configured");
    const view = await orderRoute.GET(new Request(`https://loja.test/api/loja/orders/${id}?t=${token}`), params(id));
    expect(((await view.json()) as { payment: { mode: string } }).payment.mode).toBe("manual");
  });

  it("doesn't charge card/boleto orders online", async () => {
    const { id, token } = await newOrder("boleto");
    const r = await startCharge(id, token);
    expect(r.body.error).toBe("not_supported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the charge failed (no automatic retry) when the provider errors", async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ error: "provider_error", message: "x" }, { status: 502 }));
    const { id, token } = await newOrder();
    const r = await startCharge(id, token);
    expect(r.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.raw.prepare("SELECT status FROM loja_payments").get()).toEqual({ status: "failed" });
  });
});

describe("POST /api/loja/webhooks/pix", () => {
  it("rejects a bad signature before touching anything", async () => {
    const { id, token } = await newOrder();
    await startCharge(id, token);
    const res = await webhook.POST(signed(paidEvent(id), { secret: "whsec_wrong" }));
    expect(res.status).toBe(401);
    expect((await getOrder(db as never, id))?.status).toBe("received");
  });

  it("order.paid releases the order (payment_approved), reserves stock, and is idempotent", async () => {
    await setStock(db as never, kit.sku, 5, null, "test");
    const { id, token } = await newOrder();
    await startCharge(id, token);
    const res = await webhook.POST(signed(paidEvent(id)));
    expect(res.status).toBe(200);
    const order = await getOrder(db as never, id);
    expect(order?.status).toBe("payment_approved");
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 4 });
    const payment = db.raw.prepare("SELECT status, receipt_url AS receipt, provider_data_json AS data FROM loja_payments").get() as { status: string; receipt: string; data: string };
    expect(payment.status).toBe("paid");
    expect(payment.receipt).toBe(`https://pix.sidebridgeswap.com/pay/${CHARGE_ID}/receipt`);
    expect(JSON.parse(payment.data).endToEndId).toBe("E18236120202609231333s001572ff3c");

    // Provider retry: same event again → no second reservation.
    const again = await webhook.POST(signed(paidEvent(id)));
    expect(((await again.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    expect(db.raw.prepare("SELECT quantity FROM loja_stock WHERE sku = ?").get(kit.sku)).toEqual({ quantity: 4 });
  });

  it("a paid amount different from the order goes to review — the order is NOT released", async () => {
    const { id, token } = await newOrder();
    await startCharge(id, token);
    await webhook.POST(signed(paidEvent(id, 500)));
    expect((await getOrder(db as never, id))?.status).toBe("received");
    expect(db.raw.prepare("SELECT status FROM loja_payments").get()).toEqual({ status: "review" });
  });

  it("order.held never releases the order", async () => {
    const { id, token } = await newOrder();
    await startCharge(id, token);
    await webhook.POST(signed(paidEvent(id, Math.round(kit.price * 100), "order.held")));
    expect((await getOrder(db as never, id))?.status).toBe("received");
    expect(db.raw.prepare("SELECT status FROM loja_payments").get()).toEqual({ status: "review" });
  });

  it("a late order.paid after order.expired still settles the order", async () => {
    const { id, token } = await newOrder();
    await startCharge(id, token);
    await webhook.POST(signed(paidEvent(id, Math.round(kit.price * 100), "order.expired")));
    expect(db.raw.prepare("SELECT status FROM loja_payments").get()).toEqual({ status: "expired" });
    await webhook.POST(signed(paidEvent(id)));
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");
  });

  it("an event whose merchant_ref points at another order releases nothing", async () => {
    const a = await newOrder();
    await startCharge(a.id, a.token);
    const b = await newOrder("pix", 2); // different order (identical data would be de-duplicated into `a`)
    expect(b.id).not.toBe(a.id);
    await webhook.POST(signed(paidEvent(b.id)));
    expect((await getOrder(db as never, a.id))?.status).toBe("received");
    expect((await getOrder(db as never, b.id))?.status).toBe("received");
  });

  it("answers 503 (provider retries later) while the secret isn't configured", async () => {
    delete env.PIX_STORE_WEBHOOK_SECRET;
    const res = await webhook.POST(signed({ event: "order.paid" }));
    expect(res.status).toBe(503);
  });
});

describe("polling fallback", () => {
  it("the order page picks up a payment even if the webhook never arrives", async () => {
    const { id, token } = await newOrder();
    await startCharge(id, token);
    // Let the throttle window pass.
    db.raw.prepare("UPDATE loja_payments SET checked_at = '2000-01-01T00:00:00.000Z'").run();
    providerStatus = "paid";
    const res = await orderRoute.GET(new Request(`https://loja.test/api/loja/orders/${id}?t=${token}`), params(id));
    const body = (await res.json()) as { order: { status: string }; payment: { current: { status: string } } };
    expect(body.payment.current.status).toBe("paid");
    expect(body.order.status).toBe("payment_approved");
  });
});

function cryptoSigned(body: Record<string, unknown>, { prefix = true, secret = CRYPTO_SECRET } = {}) {
  const raw = JSON.stringify(body);
  const hex = createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("https://loja.test/api/loja/webhooks/crypto", {
    method: "POST",
    headers: { "content-type": "application/json", "x-crypto-checkout-signature": prefix ? `sha256=${hex}` : hex, "x-crypto-checkout-event": String(body.event) },
    body: raw,
  });
}

function cryptoEvent(merchantRef: string, event: string, status: string, amountBrl = kit.price) {
  return {
    event,
    order_id: CRYPTO_ORDER,
    merchant_ref: merchantRef,
    status,
    network: "tron",
    token: "USDT-TRC20",
    amount_brl: amountBrl,
    amount_usdt_expected: 43.1501,
    amount_usdt_paid: status === "underpaid" ? 42.6501 : 43.1501,
    price_brl: 5.0754,
    txid: "b1f2aa9e9",
    explorer_url: "https://tronscan.org/#/transaction/b1f2aa9e9",
    from_address: "TJSdFN6atUg1kVRkb3jkAQ31uDicYDsNdE",
    confirmations: 20,
    confirmed_at: 1789079999,
  };
}

describe("crypto (USDT-TRC20) payments", () => {
  it("refuses a crypto order at checkout when the gateway isn't configured", async () => {
    delete env.CRYPTO_API_KEY;
    await expect(newOrder("crypto")).rejects.toThrow("order not created");
  });

  it("quotes the exact order total, freezes it into an order tied by merchant_ref, and shows address + exact amount", async () => {
    const { id, token } = await newOrder("crypto");
    const r = await startCharge(id, token);
    expect(r.status).toBe(200);
    const current = (r.body.payment as unknown as { current: { status: string; crypto: { address: string; amountUsdt: string; network: string } } }).current;
    expect(current.status).toBe("pending");
    expect(current.crypto).toMatchObject({ address: WALLET, amountUsdt: "43.1501", network: "Tron (TRC20)" });
    expect(quotedBrl).toBe(kit.price);
    expect(lastMerchantRef).toBe(id);
  });

  it("retries the quote on 503 price_unavailable (a quote creates nothing payable)", async () => {
    quoteFailures = 1;
    const { id, token } = await newOrder("crypto");
    const r = await startCharge(id, token);
    expect(r.body.payment?.current?.status).toBe("pending");
  }, 10_000);

  it("order.confirmed releases the order; the store serves the receipt PDF only with the order token", async () => {
    const { id, token } = await newOrder("crypto");
    await startCharge(id, token);
    const bad = await cryptoWebhook.POST(cryptoSigned(cryptoEvent(id, "order.confirmed", "confirmed"), { secret: "wrong" }));
    expect(bad.status).toBe(401);
    const res = await cryptoWebhook.POST(cryptoSigned(cryptoEvent(id, "order.confirmed", "confirmed")));
    expect(res.status).toBe(200);
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");

    const denied = await receiptRoute.GET(new Request(`https://loja.test/api/loja/orders/${id}/receipt`), params(id));
    expect(denied.status).toBe(404);
    const pdf = await receiptRoute.GET(new Request(`https://loja.test/api/loja/orders/${id}/receipt`, { headers: { "x-order-token": token } }), params(id));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(await pdf.text()).toContain("%PDF");
  });

  it("accepts the signature without the sha256= prefix too (the OpenAPI wording)", async () => {
    const { id, token } = await newOrder("crypto");
    await startCharge(id, token);
    const res = await cryptoWebhook.POST(cryptoSigned(cryptoEvent(id, "order.paid_late", "paid_late"), { prefix: false }));
    expect(res.status).toBe(200);
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");
  });

  it("order.underpaid goes to review and does NOT release; a later confirmation does", async () => {
    const { id, token } = await newOrder("crypto");
    await startCharge(id, token);
    await cryptoWebhook.POST(cryptoSigned(cryptoEvent(id, "order.underpaid", "underpaid")));
    expect((await getOrder(db as never, id))?.status).toBe("received");
    expect(db.raw.prepare("SELECT status FROM loja_payments").get()).toEqual({ status: "review" });
    await cryptoWebhook.POST(cryptoSigned(cryptoEvent(id, "order.confirmed", "confirmed")));
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");
  });

  it("polling picks up a confirmation when the webhook never arrives", async () => {
    const { id, token } = await newOrder("crypto");
    await startCharge(id, token);
    db.raw.prepare("UPDATE loja_payments SET checked_at = '2000-01-01T00:00:00.000Z'").run();
    cryptoStatus = "confirmed";
    const res = await orderRoute.GET(new Request(`https://loja.test/api/loja/orders/${id}?t=${token}`), params(id));
    const body = (await res.json()) as { order: { status: string } };
    expect(body.order.status).toBe("payment_approved");
  });
});

describe("test mode (LOJA_TEST_BUYER_EMAIL → fixed R$ 20,00 charge)", () => {
  it("charges R$ 20,00 only to the configured e-mail, marks it as a test, and settles it", async () => {
    env.LOJA_TEST_BUYER_EMAIL = "Maria@Example.com"; // case-insensitive
    const { id, token } = await newOrder("pix");
    const r = await startCharge(id, token);
    expect(createdAmount).toBe(2000);
    expect((r.body.payment as unknown as { current: { amountCents: number; test: boolean } }).current).toMatchObject({ amountCents: 2000, test: true });
    const res = await webhook.POST(signed(paidEvent(id, 2000)));
    expect(res.status).toBe(200);
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");
  });

  it("everyone else still pays the real total", async () => {
    env.LOJA_TEST_BUYER_EMAIL = "someone.else@example.com";
    const { id, token } = await newOrder("pix");
    await startCharge(id, token);
    expect(createdAmount).toBe(Math.round(kit.price * 100));
  });

  it("a test charge still settles if the secret is removed before the webhook arrives", async () => {
    env.LOJA_TEST_BUYER_EMAIL = "maria@example.com";
    const { id, token } = await newOrder("pix");
    await startCharge(id, token);
    delete env.LOJA_TEST_BUYER_EMAIL;
    await webhook.POST(signed(paidEvent(id, 2000)));
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");
  });

  it("crypto test orders are quoted at R$ 20,00", async () => {
    env.LOJA_TEST_BUYER_EMAIL = "maria@example.com";
    const { id, token } = await newOrder("crypto");
    await startCharge(id, token);
    expect(quotedBrl).toBe(20);
    await cryptoWebhook.POST(cryptoSigned(cryptoEvent(id, "order.confirmed", "confirmed", 20)));
    expect((await getOrder(db as never, id))?.status).toBe("payment_approved");
  });
});

describe("Telegram: store alerts and reports", () => {
  const telegramTexts = () =>
    fetchMock.mock.calls
      .filter(([u]) => String(u).includes("api.telegram.org"))
      .map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { text: string }).text);

  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = "123:abc";
    env.TELEGRAM_CHAT_ID = "999";
  });
  afterEach(() => {
    delete env.TELEGRAM_BOT_TOKEN;
    delete env.TELEGRAM_CHAT_ID;
  });

  it("alerts when a Pix code expires unpaid, and confirms payments", async () => {
    const { id, token } = await newOrder("pix");
    await startCharge(id, token);
    await webhook.POST(signed(paidEvent(id, Math.round(kit.price * 100), "order.expired")));
    expect(telegramTexts().some((t) => t.startsWith("⌛ Pix expirou sem pagamento"))).toBe(true);
    await webhook.POST(signed(paidEvent(id)));
    expect(telegramTexts().some((t) => t.startsWith("✅ Pix confirmado"))).toBe(true);
  });

  it("/loja and /pagamentos report today's orders and charges without customer data", async () => {
    const { handleTelegramCommand } = await import("../lib/telegram-commands");
    const { id, token } = await newOrder("pix");
    await startCharge(id, token);
    await webhook.POST(signed(paidEvent(id)));
    const summary = await handleTelegramCommand(db as never, "/loja");
    expect(summary).toContain("Pedidos novos: 1");
    expect(summary).toContain("Recebido online");
    expect(summary).not.toContain("Maria");
    const payments = await handleTelegramCommand(db as never, "/pagamentos 5");
    expect(payments).toMatch(/Pix .*pago/);
    expect(payments).not.toContain("maria@");
  });

  it("the daily summary goes to the bot", async () => {
    const { sendDailyStoreSummary } = await import("../lib/loja-telegram");
    await sendDailyStoreSummary(db as never);
    expect(telegramTexts().some((t) => t.startsWith("📅 Bom dia! Resumo da loja de ontem"))).toBe(true);
  });
});

describe("admin: vendas do dia + webhooks", () => {
  it("counts today's orders, money received, products and the webhook events", async () => {
    const { salesDashboard, saoPauloDay } = await import("../lib/loja-dashboard");
    const { id, token } = await newOrder("pix", 2);
    await newOrder("boleto");
    await startCharge(id, token);
    await webhook.POST(signed(paidEvent(id, Math.round(kit.price * 200))));

    const d = await salesDashboard(db as never, null);
    expect(d.isToday).toBe(true);
    expect(d.orders.n).toBe(2);
    expect(d.orders.value).toBeCloseTo(kit.price * 3);
    expect(d.orders.byMethod.map((m) => m.method).sort()).toEqual(["boleto", "pix"]);
    expect(d.received.n).toBe(1);
    expect(d.received.cents).toBe(Math.round(kit.price * 200));
    expect(d.received.feeCents).toBe(1195);
    expect(d.products[0]).toMatchObject({ sku: kit.sku, qty: 3 });
    expect(d.hourly.reduce((s, h) => s + h.orders, 0)).toBe(2);
    expect(d.list.find((o) => o.id === id)?.charge?.status).toBe("paid");
    // First name only on this screen; never e-mail or CPF.
    expect(JSON.stringify(d)).not.toContain("maria@");
    expect(JSON.stringify(d)).not.toContain("Silva");
    const pix = d.webhooks.providers.find((w) => w.provider === "pix")!;
    expect(pix).toMatchObject({ configured: true, eventsOnDay: 1, url: "https://saveconcept.com.br/api/loja/webhooks/pix" });
    expect(d.webhooks.recent[0]).toMatchObject({ provider: "pix", event: "order.paid", providerRef: CHARGE_ID });
    expect(d.webhooks.recent[0].number).toMatch(/.+/);

    const yesterday = await salesDashboard(db as never, saoPauloDay(null, new Date(Date.now() - 86400000)).day);
    expect(yesterday.orders.n).toBe(0);
    expect(yesterday.isToday).toBe(false);
  });

  it("rejects invalid or future days (falls back to today)", async () => {
    const { saoPauloDay } = await import("../lib/loja-dashboard");
    const now = new Date("2026-09-29T15:00:00Z");
    expect(saoPauloDay("2026-02-30", now).day).toBe("2026-09-29");
    expect(saoPauloDay("2030-01-01", now).day).toBe("2026-09-29");
    expect(saoPauloDay("x", now).day).toBe("2026-09-29");
    expect(saoPauloDay("2026-09-28", now)).toMatchObject({ day: "2026-09-28", from: new Date("2026-09-28T03:00:00Z") });
    // 01:00 in São Paulo on the 29th is still 04:00Z → day 29; 02:00Z is still the 28th.
    expect(saoPauloDay(null, new Date("2026-09-29T02:00:00Z")).day).toBe("2026-09-28");
  });
});
