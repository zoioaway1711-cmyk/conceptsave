import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { invalidateCatalog } from "@/lib/loja-catalog";
import { moderateReview } from "@/lib/loja-reviews";
import { clientIp } from "@/lib/rate-limit";

const bodySchema = z.object({ status: z.enum(["approved", "rejected"]) }).strict();

/** Approve (publish) or reject a review; the product's rating is recomputed from approved reviews. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { id } = await params;
  if (!/^rev_[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const result = await moderateReview(db, id, parsed.data.status, admin.username);
  if (!result) return Response.json({ error: "not_found" }, { status: 404 });
  invalidateCatalog();
  await logAudit(db, {
    actor: admin.username,
    action: parsed.data.status === "approved" ? "STORE_REVIEW_APPROVED" : "STORE_REVIEW_REJECTED",
    resource: "loja_reviews",
    resourceId: id,
    result: "success",
    ip: clientIp(request),
    metadata: { product: result.slug, from: result.from },
  });
  return Response.json({ ok: true });
}
