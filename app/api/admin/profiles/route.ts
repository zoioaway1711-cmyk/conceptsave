import { env } from "cloudflare:workers";
import { adminProfileSchema, isSameOrigin, readBody } from "@/lib/api-validation";
import { requirePermission } from "@/lib/admin-auth";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { clientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.profiles.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, adminProfileSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const id = String(body.id || "").slice(0, 80);
  if (!id) return Response.json({ error: "profile_required" }, { status: 400 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const before = await db.prepare("SELECT blocked FROM customer_profiles WHERE id=?").bind(id).first<{ blocked: number }>();
  const result = await db.prepare(
    `UPDATE customer_profiles SET points=?, level=?, level_name=?, rank_override=?, blocked=?, last_active=? WHERE id=?`,
  ).bind(Math.max(0, Number(body.points || 0)), Math.max(1, Number(body.level || 1)), String(body.levelName || "Essencial").slice(0, 40), Math.max(0, Number(body.rankOverride || 0)), body.blocked ? 1 : 0, new Date().toISOString(), id).run();
  if (!result.meta.changes) return Response.json({ error: "profile_not_found" }, { status: 404 });
  const ip = clientIp(request);
  const maskedId = maskSerial(id);
  if (before && Boolean(before.blocked) !== body.blocked) {
    await logAudit(db, { actor: admin.username, action: body.blocked ? "ADMIN_PROFILE_BLOCKED" : "ADMIN_PROFILE_UNBLOCKED", resource: "customer_profiles", resourceId: maskedId, result: "success", ip });
  }
  await logAudit(db, { actor: admin.username, action: "ADMIN_PROFILE_UPDATED", resource: "customer_profiles", resourceId: maskedId, result: "success", ip });
  return Response.json({ saved: true });
}
