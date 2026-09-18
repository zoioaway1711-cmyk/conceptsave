import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { getLicense, replaceLicense, revokeLicense } from "@/lib/licenses";
import { recordLiveEvent } from "@/lib/live-events";
import { clientIp } from "@/lib/rate-limit";
import { z } from "zod";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.licenses.manage");
  if (admin instanceof Response) return admin;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid_id" }, { status: 400 });
  const license = await getLicense(db(), id);
  if (!license) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ license: { ...license, serial: `${license.displayPrefix}-••••-••••-••••-${license.displaySuffix}` } }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(request, "admin.licenses.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid_id" }, { status: 400 });
  const body = await readBody(request, z.object({ action: z.enum(["revoke", "replace"]) }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const ip = clientIp(request);

  if (body.action === "revoke") {
    const revoked = await revokeLicense(db(), id);
    if (!revoked) return Response.json({ error: "not_revocable" }, { status: 409 });
    await logAudit(db(), { actor: admin.username, action: "LICENSE_REVOKED", resource: "licenses", resourceId: String(id), result: "success", ip });
    await recordLiveEvent(db(), { type: "LICENSE_REVOKED", severity: "warning", actorAdminId: admin.id, licenseId: id, ip });
    return Response.json({ revoked: true });
  }

  // "replace": REVOKE + GENERATE REPLACEMENT — never re-reveals a lost
  // serial (it was never stored), transfers entitlement to the new one.
  const created = await replaceLicense(db(), id);
  if (!created) return Response.json({ error: "not_replaceable" }, { status: 409 });
  await logAudit(db(), { actor: admin.username, action: "LICENSE_REVOKED", resource: "licenses", resourceId: String(id), result: "success", ip, metadata: { replacedBy: created.id } });
  await logAudit(db(), { actor: admin.username, action: "LICENSE_CREATED", resource: "licenses", resourceId: String(created.id), result: "success", ip, metadata: { serial: maskSerial(created.serial), replaces: id } });
  await recordLiveEvent(db(), { type: "LICENSE_REVOKED", severity: "warning", actorAdminId: admin.id, licenseId: id, ip });
  await recordLiveEvent(db(), { type: "LICENSE_CREATED", actorAdminId: admin.id, licenseId: created.id, ip });
  return Response.json({ license: { id: created.id, serial: created.serial } });
}
