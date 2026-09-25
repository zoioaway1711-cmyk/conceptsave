import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
const { applySeedCatalog } = await import("./helpers/loja-catalog");
applySeedCatalog();

const { fieldError, maskCpf, maskPhone, suggestEmail, validCpf, validateStep, EMPTY_CHECKOUT } = await import("../app/loja/_lib/checkout");
const { computeTotals } = await import("../app/loja/_lib/pricing");
const { getProduct } = await import("../app/loja/_lib/catalog");
const { searchCatalog, relatedSearches, relatedCategories } = await import("../app/loja/_lib/search");

const product = (slug: string) => {
  const p = getProduct(slug);
  if (!p) throw new Error(`missing ${slug}`);
  return p;
};

describe("checkout validation", () => {
  it("validates CPF check digits and rejects repeated digits", () => {
    expect(validCpf("529.982.247-25")).toBe(true);
    expect(validCpf("529.982.247-24")).toBe(false);
    expect(validCpf("111.111.111-11")).toBe(false);
  });

  it("tells exactly how many CPF digits are missing", () => {
    expect(fieldError("cpf", { ...EMPTY_CHECKOUT, cpf: "529.982" })).toBe("O CPF tem 11 números — faltam 5.");
  });

  it("rejects a non-existent DDD and a 9-digit mobile not starting with 9", () => {
    expect(fieldError("phone", { ...EMPTY_CHECKOUT, phone: "(20) 98765-4321" })).toMatch(/DDD 20 não existe/);
    expect(fieldError("phone", { ...EMPTY_CHECKOUT, phone: "(11) 88765-4321" })).toMatch(/começar com 9/);
    expect(fieldError("phone", { ...EMPTY_CHECKOUT, phone: "(11) 98765-4321" })).toBeUndefined();
    expect(fieldError("phone", { ...EMPTY_CHECKOUT, phone: "(11) 3456-7890" })).toBeUndefined();
  });

  it("accepts S/N and letter suffixes as house number", () => {
    for (const n of ["120", "120A", "S/N", "sn"]) expect(fieldError("number", { ...EMPTY_CHECKOUT, number: n })).toBeUndefined();
    expect(fieldError("number", { ...EMPTY_CHECKOUT, number: "apto 3" })).toBeDefined();
  });

  it("suggests fixes for common e-mail domain typos only", () => {
    expect(suggestEmail("maria@gmial.com")).toBe("maria@gmail.com");
    expect(suggestEmail("maria@hotmail.con")).toBe("maria@hotmail.com");
    expect(suggestEmail("maria@gmail.com")).toBeNull();
    expect(suggestEmail("maria@empresa.com.br")).toBeNull();
  });

  it("only validates the fields of the current step", () => {
    const errors = validateStep(0, { ...EMPTY_CHECKOUT, name: "Maria Silva", email: "m@x.com", cpf: "52998224725", phone: "11987654321" });
    expect(errors).toEqual({});
    expect(Object.keys(validateStep(1, EMPTY_CHECKOUT)).sort()).toEqual(["cep", "city", "district", "number", "street", "uf"]);
  });

  it("masks CPF and phone progressively", () => {
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
    expect(maskPhone("1134567890")).toBe("(11) 3456-7890");
  });
});

describe("order totals", () => {
  it("free shipping only when every line has it; total excludes pending shipping", () => {
    const vial = product("tirzepatida-60mg");
    // Every catalog item ships free today; a hypothetical paid-shipping item
    // exercises the "a confirmar" path.
    const kit = { ...product("kit-aplicacao-premium"), freeShipping: false };
    const onlyVials = computeTotals([{ product: vial, qty: 2 }]);
    expect(onlyVials.shipping).toEqual({ kind: "free" });
    expect(onlyVials.total).toBe(vial.price * 2);
    expect(onlyVials.productDiscount).toBe(((vial.oldPrice ?? vial.price) - vial.price) * 2);

    const mixed = computeTotals([
      { product: vial, qty: 1 },
      { product: kit, qty: 1 },
    ]);
    expect(mixed.shipping).toEqual({ kind: "pending" });
    expect(mixed.total).toBe(vial.price + kit.price);
    expect(mixed.couponDiscount).toBe(0);
    expect(mixed.listSubtotal - mixed.productDiscount).toBe(mixed.total);
  });

  it("an empty cart has nothing to ship", () => {
    const t = computeTotals([]);
    expect(t.total).toBe(0);
    expect(t.itemCount).toBe(0);
  });
});

describe("catalog search", () => {
  it("corrects a typo only when the literal query has no hits", () => {
    const r = searchCatalog("tirzepatda");
    expect(r.correctedQuery).toBe("tirzepatida");
    expect(r.products.map((p) => p.slug)).toContain("tirzepatida-60mg");
    expect(searchCatalog("tirzepatida").correctedQuery).toBeUndefined();
  });

  it("returns nothing (not invented results) for unrelated terms", () => {
    expect(searchCatalog("paracetamol").products).toEqual([]);
  });

  it("related searches never repeat the query and point to other products", () => {
    const r = searchCatalog("tirzepatida");
    const related = relatedSearches(r);
    expect(related).not.toContain("Tirzepatida");
    expect(related.length).toBeGreaterThan(0);
    expect(relatedCategories(r).map((c) => c.slug)).toContain("frascos");
  });
});
