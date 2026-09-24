import { describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

vi.mock("cloudflare:workers", () => ({ env: {} }));
const { cleanPath, eventMetrics, eventsBatchSchema, insertEvents, redactTerm, sanitizeParams } = await import("../lib/loja-events");

describe("loja analytics privacy", () => {
  it("drops non-allowlisted params and item fields", () => {
    const out = sanitizeParams({
      search_term: "diluente",
      email: "maria@example.com",
      cpf: "52998224725",
      items: [{ item_id: "x", item_name: "Kit", customer: "Maria" }],
    });
    expect(out).toEqual({ search_term: "diluente", items: [{ item_id: "x", item_name: "Kit" }] });
  });

  it("redacts e-mails and number sequences typed into search", () => {
    expect(redactTerm("maria@example.com")).toBe("[e-mail]");
    expect(redactTerm("529.982.247-25")).toBe("[número]");
    expect(redactTerm("(11) 98765-4321")).toBe("[número]");
    expect(redactTerm("tirzepatida 60mg")).toBe("tirzepatida 60mg");
  });

  it("strips query strings from paths", () => {
    expect(cleanPath("/loja/busca?q=meu+nome")).toBe("/loja/busca");
  });

  it("rejects unknown event names", () => {
    expect(eventsBatchSchema.safeParse({ sessionId: "abcdefgh12", events: [{ name: "login", path: "/" }] }).success).toBe(false);
  });

  it("aggregates a funnel by distinct session", async () => {
    const db = createFakeD1();
    applyMigrations(db);
    await insertEvents(db as never, { sessionId: "sessionaaaa1", events: [{ name: "view_item", path: "/loja", params: {} }, { name: "add_to_cart", path: "/loja", params: {} }] });
    await insertEvents(db as never, { sessionId: "sessionbbbb2", events: [{ name: "view_item", path: "/loja", params: {} }] });
    const m = await eventMetrics(db as never, 7);
    expect(m.sessions).toBe(2);
    expect(m.funnel.find((f) => f.step === "view_item")?.sessions).toBe(2);
    expect(m.funnel.find((f) => f.step === "add_to_cart")?.sessions).toBe(1);
  });
});
