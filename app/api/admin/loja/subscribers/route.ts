import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { deleteSubscriber, listSubscribers } from "@/lib/loja-subscribers";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  return Response.json({ subscribers: await listSubscribers(db()) }, { headers: { "cache-control": "no-store" } });
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
