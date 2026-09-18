import { env } from "cloudflare:workers";
import { parseStoredJson } from "@/lib/api-validation";
import { requirePermission } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.audit.view");
  if (admin instanceof Response) return admin;
  const db = (env as unknown as { DB: D1Database }).DB;
  const { results } = await db.prepare(
    `SELECT id, actor, action, resource, resource_id AS resourceId, result, ip, metadata_json AS metadataJson, created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 500`,
  ).all();
  const records = (results as Record<string, unknown>[]).map((row) => ({ ...row, metadata: parseStoredJson(row.metadataJson, {}) }));
  return Response.json({ records }, { headers: { "cache-control": "no-store" } });
}
