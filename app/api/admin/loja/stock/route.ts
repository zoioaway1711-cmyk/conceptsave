import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { STOCK_SKUS, listStock, setStock } from "@/lib/loja-stock";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  return Response.json({ stock: await listStock(db()) }, { headers: { "cache-control": "no-store" } });
}

const putSchema = z.object({
  sku: z.string().refine((s) => STOCK_SKUS.includes(s)),
  quantity: z.number().int().min(0).max(100000).nullable(),
});

export async function PUT(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, putSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  await setStock(db(), body.sku, body.quantity, admin.username);
  await logAudit(db(), {
    actor: admin.username,
    action: "STORE_STOCK_SET",
    resource: "loja_stock",
    resourceId: body.sku,
    result: "success",
    ip: clientIp(request),
    metadata: { quantity: body.quantity },
  });
  return Response.json({ stock: await listStock(db()) });
}
