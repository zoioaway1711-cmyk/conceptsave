import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { deleteSubscriber, listSubscribers } from "@/lib/loja-subscribers";
import { clientIp, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/**
 * The whole opt-in list (up to 5000 e-mails) in one response — effectively
 * an export. Every read is recorded in the Audit Log (silently, no
 * Telegram ping per tab open) and capped per admin, so a stolen admin
 * session can't pull the list repeatedly without leaving a trail.
 */
export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  const budget = await consumeRateLimit(db(), "store_subscribers_list", admin.id, 30, 3600);
  if (!budget.allowed) {
    await logAudit(db(), { actor: admin.username, action: "STORE_SUBSCRIBERS_LIST_RATE_LIMITED", resource: "loja_subscribers", result: "failure", ip: clientIp(request), silent: budget.count > 31 });
    return rateLimitResponse(budget);
  }
  const subscribers = await listSubscribers(db());
  await logAudit(db(), { actor: admin.username, action: "STORE_SUBSCRIBERS_LISTED", resource: "loja_subscribers", result: "success", ip: clientIp(request), metadata: { count: subscribers.length }, silent: true });
  return Response.json({ subscribers }, { headers: { "cache-control": "no-store" } });
}

/** DELETE ?id= — removal on request (LGPD), audit-logged without the e-mail. */
export async function DELETE(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid_id" }, { status: 400 });
  if (!(await deleteSubscriber(db(), id))) return Response.json({ error: "not_found" }, { status: 404 });
  await logAudit(db(), { actor: admin.username, action: "STORE_SUBSCRIBER_DELETED", resource: "loja_subscribers", resourceId: String(id), result: "success", ip: clientIp(request) });
  return new Response(null, { status: 204 });
}
