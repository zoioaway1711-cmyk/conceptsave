import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { eventMetrics } from "@/lib/loja-events";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.analytics");
  if (admin instanceof Response) return admin;
  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = [1, 7, 30, 90].includes(raw) ? raw : 7;
  return Response.json(await eventMetrics((env as unknown as { DB: D1Database }).DB, days), { headers: { "cache-control": "no-store" } });
}
