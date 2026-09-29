import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { listOrders } from "@/lib/loja-orders";
import { paymentsForOrders } from "@/lib/loja-payments";
import { isOrderStatus } from "@/app/loja/_lib/order-status";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const before = sp.get("before");
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const db = (env as unknown as { DB: D1Database }).DB;
  const result = await listOrders(db, {
    status: isOrderStatus(status) ? status : undefined,
    q: q || undefined,
    before: before && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(before) ? before : undefined,
  });
  // Online charges (Pix…) per order, for the payment block on each card.
  const payments = await paymentsForOrders(db, result.orders.map((o) => o.id));
  return Response.json(
    { ...result, orders: result.orders.map((o) => ({ ...o, payments: payments[o.id] ?? [] })) },
    { headers: { "cache-control": "no-store" } },
  );
}
