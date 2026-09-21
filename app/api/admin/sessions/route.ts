import { env } from "cloudflare:workers";
import { hasPermission, listAdminSessions, resolveAdmin } from "@/lib/admin-auth";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/**
 * No dedicated permission gate beyond being a logged-in admin at all —
 * seeing your OWN active sessions ("what's logged in as me right now") is
 * baseline account security, not a privileged capability. Only admins
 * with admin.admins.manage see every admin's sessions, mirroring the
 * Admins page's own permission bar right next to this in the UI.
 */
export async function GET(request: Request) {
  const admin = await resolveAdmin(request);
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  const canManageAll = hasPermission(admin, "admin.admins.manage");
  const sessions = await listAdminSessions(db(), canManageAll ? undefined : admin.id);
  return Response.json({ sessions, currentSessionId: admin.sessionId ?? null, canManageAll }, { headers: { "cache-control": "no-store" } });
}
