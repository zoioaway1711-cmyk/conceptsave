import { env } from "cloudflare:workers";
import { requireAnyPermission } from "@/lib/admin-auth";
import { getMaterial } from "@/lib/materials";

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
