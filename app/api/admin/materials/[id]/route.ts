import { env } from "cloudflare:workers";
import { requireAnyPermission, requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, materialUpdateSchema, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { getMaterial, updateMaterial } from "@/lib/materials";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/** Same read-only permission split as GET /api/admin/materials — lets a license manager who only knows a numeric material id resolve its name. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAnyPermission(request, ["admin.materials.manage", "admin.licenses.manage"]);
  if (admin instanceof Response) return admin;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid_id" }, { status: 400 });
  const material = await getMaterial(db(), id);
  if (!material) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ material }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.materials.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid_id" }, { status: 400 });
  const body = await readBody(request, materialUpdateSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const material = await updateMaterial(db(), id, body);
  if (!material) return Response.json({ error: "not_found" }, { status: 404 });
  await logAudit(db(), { actor: admin.username, action: "MATERIAL_UPDATED", resource: "materials", resourceId: String(id), result: "success", ip: clientIp(request), metadata: body });
  return Response.json({ material }, { headers: { "cache-control": "no-store" } });
}
