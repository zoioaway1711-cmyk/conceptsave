import { env } from "cloudflare:workers";
import { requireAnyPermission } from "@/lib/admin-auth";
import { readCatalog } from "@/lib/loja-catalog";

/** Full catalog + settings for the admin (fresh from D1, never cached). */
export async function GET(request: Request) {
  const admin = await requireAnyPermission(request, ["admin.store.catalog", "admin.store.orders", "admin.store.analytics"]);
  if (admin instanceof Response) return admin;
  return Response.json(await readCatalog((env as unknown as { DB: D1Database }).DB), { headers: { "cache-control": "no-store" } });
}
