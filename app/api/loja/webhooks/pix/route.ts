import { env } from "cloudflare:workers";
import { pixUpdateFromWebhook, applyProviderUpdate, isDuplicateEvent, recordEvent, verifyWebhookSignature } from "@/lib/loja-payments";
import { pixWebhookSchema, pixWebhookSecret } from "@/lib/loja-pix";

/*
 * pix-checkout → store webhook (order.paid / order.expired / order.held).
 * Called server-to-server from the public internet: no cookie, no Origin.
 * The only proof of origin is the signature — HMAC-SHA256 of the exact raw
 * body with PIX_STORE_WEBHOOK_SECRET, in `X-Pix-Checkout-Signature` —
 * so it is checked on the raw bytes BEFORE anything is parsed or stored.
 *
 * Answers (the provider retries anything that isn't 2xx, up to 8 times):
 *   200 processed, duplicate, or deliberately ignored (unknown event,
 *       charge that isn't ours) — retrying wouldn't change the outcome
 *   401 bad signature · 400 unreadable body · 413 too large
 *   503 secret not configured · 500 our own failure (worth a retry)
 */

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "cache-control": "no-store" } as const;

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function POST(request: Request) {
  const secret = pixWebhookSecret();
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });

  const raw = await request.arrayBuffer().catch(() => null);
  if (!raw) return Response.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  if (raw.byteLength > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  if (!(await verifyWebhookSignature(secret, raw, request.headers.get("x-pix-checkout-signature")))) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: NO_STORE });
  }

  const text = new TextDecoder().decode(raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const parsed = pixWebhookSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  const evt = parsed.data;
  const headerEvent = request.headers.get("x-pix-checkout-event");
  if (headerEvent && headerEvent !== evt.event) return Response.json({ error: "event_mismatch" }, { status: 400, headers: NO_STORE });

  const update = pixUpdateFromWebhook(evt);
  if (!update) return Response.json({ ok: true, ignored: true }, { headers: NO_STORE });

  try {
    if (await isDuplicateEvent(db(), "pix", evt.order_id, evt.event)) return Response.json({ ok: true, duplicate: true }, { headers: NO_STORE });
    const result = await applyProviderUpdate(db(), update);
    await recordEvent(db(), "pix", evt.order_id, evt.event, text);
    return Response.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[loja] webhook Pix falhou", error);
    return Response.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
