import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { REGULATED_PURCHASABLE_MESSAGE, productUpdateSchema, updateProduct } from "@/lib/loja-catalog";
import { clientIp } from "@/lib/rate-limit";

// Largest legitimate body: 2000-char description + 20 specs × 200 chars + the rest, JSON-escaped.
const MAX_BODY_CHARS = 16_000;

/** Edit a product's commercial/content fields. Price changes are audit-logged with before/after. */
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_CHARS) return Response.json({ error: "invalid_body" }, { status: 400 });
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
  if ("error" in result) {
    // Regulatory lock (vials / vial kits): refused and recorded — whoever
    // tries this should be visible in the Audit Log.
    await logAudit(db, {
      actor: admin.username,
      action: "STORE_PRODUCT_REGULATED_BLOCKED",
      resource: "loja_products",
      resourceId: slug.slice(0, 80),
      result: "failure",
      ip: clientIp(request),
      metadata: { field: "purchasable" },
    });
    return Response.json({ error: "invalid_fields", fields: { purchasable: REGULATED_PURCHASABLE_MESSAGE } }, { status: 422 });
  }
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

