import { env } from "cloudflare:workers";
import { hasPermission, resolveAdmin, revokeAdminSession } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { recordLiveEvent } from "@/lib/live-events";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/**
 * Revoking your OWN session needs no special permission (same "sign out
 * this device" bar as GET .../sessions). Revoking someone ELSE's session
 * needs admin.admins.manage — see revokeAdminSession's own ownership
 * check, which this route relies on rather than duplicating.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await resolveAdmin(request);
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const sessionId = (await params).id;
  const canManageAll = hasPermission(admin, "admin.admins.manage");
  const revoked = await revokeAdminSession(db(), sessionId, { id: admin.id, canManageAll });
  if (!revoked) return Response.json({ error: "not_revocable" }, { status: 404 });
  const ip = clientIp(request);
  await logAudit(db(), { actor: admin.username, action: "ADMIN_SESSION_REVOKED", resource: "admin_sessions", resourceId: sessionId, result: "success", ip });
  await recordLiveEvent(db(), { type: "ADMIN_ACTION", severity: "warning", actorAdminId: admin.id, ip, reason: "admin_session_revoked" });
  return Response.json({ revoked: true });
}
