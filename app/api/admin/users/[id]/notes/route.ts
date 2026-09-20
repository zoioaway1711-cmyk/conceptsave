import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { adminNoteSchema, isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

const NOTES_LIMIT = 200;

/**
 * Admin-authored notes on a customer profile — same permission bar as
 * opening the profile at all (admin.users.inspect): anyone who can see a
 * customer's full record can also leave/read notes on it for other admins,
 * without needing the separate admin.profiles.manage permission that
 * gates actually editing gamification fields.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.users.inspect");
  if (admin instanceof Response) return admin;
  const id = (await params).id;
  const notes = await db().prepare(
    `SELECT id, admin_id AS adminId, admin_username AS adminUsername, body, created_at AS createdAt
     FROM admin_notes WHERE profile_id=? ORDER BY id DESC LIMIT ${NOTES_LIMIT}`,
  ).bind(id).all<{ id: number; adminId: string; adminUsername: string; body: string; createdAt: string }>();
  return Response.json({ notes: notes.results }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.users.inspect");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const id = (await params).id;
  const body = await readBody(request, adminNoteSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const database = db();
  const profile = await database.prepare("SELECT id FROM customer_profiles WHERE id=?").bind(id).first<{ id: string }>();
  if (!profile) return Response.json({ error: "profile_not_found" }, { status: 404 });
  const createdAt = new Date().toISOString();
  const result = await database.prepare(
    `INSERT INTO admin_notes (profile_id, admin_id, admin_username, body, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, admin.id, admin.username, body.body, createdAt).run();
  await logAudit(database, { actor: admin.username, action: "ADMIN_NOTE_ADDED", resource: "customer_profiles", resourceId: maskSerial(id), result: "success", ip: clientIp(request) });
  return Response.json({
    note: { id: result.meta.last_row_id, adminId: admin.id, adminUsername: admin.username, body: body.body, createdAt },
  });
}
