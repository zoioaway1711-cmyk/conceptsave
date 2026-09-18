import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, licenseCreateSchema, readBody } from "@/lib/api-validation";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { createLicense, listLicensesForMaterial } from "@/lib/licenses";
import { recordLiveEvent } from "@/lib/live-events";
import { clientIp } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.licenses.manage");
  if (admin instanceof Response) return admin;
  const materialId = Number(new URL(request.url).searchParams.get("materialId"));
  if (!Number.isInteger(materialId) || materialId <= 0) return Response.json({ error: "invalid_material_id" }, { status: 400 });
  // Listings are masked by construction — listLicensesForMaterial never
  // selects the plaintext serial, which was never stored in the first
  // place. There is deliberately no "reveal all serials" endpoint.
  return Response.json({ licenses: await listLicensesForMaterial(db(), materialId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.licenses.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, licenseCreateSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  try {
    const license = await createLicense(db(), body.materialId, { lot: body.lot, expiresAt: body.expiresAt });
    await logAudit(db(), { actor: admin.username, action: "LICENSE_CREATED", resource: "licenses", resourceId: String(license.id), result: "success", ip: clientIp(request), metadata: { serial: maskSerial(license.serial) } });
    await recordLiveEvent(db(), { type: "LICENSE_CREATED", actorAdminId: admin.id, materialId: body.materialId, licenseId: license.id, ip: clientIp(request) });
    // SHOW ONCE: this is the only response that will ever contain the
    // plaintext serial — it is not persisted anywhere. Every later read of
    // this license returns only the masked display form.
    return Response.json({ license: { id: license.id, serial: license.serial } }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "material_not_found" }, { status: 404 });
  }
}
