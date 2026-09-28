import { isTrustedProxyRequest } from "./proxy-trust";

/**
 * `cf-connecting-ip` is only the real visitor when Cloudflare terminates
 * their connection directly. Requests that arrive via the Vercel reverse
 * proxy (see proxy.ts) have that header pointing at Vercel's own egress IP
 * instead — the visitor's real IP travels in `x-vf-real-ip`, trusted only
 * when it's provably from our own proxy (see isTrustedProxyRequest).
 */
export function clientIp(request: Request) {
  if (isTrustedProxyRequest(request)) {
    const forwarded = request.headers.get("x-vf-real-ip");
    if (forwarded) return forwarded;
  }
  return request.headers.get("cf-connecting-ip") || "unknown";
}

/**
 * Identity for rate limiting (not for logging — keep using clientIp() there).
 * An ordinary IPv6 customer controls a whole /64 (2^64 addresses), so keying
 * limits on the full address lets anyone rotate addresses and bypass every
 * per-IP limit. IPv6 is collapsed to its /64; IPv4 is used as-is.
 */
export function rateLimitKey(request: Request) {
  const ip = clientIp(request);
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Store-wide ceiling for a public endpoint, on top of the per-visitor
 * limits: even an attacker spread over many networks can't flood the table
 * (or the team's Telegram) past this. Tuned far above real traffic.
 */
export function enforceGlobalLimit(db: D1Database, scope: string, perDay: number) {
  return enforceRateLimits(db, `${scope}_global`, "all", [{ limit: perDay, windowSeconds: 86400 }]);
}

export type RateLimitResult ={ allowed: boolean; retryAfterSeconds: number; count: number };

/**
 * Fixed-window counter stored in D1. Each window mints a fresh row (key
 * includes the window bucket), so the check-and-increment is a single
 * atomic `INSERT ... ON CONFLICT` — safe even if two requests race, because
 * D1 serializes writes to a database.
 */
export async function consumeRateLimit(db: D1Database, scope: string, identifier: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `${scope}:${identifier}:${bucket}`;
  const expiresAt = (bucket + 1) * windowMs;
  try {
    const row = await db.prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`
    ).bind(key, expiresAt).first<{ count: number }>();
    if (Math.random() < 0.02) {
      await db.prepare(`DELETE FROM rate_limits WHERE expires_at < ?`).bind(Date.now()).run().catch(() => {});
    }
    const count = row?.count ?? 1;
    return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)), count };
  } catch (error) {
    // Fail OPEN, not closed: a missing/broken rate_limits table (e.g. the
    // 0002 migration hasn't been applied yet) must never turn into a hard
    // outage for admin/customer login. This trades away rate limiting
    // during that specific failure, not general security.
    console.error("rate limit check failed, allowing request", error);
    return { allowed: true, retryAfterSeconds: 0, count: 0 };
  }
}

/**
 * Reads the current window's count WITHOUT incrementing it — for counters
 * that only grow on a specific outcome (e.g. failed logins per account),
 * where the check has to happen before the attempt and the increment only
 * after it failed. Fails open (0) like consumeRateLimit.
 */
export async function peekRateLimit(db: D1Database, scope: string, identifier: string, windowSeconds: number): Promise<{ count: number; retryAfterSeconds: number }> {
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const expiresAt = (bucket + 1) * windowMs;
  try {
    const row = await db.prepare("SELECT count FROM rate_limits WHERE key = ?").bind(`${scope}:${identifier}:${bucket}`).first<{ count: number }>();
    return { count: row?.count ?? 0, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) };
  } catch (error) {
    console.error("rate limit peek failed, allowing request", error);
    return { count: 0, retryAfterSeconds: 0 };
  }
}

/** Applies several windows (burst + sustained) and fails closed on the tightest one. */
export async function enforceRateLimits(db: D1Database, scope: string, identifier: string, windows: Array<{ limit: number; windowSeconds: number }>): Promise<RateLimitResult> {
  let worst: RateLimitResult = { allowed: true, retryAfterSeconds: 0, count: 0 };
  for (const { limit, windowSeconds } of windows) {
    const result = await consumeRateLimit(db, scope, identifier, limit, windowSeconds);
    if (!result.allowed && (worst.allowed || result.retryAfterSeconds > worst.retryAfterSeconds)) worst = result;
  }
  return worst;
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "cache-control": "no-store" } });
}
