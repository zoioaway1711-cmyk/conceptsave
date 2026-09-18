export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

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
    return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) };
  } catch (error) {
    // Fail OPEN, not closed: a missing/broken rate_limits table (e.g. the
    // 0002 migration hasn't been applied yet) must never turn into a hard
    // outage for admin/customer login. This trades away rate limiting
    // during that specific failure, not general security.
    console.error("rate limit check failed, allowing request", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Applies several windows (burst + sustained) and fails closed on the tightest one. */
export async function enforceRateLimits(db: D1Database, scope: string, identifier: string, windows: Array<{ limit: number; windowSeconds: number }>): Promise<RateLimitResult> {
  let worst: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };
  for (const { limit, windowSeconds } of windows) {
    const result = await consumeRateLimit(db, scope, identifier, limit, windowSeconds);
    if (!result.allowed && (worst.allowed || result.retryAfterSeconds > worst.retryAfterSeconds)) worst = result;
  }
  return worst;
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "cache-control": "no-store" } });
}
