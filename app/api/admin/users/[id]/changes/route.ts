import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { parseStoredJson } from "@/lib/api-validation";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

const CHANGES_LIMIT = 100;

/**
 * Same permission bar as the notes endpoint next to it
 * (admin.users.inspect) — seeing what changed on a profile is part of
 * "opening the profile", not a separate, more sensitive capability.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.users.inspect");
  if (admin instanceof Response) return admin;
  const id = (await params).id;
  const { results } = await db().prepare(
    `SELECT id, admin_id AS adminId, admin_username AS adminUsername, changes_json AS changesJson, created_at AS createdAt
     FROM admin_profile_changes WHERE profile_id=? ORDER BY id DESC LIMIT ${CHANGES_LIMIT}`,
  ).bind(id).all<{ id: number; adminId: string; adminUsername: string; changesJson: string; createdAt: string }>();
  const changes = results.map((row) => ({ id: row.id, adminId: row.adminId, adminUsername: row.adminUsername, fields: parseStoredJson(row.changesJson, {}), createdAt: row.createdAt }));
  return Response.json({ changes }, { headers: { "cache-control": "no-store" } });
}
