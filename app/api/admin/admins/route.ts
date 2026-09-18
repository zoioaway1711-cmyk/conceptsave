import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/password";
import { isPermission, PERMISSIONS } from "@/lib/permissions";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { clientIp } from "@/lib/rate-limit";
import { z } from "zod";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

const permissionsField = z.array(z.string()).max(PERMISSIONS.length).refine((values) => values.every(isPermission), "Permissão desconhecida");

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.admins.manage");
  if (admin instanceof Response) return admin;
  const { results } = await db().prepare(
    "SELECT id, username, permissions_json AS permissionsJson, disabled, created_at AS createdAt, last_login_at AS lastLoginAt FROM admin_users ORDER BY created_at ASC",
  ).all<{ id: string; username: string; permissionsJson: string; disabled: number; createdAt: string; lastLoginAt: string | null }>();
  // password_hash is never selected, let alone returned.
  const admins = results.map((row) => ({ id: row.id, username: row.username, permissions: JSON.parse(row.permissionsJson), disabled: Boolean(row.disabled), createdAt: row.createdAt, lastLoginAt: row.lastLoginAt }));
  return Response.json({ admins }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.admins.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, z.object({ username: z.string().trim().min(3).max(60), password: z.string().min(12).max(200), permissions: permissionsField.default([]) }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const username = body.username.toLowerCase();
  const existing = await db().prepare("SELECT id FROM admin_users WHERE username=?").bind(username).first();
  if (existing) return Response.json({ error: "username_taken" }, { status: 409 });
  const id = `adm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db().prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, username, await hashPassword(body.password), JSON.stringify(body.permissions), now).run();
  await logAudit(db(), { actor: admin.username, action: "ADMIN_ACCOUNT_CREATED", resource: "admin_users", resourceId: id, result: "success", ip: clientIp(request), metadata: { username, permissions: body.permissions } });
  return Response.json({ admin: { id, username, permissions: body.permissions, disabled: false, createdAt: now } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const admin = await requirePermission(request, "admin.admins.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, z.object({ id: z.string().min(1).max(80), permissions: permissionsField.optional(), disabled: z.boolean().optional() }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (body.disabled && body.id === admin.id) return Response.json({ error: "cannot_disable_self" }, { status: 400 });
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.permissions) { updates.push("permissions_json=?"); values.push(JSON.stringify(body.permissions)); }
  if (body.disabled !== undefined) { updates.push("disabled=?"); values.push(body.disabled ? 1 : 0); }
  if (!updates.length) return Response.json({ error: "nothing_to_update" }, { status: 400 });
  values.push(body.id);
  const result = await db().prepare(`UPDATE admin_users SET ${updates.join(", ")} WHERE id=?`).bind(...values).run();
  if (!result.meta.changes) return Response.json({ error: "not_found" }, { status: 404 });
  await logAudit(db(), { actor: admin.username, action: "ADMIN_PERMISSION_CHANGED", resource: "admin_users", resourceId: body.id, result: "success", ip: clientIp(request), metadata: { permissions: body.permissions, disabled: body.disabled } });
  return Response.json({ saved: true });
}
