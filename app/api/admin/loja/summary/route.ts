import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { ordersSummary } from "@/lib/loja-orders";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  return Response.json(await ordersSummary((env as unknown as { DB: D1Database }).DB), { headers: { "cache-control": "no-store" } });
}
