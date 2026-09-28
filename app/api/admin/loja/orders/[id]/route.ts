import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { decryptCpf, transitionOrder } from "@/lib/loja-orders";
import { maybeAlertSensitiveRevealBurst } from "@/lib/alerts";
import { clientIp, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ORDER_STATUSES } from "@/app/loja/_lib/order-status";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

const patchSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  trackingCode: z.string().trim().max(40).optional(),
  note: z.string().max(200).optional(),
});

/** Advance an order's status (validated transition, audit-logged). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, patchSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { id } = await params;
  const result = await transitionOrder(db(), id, body.status, body);
  if (!result.ok) return Response.json({ error: result.error, skus: result.skus }, { status: result.error === "not_found" ? 404 : 409 });
  await logAudit(db(), {
    actor: admin.username,
    action: "STORE_ORDER_STATUS",
    resource: "loja_orders",
    resourceId: result.order.number,
    result: "success",
    ip: clientIp(request),
    metadata: { from: result.from, to: body.status, ...(body.trackingCode ? { trackingCode: body.trackingCode } : {}) },
  });
  return Response.json({ order: result.order });
}

/** POST { action: "reveal_cpf" } — full CPF for the nota fiscal, audit-logged. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, z.object({ action: z.literal("reveal_cpf") }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { id } = await params;
  // Per-admin ceiling on CPF reveals (one per nota fiscal is the real use);
  // a stolen session looping over every order is refused and alerted.
  const budget = await consumeRateLimit(db(), "store_cpf_reveal", admin.id, 30, 3600);
  await maybeAlertSensitiveRevealBurst(db(), { adminUsername: admin.username, ip: clientIp(request), kind: "cpf", count: budget.count, threshold: 15 });
  if (!budget.allowed) {
    await logAudit(db(), { actor: admin.username, action: "STORE_ORDER_CPF_REVEAL_RATE_LIMITED", resource: "loja_orders", resourceId: id.slice(0, 80), result: "failure", ip: clientIp(request), silent: true });
    return rateLimitResponse(budget);
  }
  const row = await db()
    .prepare("SELECT number, status, customer_cpf_encrypted AS enc FROM loja_orders WHERE id = ?")
    .bind(id)
    .first<{ number: string; status: string; enc: string }>();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  await logAudit(db(), {
    actor: admin.username,
    action: "STORE_ORDER_CPF_REVEALED",
    resource: "loja_orders",
    resourceId: row.number,
    result: "success",
    ip: clientIp(request),
    metadata: { status: row.status },
  });
  // The CPF key is derived from LOJA_DATA_KEY (new orders, when set) or
  // SESSION_SECRET (legacy): if the secret used for this order was rotated
  // or removed afterwards, the ciphertext can no longer be opened.
  // Say so plainly instead of a bare 500 (and never echo crypto errors).
  let cpf: string;
  try {
    cpf = await decryptCpf(row.enc);
  } catch {
    return Response.json({ error: "cpf_unavailable" }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ cpf }, { headers: { "cache-control": "no-store" } });
}
