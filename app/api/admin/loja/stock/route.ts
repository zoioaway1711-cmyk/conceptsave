import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { listStock, setStock } from "@/lib/loja-stock";
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
  sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
  quantity: z.number().int().min(0).max(100000).nullable(),
  // The quantity the admin saw (null = not controlled); see setStock().
  expected: z.number().int().min(0).max(100000).nullable(),
});

export async function PUT(request: Request) {
  const admin = await requirePermission(request, "admin.store.orders");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, putSchema, 1000);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  // setStock loads the catalog itself and rejects unknown SKUs.
  const outcome = await setStock(db(), body.sku, body.quantity, body.expected, admin.username);
  if (outcome === "unknown_sku") return Response.json({ error: "unknown_sku" }, { status: 400 });
  if (outcome === "conflict") return Response.json({ error: "stock_conflict", stock: await listStock(db()) }, { status: 409 });
  await logAudit(db(), {
    actor: admin.username,
    action: "STORE_STOCK_SET",
    resource: "loja_stock",
    resourceId: body.sku,
    result: "success",
    ip: clientIp(request),
    // Before AND after: the trail must show what was overwritten, not just the new value.
    metadata: { from: body.expected, quantity: body.quantity },
  });
  return Response.json({ stock: await listStock(db()) });
}
