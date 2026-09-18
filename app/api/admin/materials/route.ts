import { env } from "cloudflare:workers";
import { requireAnyPermission, requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, materialCreateSchema, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { createMaterial, listMaterials } from "@/lib/materials";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  // Listing (read-only) is also allowed for license managers, who need it
  // to pick which material a new license belongs to — creating/editing a
  // material itself stays behind admin.materials.manage alone (POST below).
  const admin = await requireAnyPermission(request, ["admin.materials.manage", "admin.licenses.manage"]);
  if (admin instanceof Response) return admin;
  return Response.json({ materials: await listMaterials(db()) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.materials.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, materialCreateSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  try {
    const material = await createMaterial(db(), body);
    await logAudit(db(), { actor: admin.username, action: "MATERIAL_CREATED", resource: "materials", resourceId: String(material.id), result: "success", ip: clientIp(request), metadata: { name: material.name, prefixCode: material.prefixCode } });
    return Response.json({ material }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "invalid_material" }, { status: 400 });
  }
}
