import { env } from "cloudflare:workers";
import { applyProviderUpdate, cryptoUpdateFromWebhook, isDuplicateEvent, recordEvent, verifyWebhookSignature } from "@/lib/loja-payments";
import { cryptoWebhookSchema, cryptoWebhookSecret } from "@/lib/loja-crypto";

/*
 * crypto-checkout → store webhook (order.confirmed / order.paid_late /
 * order.underpaid / order.expired). Same contract as the Pix webhook
 * (app/api/loja/webhooks/pix): the signature — HMAC-SHA256 of the exact raw
 * body with CRYPTO_WEBHOOK_SECRET, in `X-Crypto-Checkout-Signature` — is
 * the only proof of origin and is checked before anything is parsed.
 *
 * The provider tries ~every 20 s, up to 5 times; the order page's polling
 * (GET /api/loja/orders/:id) is the fallback if all of them fail.
 */

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "cache-control": "no-store" } as const;

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function POST(request: Request) {
  const secret = cryptoWebhookSecret();
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });

  const raw = await request.arrayBuffer().catch(() => null);
  if (!raw) return Response.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  if (raw.byteLength > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  if (!(await verifyWebhookSignature(secret, raw, request.headers.get("x-crypto-checkout-signature")))) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: NO_STORE });
  }

  const text = new TextDecoder().decode(raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const parsed = cryptoWebhookSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  const evt = parsed.data;
  const headerEvent = request.headers.get("x-crypto-checkout-event");
  if (headerEvent && headerEvent !== evt.event) return Response.json({ error: "event_mismatch" }, { status: 400, headers: NO_STORE });

  const update = cryptoUpdateFromWebhook(evt);
  if (!update) return Response.json({ ok: true, ignored: true }, { headers: NO_STORE });

  try {
    if (await isDuplicateEvent(db(), "crypto", evt.order_id, evt.event)) return Response.json({ ok: true, duplicate: true }, { headers: NO_STORE });
    const result = await applyProviderUpdate(db(), update);
    await recordEvent(db(), "crypto", evt.order_id, evt.event, text);
    return Response.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[loja] webhook cripto falhou", error);
    return Response.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
