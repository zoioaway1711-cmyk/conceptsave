import { env } from "cloudflare:workers";
import { fetchCryptoReceipt } from "@/lib/loja-crypto";
import { verifyOrderAccessToken } from "@/lib/loja-orders";
import { paidCryptoCharge } from "@/lib/loja-payments";
import { enforceRateLimits, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

/*
 * GET — the crypto payment receipt (PDF) for the customer. The provider
 * only serves it with the store's API key, so the store fetches and
 * streams it. The order's capability token comes in the `x-order-token`
 * header (never in the URL: no history, no Referer, no logs), which is why
 * the order page downloads it with fetch() instead of a plain link.
 * Pix receipts don't come through here: they have a public link.
 */

const PRIVATE = { "cache-control": "private, no-store, max-age=0", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_receipt", rateLimitKey(request), [{ limit: 20, windowSeconds: 600 }]);
  if (!limit.allowed) return rateLimitResponse(limit);
  const { id } = await params;
  const token = request.headers.get("x-order-token") ?? "";
  const notFound = () => Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
  if (!/^ord_[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(token) || !(await verifyOrderAccessToken(id, token))) return notFound();
  const charge = await paidCryptoCharge(db, id);
  if (!charge) return notFound();
  const upstream = await fetchCryptoReceipt(charge.providerRef);
  if (!upstream?.body) return Response.json({ error: "receipt_unavailable" }, { status: 503, headers: PRIVATE });
  return new Response(upstream.body, {
    headers: {
      ...PRIVATE,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="comprovante-${charge.providerRef}.pdf"`,
      "x-content-type-options": "nosniff",
    },
  });
}
