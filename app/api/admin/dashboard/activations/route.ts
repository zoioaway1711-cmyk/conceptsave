import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { countActivationsByDay } from "@/lib/dashboard-stats";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.dashboard.view");
  if (admin instanceof Response) return admin;
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 30, 7), 90);
  return Response.json({ series: await countActivationsByDay(db(), days) }, { headers: { "cache-control": "no-store" } });
}
