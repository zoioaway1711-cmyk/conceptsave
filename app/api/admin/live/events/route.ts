import { env } from "cloudflare:workers";
import { hasPermission, requirePermission } from "@/lib/admin-auth";
import { parseStoredJson } from "@/lib/api-validation";
import { maskIp, maskProfileId } from "@/lib/live-events";
import { isLiveWindow, windowStartIso } from "@/lib/live-window";
import { enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

const FILTER_TYPES: Record<string, string[] | null> = {
  ALL: null,
  ACTIVATIONS: ["LICENSE_CREATED", "LICENSE_ACTIVATED", "LICENSE_VALIDATED"],
  INVALID: ["INVALID_SERIAL", "ACTIVATION_REJECTED", "LICENSE_EXPIRED", "LICENSE_REVOKED"],
  SECURITY: ["RATE_LIMITED", "SUSPICIOUS_ACTIVITY", "ADMIN_LOGIN", "ADMIN_ACTION"],
};

const PAGE_SIZE = 100;

type LiveEventRow = {
  id: number; type: string; severity: string; actorProfileId: string | null; actorAdminId: string | null;
  materialId: number | null; licenseId: number | null; ip: string; country: string; region: string; city: string;
  device: string; reason: string; metadataJson: string; createdAt: string;
};

export async function GET(request: Request) {
  const admin = await requirePermission(request, "admin.live.view");
  if (admin instanceof Response) return admin;
  const db_ = db();
  const limit = await enforceRateLimits(db_, "live_events_poll", `${admin.id}`, [{ limit: 60, windowSeconds: 60 }]);
  if (!limit.allowed) return rateLimitResponse(limit);

  const params = new URL(request.url).searchParams;
  const since = Number(params.get("since"));
  const filter = (params.get("filter") || "ALL").toUpperCase();
  const windowParam = params.get("window");
  const types = Object.prototype.hasOwnProperty.call(FILTER_TYPES, filter) ? FILTER_TYPES[filter] : undefined;
  if (types === undefined) return Response.json({ error: "invalid_filter" }, { status: 400 });

  const clauses: string[] = [];
  const values: unknown[] = [];
  if (Number.isInteger(since) && since > 0) { clauses.push("id > ?"); values.push(since); }
  else if (isLiveWindow(windowParam)) { clauses.push("created_at > ?"); values.push(windowStartIso(windowParam)); }
  if (types) { clauses.push(`type IN (${types.map(() => "?").join(",")})`); values.push(...types); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { results } = await db_.prepare(
    `SELECT id, type, severity, actor_profile_id AS actorProfileId, actor_admin_id AS actorAdminId, material_id AS materialId, license_id AS licenseId, ip, country, region, city, device, reason, metadata_json AS metadataJson, created_at AS createdAt
     FROM live_events ${where} ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
  ).bind(...values).all<LiveEventRow>();

  const canViewIp = hasPermission(admin, "admin.security.ip.view");
  const canInspectUsers = hasPermission(admin, "admin.users.inspect");
  const events = results.reverse().map((row) => ({
    ...row,
    ip: canViewIp ? row.ip : maskIp(String(row.ip ?? "")),
    actorProfileId: row.actorProfileId ? (canInspectUsers ? row.actorProfileId : maskProfileId(String(row.actorProfileId))) : null,
    metadata: parseStoredJson(row.metadataJson, {}),
  }));

  return Response.json({ events, cursor: events.length ? events[events.length - 1].id : since || 0 }, { headers: { "cache-control": "no-store" } });
}
