import { isTrustedProxyRequest } from "./proxy-trust";

export const LIVE_EVENT_TYPES = [
  "USER_LOGIN",
  "USER_LOGOUT",
  "LICENSE_CREATED",
  "LICENSE_ACTIVATED",
  "LICENSE_VALIDATED",
  "LICENSE_REVOKED",
  "LICENSE_EXPIRED",
  "INVALID_SERIAL",
  "ACTIVATION_REJECTED",
  "RATE_LIMITED",
  "SUSPICIOUS_ACTIVITY",
  "ADMIN_LOGIN",
  "ADMIN_ACTION",
] as const;
export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];
export type LiveEventSeverity = "info" | "warning" | "critical";

export type GeoPermission = "" | "granted" | "denied" | "unavailable" | "unsupported";

export type LiveEventInput = {
  type: LiveEventType;
  severity?: LiveEventSeverity;
  actorProfileId?: string | null;
  actorAdminId?: string | null;
  materialId?: number | null;
  licenseId?: number | null;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  device?: string;
  deviceFingerprint?: string;
  geoPermission?: GeoPermission;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  geoAccuracy?: number | null;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Retention: live_events carries IP/approximate-location/device on every
 * attempt (including failed ones), which is exactly the kind of data
 * minimization principle says shouldn't accumulate forever. There's no
 * cron trigger available on this hosting platform (see SECURITY.md), so —
 * matching the existing rate_limits sweep pattern in lib/rate-limit.ts —
 * cleanup is opportunistic: a small percentage of writes also delete rows
 * past the retention window.
 */
const RETENTION_DAYS = 30;
const CLEANUP_SAMPLE_RATE = 0.01;

/** Best-effort: an event-feed write must never fail or slow down the request it's describing. */
export async function recordLiveEvent(db: D1Database, input: LiveEventInput) {
  try {
    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db.prepare("DELETE FROM live_events WHERE created_at < ?").bind(cutoff).run().catch(() => {});
    }
    await db.prepare(
      `INSERT INTO live_events (type, severity, actor_profile_id, actor_admin_id, material_id, license_id, ip, country, region, city, device, device_fingerprint, geo_permission, geo_latitude, geo_longitude, geo_accuracy, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.type,
      input.severity ?? "info",
      input.actorProfileId ?? null,
      input.actorAdminId ?? null,
      input.materialId ?? null,
      input.licenseId ?? null,
      input.ip ?? "",
      input.country ?? "",
      input.region ?? "",
      input.city ?? "",
      input.device ?? "",
      input.deviceFingerprint ?? "",
      input.geoPermission ?? "",
      input.geoLatitude ?? null,
      input.geoLongitude ?? null,
      input.geoAccuracy ?? null,
      input.reason ?? "",
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString(),
    ).run();
  } catch (error) {
    console.error("live event write failed", error);
  }
}

/**
 * Through the Vercel reverse proxy (the normal path for real traffic —
 * see custom-domain notes), region/city come from Vercel's own GeoIP data
 * (`x-vercel-ip-country-region`/`x-vercel-ip-city`, forwarded by proxy.ts
 * only when `isTrustedProxyRequest` verifies they're genuinely from that
 * proxy) — real approximate data, not invented, and not the same thing as
 * browser-precise geolocation (never used here). Direct hits on the
 * Worker's own workers.dev URL (no trusted proxy headers) fall back to
 * country-only from Cloudflare's `cf-ipcountry`, the one signal available
 * there without a paid GeoIP lookup.
 *
 * Same caveat as clientIp() in lib/rate-limit.ts: through the proxy,
 * `cf-ipcountry` alone would reflect Vercel's egress, not the visitor's —
 * that's exactly why the trusted-proxy path is checked first.
 */
export function approximateLocation(request: Request): { country: string; region: string; city: string } {
  if (isTrustedProxyRequest(request)) {
    const country = request.headers.get("x-vf-real-country");
    if (country) {
      const region = request.headers.get("x-vf-real-region") || "";
      const rawCity = request.headers.get("x-vf-real-city") || "";
      let city = rawCity;
      try { city = decodeURIComponent(rawCity); } catch { /* not percent-encoded — use as-is */ }
      return { country, region, city };
    }
  }
  return { country: request.headers.get("cf-ipcountry") || "", region: "", city: "" };
}

/**
 * Reads the client-computed device signal (see public/app.js's
 * `deviceFingerprint()`) from the `x-device-fingerprint` header — a SHA-256
 * hash of coarse, stable browser/OS signals (screen size, timezone,
 * platform, language, hardware concurrency), recomputed fresh by the client
 * every request, never a persistent id issued by the server or stored in a
 * cookie. Used for fraud/abuse detection only (rate limiting, admin
 * visibility into "same device, many accounts") — see the consent copy in
 * public/index.html for how this is disclosed to visitors. Validated as a
 * plain hex string of the expected length before use, so a malicious client
 * can't stuff an oversized or malformed value into the column.
 */
export function deviceFingerprint(request: Request): string {
  const raw = request.headers.get("x-device-fingerprint") || "";
  return /^[a-f0-9]{16,64}$/i.test(raw) ? raw : "";
}

const GEO_PERMISSIONS = new Set<GeoPermission>(["granted", "denied", "unavailable", "unsupported"]);

/**
 * Reads the outcome of the browser's native Geolocation permission prompt
 * (see public/app.js's `geoSignal()`), sent as `x-geo-permission` plus, only
 * when granted, `x-geo-lat`/`x-geo-lng`/`x-geo-accuracy`. Unlike
 * `approximateLocation()` above (IP-based, no permission needed), this is
 * precise, browser-reported GPS/network location — the user explicitly
 * chose to allow or deny it, and that choice (not just the coordinates) is
 * what the admin panel needs to show. Coordinates are validated as
 * plausible lat/lng ranges before being trusted; anything malformed or an
 * unrecognized permission value is treated as "not reported" rather than
 * stored as-is.
 */
export function geoSignal(request: Request): { geoPermission: GeoPermission; geoLatitude: number | null; geoLongitude: number | null; geoAccuracy: number | null } {
  const raw = request.headers.get("x-geo-permission") || "";
  const permission = GEO_PERMISSIONS.has(raw as GeoPermission) ? (raw as GeoPermission) : "";
  if (permission !== "granted") return { geoPermission: permission, geoLatitude: null, geoLongitude: null, geoAccuracy: null };
  const lat = Number(request.headers.get("x-geo-lat"));
  const lng = Number(request.headers.get("x-geo-lng"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { geoPermission: "granted", geoLatitude: null, geoLongitude: null, geoAccuracy: null };
  }
  const accuracyRaw = Number(request.headers.get("x-geo-accuracy"));
  const accuracy = Number.isFinite(accuracyRaw) && accuracyRaw >= 0 ? accuracyRaw : null;
  return { geoPermission: "granted", geoLatitude: lat, geoLongitude: lng, geoAccuracy: accuracy };
}

/** Coarse OS/browser label for display only — never used for any security decision. */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent || "";
  const os = /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "";
  if (!os && !browser) return "";
  return [os, browser].filter(Boolean).join(" / ");
}

/** Never show a full internal profile id in the feed by default — same "minimum necessary" spirit as license masking. */
export function maskProfileId(profileId: string): string {
  return profileId.length <= 6 ? "••••" : `${profileId.slice(0, 3)}••••${profileId.slice(-4)}`;
}

/** Full IP is gated behind admin.security.ip.view — everyone else sees only the network portion. */
export function maskIp(ip: string): string {
  if (!ip) return "";
  const v4 = ip.split(".");
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.•.•`;
  const v6 = ip.split(":");
  if (v6.length >= 3) return `${v6[0]}:${v6[1]}:••••`;
  return "•••";
}

/** Same visibility boundary as maskIp() — a device fingerprint identifies a visitor just like an IP does. */
export function maskFingerprint(fingerprint: string): string {
  return fingerprint ? `${fingerprint.slice(0, 6)}••••` : "";
}
