import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { REVIEW_STATUSES, listReviews, type ReviewStatus } from "@/lib/loja-reviews";

/** Customer reviews for moderation (?status=pending|approved|rejected). */
export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  const status = new URL(request.url).searchParams.get("status");
  const filter = (REVIEW_STATUSES as readonly string[]).includes(status ?? "") ? (status as ReviewStatus) : undefined;
  const reviews = await listReviews((env as unknown as { DB: D1Database }).DB, filter);
  return Response.json({ reviews }, { headers: { "cache-control": "no-store" } });
}
