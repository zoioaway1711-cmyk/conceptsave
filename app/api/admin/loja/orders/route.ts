import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { listOrders } from "@/lib/loja-orders";
import { isOrderStatus } from "@/app/loja/_lib/order-status";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const before = sp.get("before");
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const result = await listOrders((env as unknown as { DB: D1Database }).DB, {
    status: isOrderStatus(status) ? status : undefined,
    q: q || undefined,
    before: before && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(before) ? before : undefined,
  });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
