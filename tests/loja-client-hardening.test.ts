import { beforeAll, describe, expect, it } from "vitest";
import { SEED_PRODUCTS, SEED_SETTINGS } from "../lib/loja-catalog-seed";
import { STORE, applyCatalog } from "../app/loja/_lib/catalog";
import { analyticsPath, redactSearchTerm } from "../app/loja/_lib/analytics";
import {
  DRAFT_TTL_MS,
  EMPTY_CHECKOUT,
  hasPersonalData,
  parseCreatedOrder,
  parseDraft,
  sanitizeFieldErrors,
} from "../app/loja/_lib/checkout";
import { MAX_CART_LINES, isOrderRef, parseCartEntries } from "../app/loja/_lib/store";

/*
 * Client-side hardening of the storefront (/loja): storage validation,
 * checkout draft expiry, order-response parsing, analytics minimization
 * and admin-link sanitization. Pure functions only — no DOM needed.
 */

const ID = "ord_0123abcd-0123-4567-89ab-0123456789ab";
const TOKEN = "0123456789abcdef0123456789abcdef";

beforeAll(() => {
  applyCatalog({ version: "test-1", products: SEED_PRODUCTS, settings: SEED_SETTINGS });
});

describe("stored order refs", () => {
  const ok = { id: ID, number: "SC250101-ABCD", token: TOKEN, createdAt: "2025-01-01T12:00:00.000Z", total: 120 };
  it("accepts a well-formed ref", () => expect(isOrderRef(ok)).toBe(true));
  it("rejects an invalid date (Intl.DateTimeFormat would throw and crash Minha conta)", () => {
    expect(isOrderRef({ ...ok, createdAt: "not-a-date" })).toBe(false);
  });
  it("rejects tampered number, token or total", () => {
    expect(isOrderRef({ ...ok, number: "<img src=x>" })).toBe(false);
    expect(isOrderRef({ ...ok, token: "x".repeat(32) })).toBe(false);
    expect(isOrderRef({ ...ok, total: -1 })).toBe(false);
    expect(isOrderRef(null)).toBe(false);
  });
});

describe("stored cart", () => {
  const slug = SEED_PRODUCTS[0].slug;
  it("dedupes slugs, clamps qty and caps the number of lines", () => {
    const parsed = parseCartEntries([
      { slug, qty: 500, price: 1, name: "x" },
      { slug, qty: 99, price: 1, name: "x" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].qty).toBe(99);
    const many = Array.from({ length: 500 }, (_, i) => ({ slug: `retirado-${i}`, qty: 1, price: 1, name: `Produto ${i}` }));
    expect(parseCartEntries(many)).toHaveLength(MAX_CART_LINES);
  });
  it("drops malformed unknown slugs and non-arrays", () => {
    expect(parseCartEntries([{ slug: "javascript:alert(1)", qty: 1, price: 1, name: "x" }])).toEqual([]);
    expect(parseCartEntries({ slug })).toEqual([]);
  });
});

describe("checkout draft", () => {
  const form = { ...EMPTY_CHECKOUT, name: "Maria Silva", email: "maria@example.com", cpf: "52998224725", uf: "SP" };
  const now = 1_000_000_000_000;
  it("restores a fresh draft without the CPF", () => {
    const restored = parseDraft({ form, savedAt: now - 60_000 }, now);
    expect(restored?.name).toBe("Maria Silva");
    expect(restored?.cpf).toBe("");
  });
  it("expires after the TTL, and drafts without a timestamp", () => {
    expect(parseDraft({ form, savedAt: now - DRAFT_TTL_MS - 1 }, now)).toBeNull();
    expect(parseDraft({ form }, now)).toBeNull();
    expect(parseDraft({ form, savedAt: now + 60_000 }, now)).toBeNull();
  });
  it("normalizes tampered enum-like fields", () => {
    const restored = parseDraft({ form: { ...form, payment: "bitcoin", uf: "XX", installments: "999" }, savedAt: now }, now);
    expect(restored).toMatchObject({ payment: "pix", uf: "", installments: "1" });
  });
  it("only counts real personal data", () => {
    expect(hasPersonalData(EMPTY_CHECKOUT)).toBe(false);
    expect(hasPersonalData({ ...EMPTY_CHECKOUT, payment: "boleto", cpf: "123" })).toBe(false);
    expect(hasPersonalData({ ...EMPTY_CHECKOUT, email: "a@b.co" })).toBe(true);
  });
});

describe("order API responses", () => {
  it("trusts a 201 only with the exact shape", () => {
    expect(parseCreatedOrder({ id: ID, number: "SC250101-ABCD", token: TOKEN, totals: { total: 50 } })).toEqual({
      id: ID,
      number: "SC250101-ABCD",
      token: TOKEN,
      total: 50,
    });
    expect(parseCreatedOrder({ id: "../../admin", number: "SC1", token: TOKEN })).toBeNull();
    expect(parseCreatedOrder({ id: ID, number: "SC250101-ABCD", token: TOKEN })?.total).toBe(0);
    expect(parseCreatedOrder(null)).toBeNull();
  });
  it("keeps only known fields from server field errors", () => {
    const errors = sanitizeFieldErrors(
      { name: "Nome inválido.", __proto__x: "x", evil: "<b>x</b>", installments: { html: 1 }, email: "x".repeat(500) },
      { ...EMPTY_CHECKOUT, name: "Maria Silva", email: "maria@example.com" },
    );
    expect(Object.keys(errors).sort()).toEqual(["email", "installments", "name"]);
    expect(errors.name).toBe("Nome inválido.");
    expect(errors.installments).toBe("Confira o campo Parcelas.");
    expect(errors.email).toBe("Confira o campo E-mail.");
    expect(sanitizeFieldErrors("nope", EMPTY_CHECKOUT)).toEqual({});
  });
});

describe("analytics minimization", () => {
  it("redacts e-mail, CPF and phone typed into the search box", () => {
    expect(redactSearchTerm("maria@gmail.com")).toBe("[e-mail]");
    expect(redactSearchTerm("529.982.247-25")).toBe("[número]");
    expect(redactSearchTerm("(11) 91234-5678")).toBe("[número]");
    expect(redactSearchTerm("tirzepatida 60mg")).toBe("tirzepatida 60mg");
  });
  it("never sends the order id in the page path", () => {
    expect(analyticsPath(`/loja/pedido/${ID}`)).toBe("/loja/pedido/[id]");
    expect(analyticsPath("/loja/produtos")).toBe("/loja/produtos");
  });
});

describe("admin-configured links", () => {
  const withSettings = (patch: Partial<typeof SEED_SETTINGS>, version: string) =>
    applyCatalog({ version, products: SEED_PRODUCTS, settings: { ...SEED_SETTINGS, ...patch } });

  it("keeps real wa.me / instagram links and valid e-mails", () => {
    withSettings(
      { whatsappUrl: "https://wa.me/5511999999999", instagramUrl: "https://www.instagram.com/saveconcept", supportEmail: "contato@example.com" },
      "links-ok",
    );
    expect(STORE.whatsappUrl).toBe("https://wa.me/5511999999999");
    expect(STORE.instagramUrl).toBe("https://www.instagram.com/saveconcept");
    expect(STORE.supportEmail).toBe("contato@example.com");
  });
  it("drops script URLs, look-alike hosts and mailto header injection", () => {
    withSettings(
      {
        whatsappUrl: "javascript:alert(1)",
        instagramUrl: "https://instagram.com.evil.example/x",
        supportEmail: "a@b.com?bcc=victim@x.com",
        privacyEmail: "privacidade@example.com\nBcc: x@y.z",
      },
      "links-bad",
    );
    expect(STORE.whatsappUrl).toBe("");
    expect(STORE.instagramUrl).toBe("");
    expect(STORE.supportEmail).toBe("");
    expect(STORE.privacyEmail).toBe("");
  });
});
