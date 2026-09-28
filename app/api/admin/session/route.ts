import { env } from "cloudflare:workers";
import { ADMIN_SESSION_MAX_AGE_SECONDS, adminConfigured, authenticateAdmin, createAdminCookie, resolveAdmin, revokeAdminSession } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { logAudit } from "@/lib/audit-log";
import { maybeAlertAdminLoginRateLimited, maybeAlertUnrecognizedAdminLogin, notifyIpAutoBlocked } from "@/lib/alerts";
import { blockIp, isIpBlocked } from "@/lib/ip-blocks";
import { describeDevice, recordLiveEvent } from "@/lib/live-events";
import { clientIp, consumeRateLimit, peekRateLimit, rateLimitKey, rateLimitResponse, type RateLimitResult } from "@/lib/rate-limit";
import { ADMIN_COOKIE, LEGACY_ADMIN_COOKIE, clearedSessionCookies, headersWithCookies, sessionCookies } from "@/lib/session-cookie";
import { z } from "zod";

// Crossing this many attempts within the sustained window (see below)
// escalates from "slow this IP down" to "block this IP outright for
// 24h" — see lib/ip-blocks.ts. Deliberately the same number as the
// sustained window's own rate-limit ceiling: by definition, the first
// request that gets rejected for exceeding it IS the one that just
// crossed this threshold.
const SUSTAINED_LIMIT = 20;
const SUSTAINED_WINDOW_SECONDS = 900;

// Per-ACCOUNT lockout, independent of IP: the per-IP limits above can't see
// a distributed attack (a botnet trying one password per IP against the
// same username). After this many FAILED attempts on one username within
// the window, further attempts for it are refused before the password is
// even checked — which also spares the PBKDF2 CPU cost. Trade-off: an
// attacker who knows a username can keep it locked for the window; the
// owner can still see it (and the IPs) in the Audit Log.
const ACCOUNT_FAILURE_LIMIT = 10;
const ACCOUNT_WINDOW_SECONDS = 900;

// Failed admin logins are forwarded to Telegram (via logAudit) at most this
// many times per hour store-wide; the rest are still written to the Audit
// Log, just silently. Otherwise an attacker spread over many IPs could
// flood the owner's phone and push Telegram's own per-chat limits, making
// the alerts that matter (new-IP login, auto-block, orders) get dropped.
const FAILED_LOGIN_TELEGRAM_PER_HOUR = 10;

export async function GET(request: Request) {
  const admin = await resolveAdmin(request);
  return Response.json({ authenticated: Boolean(admin), username: admin?.username ?? null, permissions: admin?.permissions ?? [] }, { status: admin ? 200 : 401, headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  if (!adminConfigured()) return Response.json({ error: "admin_environment_not_configured" }, { status: 503 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const ip = clientIp(request);
  // Identity for limits and automatic blocks: the address itself for IPv4,
  // the whole /64 for IPv6 (see rateLimitKey) — otherwise one IPv6
  // customer could rotate addresses and dodge both.
  const limitKey = rateLimitKey(request);
  const device = describeDevice(request.headers.get("user-agent"));
  const userAgent = request.headers.get("user-agent") || "";

  // Checked before the rate limiter touches anything, so an IP that's
  // already blocked (see below) never consumes another rate_limits write
  // just to get told "no" again.
  if (await isIpBlocked(db, [ip, limitKey])) {
    return Response.json({ error: "ip_blocked" }, { status: 403 });
  }

  // Tight burst limit plus a longer sustained cap — both scoped to the
  // client IP, independent of the username/password guessed. Called
  // directly (not via enforceRateLimits) so `sustained.count` is visible
  // here — that's what decides whether this specific attempt is the one
  // that escalates to a full IP block, not just another rate-limit reply.
  const burst = await consumeRateLimit(db, "admin_login", limitKey, 8, 60);
  const sustained = await consumeRateLimit(db, "admin_login", limitKey, SUSTAINED_LIMIT, SUSTAINED_WINDOW_SECONDS);
  let limit: RateLimitResult = { allowed: true, retryAfterSeconds: 0, count: 0 };
  if (!burst.allowed) limit = burst;
  if (!sustained.allowed && (limit.allowed || sustained.retryAfterSeconds > limit.retryAfterSeconds)) limit = sustained;

  if (!limit.allowed) {
    await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "critical", ip, reason: "admin_login", device });
    // Every blocked attempt gets its own audit row — the Audit Log is the
    // permanent record and deliberately keeps every occurrence, each with
    // its own timestamp/IP/device. `silent: true` because this one action
    // is adversary-paced: an attacker hammering this endpoint controls how
    // many of these get logged, and forwarding each to Telegram would let
    // them flood your phone. maybeAlertAdminLoginRateLimited() right below
    // already sends the one curated, throttled (1/15min) ping this
    // condition actually needs.
    await logAudit(db, { actor: "unknown", action: "ADMIN_LOGIN_RATE_LIMITED", result: "failure", ip, metadata: { device, userAgent }, silent: true });
    await maybeAlertAdminLoginRateLimited(db, ip);
    if (!sustained.allowed) {
      // Sustained cap just got crossed for the first time this window —
      // isIpBlocked() above means we'll never reach this branch again for
      // this IP until the 24h block itself expires.
      await blockIp(db, limitKey, { reason: "sustained_admin_login_abuse", blockedBy: "auto", durationHours: 24 });
      await notifyIpAutoBlocked(db, limitKey, sustained.count);
    }
    return rateLimitResponse(limit);
  }
  const body = await readBody(request, z.object({ user: z.string().trim().max(200), password: z.string().max(1000) }));
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const account = body.user.toLowerCase().slice(0, 80) || "(empty)";
  const accountFailures = await peekRateLimit(db, "admin_login_account", account, ACCOUNT_WINDOW_SECONDS);
  if (accountFailures.count >= ACCOUNT_FAILURE_LIMIT) {
    await logAudit(db, { actor: body.user || "unknown", action: "ADMIN_LOGIN_ACCOUNT_LOCKED", result: "failure", ip, metadata: { device, userAgent, failures: accountFailures.count }, silent: true });
    await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "critical", ip, reason: "admin_login_account", device });
    return rateLimitResponse({ allowed: false, retryAfterSeconds: accountFailures.retryAfterSeconds, count: accountFailures.count });
  }
  const admin = await authenticateAdmin(body.user, body.password);
  if (!admin) {
    await consumeRateLimit(db, "admin_login_account", account, ACCOUNT_FAILURE_LIMIT, ACCOUNT_WINDOW_SECONDS);
    const notify = await consumeRateLimit(db, "telegram_admin_login_failure", "all", FAILED_LOGIN_TELEGRAM_PER_HOUR, 3600);
    await logAudit(db, { actor: body.user || "unknown", action: "ADMIN_LOGIN", result: "failure", ip, metadata: { device, userAgent, reason: "invalid_credentials" }, silent: !notify.allowed });
    await recordLiveEvent(db, { type: "ADMIN_LOGIN", severity: "warning", ip, reason: "invalid_credentials", device });
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  await logAudit(db, { actor: admin.username, action: "ADMIN_LOGIN", result: "success", ip, metadata: { device, userAgent, adminId: admin.id } });
  await recordLiveEvent(db, { type: "ADMIN_LOGIN", severity: "info", actorAdminId: admin.id, ip, device });
  // Both checked BEFORE minting this login's own session row — the "have
  // we seen this IP" query would otherwise always match the row this
  // login is about to insert for itself.
  const { priorSessions } = (await db.prepare("SELECT COUNT(*) AS priorSessions FROM admin_sessions WHERE admin_id=?").bind(admin.id).first<{ priorSessions: number }>()) ?? { priorSessions: 0 };
  await maybeAlertUnrecognizedAdminLogin(db, admin.id, admin.username, ip, device, priorSessions);
  const cookie = await createAdminCookie(admin.id, { ip, device });
  return Response.json({ authenticated: true, username: admin.username, permissions: admin.permissions }, { headers: headersWithCookies(sessionCookies(ADMIN_COOKIE, LEGACY_ADMIN_COOKIE, cookie, ADMIN_SESSION_MAX_AGE_SECONDS), { "cache-control": "no-store" }) });
}
export async function DELETE(request: Request) {
  const admin = await resolveAdmin(request);
  if (admin?.sessionId) {
    const db = (env as unknown as { DB: D1Database }).DB;
    await revokeAdminSession(db, admin.sessionId, { id: admin.id, canManageAll: false });
    await logAudit(db, { actor: admin.username, action: "ADMIN_LOGOUT", result: "success", ip: clientIp(request) });
  }
  return Response.json({ authenticated: false }, { headers: headersWithCookies(clearedSessionCookies(ADMIN_COOKIE, LEGACY_ADMIN_COOKIE), { "cache-control": "no-store" }) });
}
