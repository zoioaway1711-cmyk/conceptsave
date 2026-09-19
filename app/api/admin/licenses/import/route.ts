import { env } from "cloudflare:workers";
import { hasPermission, resolveAdmin } from "@/lib/admin-auth";
import { isSameOrigin, licenseImportSchema, readBody } from "@/lib/api-validation";
import { logAudit, maskSerial } from "@/lib/audit-log";
import { importLicense } from "@/lib/licenses";
import { createMaterial, getMaterialBySlug, slugify } from "@/lib/materials";
import { recordLiveEvent } from "@/lib/live-events";
import { clientIp } from "@/lib/rate-limit";
import { normalizeSerial } from "@/lib/serial";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

type RowResult =
  | { index: number; status: "created"; product: string; materialId: number; licenseId: number; serial: string }
  | { index: number; status: "duplicate" | "error"; product: string; error: string };

/**
 * Bulk-imports licenses whose plaintext serials come from an EXTERNAL
 * source (e.g. a pre-printed batch sheet) rather than being generated here
 * — the one legitimate reason this endpoint is allowed to hand back a list
 * of plaintext serials in bulk. Same SHOW-ONCE contract as single license
 * creation: this response is the only place any of these serials ever
 * appear — none of them are persisted anywhere (only their HMAC digest).
 * One material per distinct product name is found-or-created so re-running
 * the same sheet (or importing it in batches) never duplicates a material.
 */
export async function POST(request: Request) {
  const admin = await resolveAdmin(request);
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Creates both materials and licenses, so — unlike the read-only material
  // listing — this deliberately requires BOTH permissions rather than
  // either one alone.
  if (!hasPermission(admin, "admin.materials.manage") || !hasPermission(admin, "admin.licenses.manage")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, licenseImportSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });

  const database = db();
  const ip = clientIp(request);
  const materialCache = new Map<string, number>();
  const results: RowResult[] = [];
  let created = 0;

  for (let index = 0; index < body.rows.length; index++) {
    const row = body.rows[index];
    const serial = normalizeSerial(row.serial);
    const slug = slugify(row.product);
    try {
      let materialId = materialCache.get(slug);
      if (materialId === undefined) {
        const existing = await getMaterialBySlug(database, slug);
        if (existing) {
          materialId = existing.id;
        } else {
          const prefixCode = serial.split("-")[0]?.slice(0, 10) || "SAVEC";
          const material = await createMaterial(database, { name: row.product, prefixCode, maker: body.maker, brand: body.brand });
          await logAudit(database, { actor: admin.username, action: "MATERIAL_CREATED", resource: "materials", resourceId: String(material.id), result: "success", ip, metadata: { name: material.name, prefixCode: material.prefixCode, source: "bulk_import" } });
          materialId = material.id;
        }
        materialCache.set(slug, materialId);
      }

      const license = await importLicense(database, materialId, serial, { lot: row.lot, expiresAt: row.expiresAt });
      await logAudit(database, { actor: admin.username, action: "LICENSE_CREATED", resource: "licenses", resourceId: String(license.id), result: "success", ip, metadata: { serial: maskSerial(license.serial), source: "bulk_import" } });
      await recordLiveEvent(database, { type: "LICENSE_CREATED", actorAdminId: admin.id, materialId, licenseId: license.id, ip });
      results.push({ index, status: "created", product: row.product, materialId, licenseId: license.id, serial: license.serial });
      created++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      results.push({ index, status: message === "duplicate_serial" ? "duplicate" : "error", product: row.product, error: message });
    }
  }

  await logAudit(database, { actor: admin.username, action: "LICENSES_IMPORTED", resource: "licenses", result: "success", ip, metadata: { total: body.rows.length, created } });

  return Response.json({ results, summary: { total: body.rows.length, created, skipped: body.rows.length - created } }, { status: 201, headers: { "cache-control": "no-store" } });
}
