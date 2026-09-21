import { env } from "cloudflare:workers";
import { adminProfileSchema, isSameOrigin, readBody } from "@/lib/api-validation";
import { requirePermission } from "@/lib/admin-auth";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { clientIp } from "@/lib/rate-limit";

type EditableProfileField = "points" | "level" | "levelName" | "rankOverride" | "blocked";
const FIELD_LABELS: Record<EditableProfileField, string> = {
  points: "Points",
  level: "Level",
  levelName: "Level name",
  rankOverride: "Rank override",
  blocked: "Blocked",
};

export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.profiles.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, adminProfileSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const id = String(body.id || "").slice(0, 80);
  if (!id) return Response.json({ error: "profile_required" }, { status: 400 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const before = await db.prepare(
    "SELECT points, level, level_name AS levelName, rank_override AS rankOverride, blocked FROM customer_profiles WHERE id=?",
  ).bind(id).first<{ points: number; level: number; levelName: string; rankOverride: number; blocked: number }>();
  if (!before) return Response.json({ error: "profile_not_found" }, { status: 404 });

  const next = {
    points: Math.max(0, Number(body.points || 0)),
    level: Math.max(1, Number(body.level || 1)),
    levelName: String(body.levelName || "Essencial").slice(0, 40),
    rankOverride: Math.max(0, Number(body.rankOverride || 0)),
    blocked: body.blocked ? 1 : 0,
  };
  await db.prepare(
    `UPDATE customer_profiles SET points=?, level=?, level_name=?, rank_override=?, blocked=?, last_active=? WHERE id=?`,
  ).bind(next.points, next.level, next.levelName, next.rankOverride, next.blocked, new Date().toISOString(), id).run();

  const ip = clientIp(request);
  const maskedId = maskSerial(id);
  if (Boolean(before.blocked) !== body.blocked) {
    await logAudit(db, { actor: admin.username, action: body.blocked ? "ADMIN_PROFILE_BLOCKED" : "ADMIN_PROFILE_UNBLOCKED", resource: "customer_profiles", resourceId: maskedId, result: "success", ip });
  }

  // Field-level diff, stored keyed by the RAW profile id (unlike the
  // audit_logs entry below, which masks it) so this profile's own change
  // history can be looked up exactly — see db/schema.ts's
  // adminProfileChanges comment for why the masked audit log id isn't
  // safe to use for that. Only actually-changed fields are recorded; a
  // no-op save (re-submitting the same values) writes nothing here.
  const changes: Partial<Record<EditableProfileField, { from: unknown; to: unknown }>> = {};
  (Object.keys(FIELD_LABELS) as EditableProfileField[]).forEach((field) => {
    const fromValue = field === "blocked" ? Boolean(before.blocked) : before[field];
    const toValue = field === "blocked" ? Boolean(next.blocked) : next[field];
    if (fromValue !== toValue) changes[field] = { from: fromValue, to: toValue };
  });
  if (Object.keys(changes).length > 0) {
    await db.prepare(
      `INSERT INTO admin_profile_changes (profile_id, admin_id, admin_username, changes_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, admin.id, admin.username, JSON.stringify(changes), new Date().toISOString()).run();
    await logAudit(db, { actor: admin.username, action: "ADMIN_PROFILE_UPDATED", resource: "customer_profiles", resourceId: maskedId, result: "success", ip, metadata: { changedFields: Object.keys(changes) } });
  }
  return Response.json({ saved: true });
}
