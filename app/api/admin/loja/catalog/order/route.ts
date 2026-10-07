import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { reorderProducts, reorderSchema } from "@/lib/loja-catalog";
import { clientIp } from "@/lib/rate-limit";

/** Sets the order products are shown in. The body lists every slug once. */
export async function PUT(request: Request) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const db = (env as unknown as { DB: D1Database }).DB;
  if (!(await reorderProducts(db, parsed.data.slugs, admin.username))) return Response.json({ error: "stale_list" }, { status: 409 });
  await logAudit(db, { actor: admin.username, action: "STORE_PRODUCTS_REORDERED", resource: "loja_products", resourceId: "loja", result: "success", ip: clientIp(request), metadata: { count: parsed.data.slugs.length } });
  return Response.json({ ok: true });
}
