import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { readCatalog, settingsSchema, updateSettings } from "@/lib/loja-catalog";
import { clientIp } from "@/lib/rate-limit";

export async function PUT(request: Request) {
  const admin = await requirePermission(request, "admin.store.catalog");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  let json: unknown;
  try {
    json = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_fields", fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) }, { status: 422 });
  }
  const db = (env as unknown as { DB: D1Database }).DB;
  const before = (await readCatalog(db)).settings;
  await updateSettings(db, parsed.data, admin.username);
  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter((k) => before[k] !== parsed.data[k]);
  await logAudit(db, { actor: admin.username, action: "STORE_SETTINGS_UPDATED", resource: "loja_settings", resourceId: "loja", result: "success", ip: clientIp(request), metadata: { changed } });
  return Response.json({ ok: true, changed });
}
