import { afterEach, describe, expect, it, vi } from "vitest";

const prepare = vi.fn(() => ({ bind: () => ({ first: async () => ({ count: 1 }), run: async () => ({}) }) }));
vi.mock("cloudflare:workers", () => ({ env: { DB: { prepare } } }));

const { GET } = await import("../app/api/loja/cep/[cep]/route");

const call = (cep: string) => GET(new Request(`https://loja.test/api/loja/cep/${cep}`), { params: Promise.resolve({ cep }) });

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/loja/cep/:cep", () => {
  it("rejects malformed CEPs without calling the upstream service", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await call("123");
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes a found address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ cep: "01310-100", logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "sp" })));
    const res = await call("01310-100");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cep: "01310100", street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo", uf: "SP" });
  });

  it("maps ViaCEP's {erro:true} to 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ erro: "true" })));
    expect((await call("99999999")).status).toBe(404);
  });

  it("reports the service as unavailable instead of inventing an address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    const res = await call("01310100");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "lookup_unavailable" });
  });
});
