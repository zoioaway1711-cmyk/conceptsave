import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { salesDashboard } from "@/lib/loja-dashboard";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  const day = new URL(request.url).searchParams.get("day");
  return Response.json(await salesDashboard((env as unknown as { DB: D1Database }).DB, day), { headers: { "cache-control": "no-store" } });
}
