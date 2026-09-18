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
      `INSERT INTO live_events (type, severity, actor_profile_id, actor_admin_id, material_id, license_id, ip, country, region, city, device, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.reason ?? "",
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString(),
    ).run();
  } catch (error) {
    console.error("live event write failed", error);
  }
}

/**
 * Country only, from Cloudflare's `cf-ipcountry` header — the same signal
 * already used elsewhere in this codebase for analytics. Region/city are
 * intentionally left blank rather than guessed: this app has no MaxMind-
 * grade GeoIP database or third-party lookup wired in, and fabricating
 * city-level precision would violate the "approximate, never invented"
 * rule as much as skipping it entirely would violate completeness.
 */
export function approximateLocation(request: Request): { country: string; region: string; city: string } {
  return { country: request.headers.get("cf-ipcountry") || "", region: "", city: "" };
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
