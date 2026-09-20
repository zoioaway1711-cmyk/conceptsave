import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { listExpiringSoon } from "@/lib/licenses";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.licenses.manage");
  if (admin instanceof Response) return admin;
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 30, 1), 365);
  return Response.json({ licenses: await listExpiringSoon(db(), days) }, { headers: { "cache-control": "no-store" } });
}
