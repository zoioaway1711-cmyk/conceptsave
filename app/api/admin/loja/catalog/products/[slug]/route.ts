import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { productUpdateSchema, updateProduct } from "@/lib/loja-catalog";
import { clientIp } from "@/lib/rate-limit";

/** Edit a product's commercial/content fields. Price changes are audit-logged with before/after. */
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const raw = await request.text().catch(() => "");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = productUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_fields", fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) }, { status: 422 });
  }
  const { slug } = await params;
  const db = (env as unknown as { DB: D1Database }).DB;
  const result = await updateProduct(db, slug, parsed.data, admin.username);
  if (!result) return Response.json({ error: "not_found" }, { status: 404 });
  await logAudit(db, {
    actor: admin.username,
    action: "STORE_PRODUCT_UPDATED",
    resource: "loja_products",
    resourceId: slug,
    result: "success",
    ip: clientIp(request),
    metadata: {
      changed: result.changed,
      ...(result.changed.includes("price") ? { priceFrom: result.before.price, priceTo: parsed.data.price } : {}),
      ...(result.changed.includes("purchasable") ? { purchasable: parsed.data.purchasable } : {}),
    },
  });
  return Response.json({ ok: true, changed: result.changed });
}

