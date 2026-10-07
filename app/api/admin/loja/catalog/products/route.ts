import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { REGULATED_PURCHASABLE_MESSAGE, createProduct, productCreateSchema } from "@/lib/loja-catalog";
import { clientIp } from "@/lib/rate-limit";

const MAX_BODY_CHARS = 16_000;

/** Adds a product to the store. */
export async function POST(request: Request) {
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
  const parsed = productCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_fields", fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) }, { status: 422 });
  }
  const db = (env as unknown as { DB: D1Database }).DB;
  const result = await createProduct(db, parsed.data, admin.username);
  if ("error" in result) {
    const fields =
      result.error === "regulated"
        ? { purchasable: REGULATED_PURCHASABLE_MESSAGE }
        : result.error === "slug_taken"
          ? { slug: "Já existe um produto com este endereço" }
          : { sku: "Já existe um produto com este SKU" };
    return Response.json({ error: "invalid_fields", fields }, { status: 422 });
  }
  await logAudit(db, {
    actor: admin.username,
    action: "STORE_PRODUCT_CREATED",
    resource: "loja_products",
    resourceId: parsed.data.slug,
    result: "success",
    ip: clientIp(request),
    metadata: { name: parsed.data.name, price: parsed.data.price, category: parsed.data.category, purchasable: parsed.data.purchasable },
  });
  return Response.json({ ok: true, slug: parsed.data.slug }, { status: 201 });
}
