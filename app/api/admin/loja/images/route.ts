import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { imageUploadSchema, saveImage } from "@/lib/loja-images";
import { clientIp, enforceRateLimits } from "@/lib/rate-limit";

/** Stores a product photo the admin page already resized (960 + 480 px). Returns its image base path. */
export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = await enforceRateLimits(db, "loja_image_upload", admin.username, [{ limit: 60, windowSeconds: 3600 }]);
  if (!limit.allowed) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = imageUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_image" }, { status: 422 });
  const result = await saveImage(db, parsed.data, admin.username);
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  await logAudit(db, { actor: admin.username, action: "STORE_IMAGE_UPLOADED", resource: "loja_images", resourceId: result.base.slice(-32), result: "success", ip: clientIp(request), metadata: { width: result.width, height: result.height } });
  return Response.json(result, { status: 201 });
}
