import { env } from "cloudflare:workers";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";

/*
 * CEP → address lookup for the storefront (/loja), proxied server-side to
 * ViaCEP. The browser's CSP only allows `connect-src 'self'`, so the lookup
 * has to happen here; that also lets us rate-limit it and normalize the
 * response. Only the address is returned — this endpoint says nothing
 * about delivery price or time, which the store has no rules for yet.
 */

type ViaCep = { cep?: string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };

export async function GET(request: Request, { params }: { params: Promise<{ cep: string }> }) {
  const cep = (await params).cep.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) return Response.json({ error: "invalid_cep" }, { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_cep", clientIp(request), [
    { limit: 20, windowSeconds: 60 },
    { limit: 200, windowSeconds: 3600 },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  let data: ViaCep;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    // ViaCEP answers 400 for malformed input and 200 + {erro:true} for a
    // well-formed CEP that doesn't exist.
    if (!res.ok) return Response.json({ error: "lookup_unavailable" }, { status: 502 });
    data = (await res.json()) as ViaCep;
  } catch {
    return Response.json({ error: "lookup_unavailable" }, { status: 502 });
  }

  if (data.erro) return Response.json({ error: "not_found" }, { status: 404 });
  const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return Response.json({
    cep,
    street: clip(data.logradouro, 160),
    district: clip(data.bairro, 80),
    city: clip(data.localidade, 80),
    uf: clip(data.uf, 2).toUpperCase(),
  });
}
