import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { getLicense, replaceLicense, revealLicenseSerial, revokeLicense, updateLicense } from "@/lib/licenses";
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
  const body = await readBody(request, z.object({
    action: z.enum(["revoke", "replace", "update", "reveal"]),
    lot: z.string().trim().max(80).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const ip = clientIp(request);

  if (body.action === "reveal") {
    // Recovers the exact, already-issued serial for support cases (e.g.
    // resending it to a customer whose product already has it printed) —
    // separate from "replace", which mints a brand-new one instead. Every
    // successful reveal is audit-logged with the actor and license id so
    // there's accountability for who looked at what and when.
    const serial = await revealLicenseSerial(db(), id);
    if (!serial) return Response.json({ error: "not_recoverable" }, { status: 404 });
    await logAudit(db(), { actor: admin.username, action: "LICENSE_SERIAL_REVEALED", resource: "licenses", resourceId: String(id), result: "success", ip });
    await recordLiveEvent(db(), { type: "ADMIN_ACTION", severity: "warning", actorAdminId: admin.id, licenseId: id, ip, reason: "license_serial_revealed" });
    return Response.json({ serial }, { headers: { "cache-control": "no-store" } });
  }

  if (body.action === "revoke") {
    const revoked = await revokeLicense(db(), id);
    if (!revoked) return Response.json({ error: "not_revocable" }, { status: 409 });
    await logAudit(db(), { actor: admin.username, action: "LICENSE_REVOKED", resource: "licenses", resourceId: String(id), result: "success", ip });
    await recordLiveEvent(db(), { type: "LICENSE_REVOKED", severity: "warning", actorAdminId: admin.id, licenseId: id, ip });
    return Response.json({ revoked: true });
  }

  if (body.action === "update") {
    const updated = await updateLicense(db(), id, { lot: body.lot, expiresAt: body.expiresAt });
    if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
    await logAudit(db(), { actor: admin.username, action: "LICENSE_UPDATED", resource: "licenses", resourceId: String(id), result: "success", ip, metadata: { lot: body.lot, expiresAt: body.expiresAt } });
    const license = await getLicense(db(), id);
    return Response.json({ license: license ? { ...license, serial: `${license.displayPrefix}-••••-••••-••••-${license.displaySuffix}` } : null });
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
