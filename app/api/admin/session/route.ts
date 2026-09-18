import { env } from "cloudflare:workers";
import { adminConfigured, authenticateAdmin, createAdminCookie, resolveAdmin } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { describeDevice, recordLiveEvent } from "@/lib/live-events";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";

export async function GET(request: Request) {
  const admin = await resolveAdmin(request);
  return Response.json({ authenticated: Boolean(admin), username: admin?.username ?? null, permissions: admin?.permissions ?? [] }, { status: admin ? 200 : 401, headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  if (!adminConfigured()) return Response.json({ error: "admin_environment_not_configured" }, { status: 503 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const ip = clientIp(request);
  // Tight burst limit plus a longer sustained cap — both scoped to the
  // client IP, independent of the username/password guessed.
  const limit = await enforceRateLimits(db, "admin_login", ip, [
    { limit: 8, windowSeconds: 60 },
    { limit: 20, windowSeconds: 900 },
  ]);
  if (!limit.allowed) {
    await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "critical", ip, reason: "admin_login" });
    return rateLimitResponse(limit);
  }
  const body = await readBody(request, z.object({ user: z.string().trim().max(200), password: z.string().max(1000) }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const admin = await authenticateAdmin(body.user, body.password);
  if (!admin) {
    await logAudit(db, { actor: body.user || "unknown", action: "ADMIN_LOGIN", result: "failure", ip });
    await recordLiveEvent(db, { type: "ADMIN_LOGIN", severity: "warning", ip, reason: "invalid_credentials", device: describeDevice(request.headers.get("user-agent")) });
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  await logAudit(db, { actor: admin.username, action: "ADMIN_LOGIN", result: "success", ip });
  await recordLiveEvent(db, { type: "ADMIN_LOGIN", severity: "info", actorAdminId: admin.id, ip, device: describeDevice(request.headers.get("user-agent")) });
  const cookie = await createAdminCookie(admin.id);
  return Response.json({ authenticated: true, username: admin.username, permissions: admin.permissions }, { headers: { "cache-control": "no-store", "set-cookie": `vf_admin=${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` } });
}
export async function DELETE() {
  return Response.json({ authenticated: false }, { headers: { "cache-control": "no-store", "set-cookie": "vf_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" } });
}
