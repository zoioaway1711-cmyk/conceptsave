export type BlockedIp = { ip: string; reason: string; blockedBy: string; blockedAt: string; expiresAt: string | null };

/** Checked BEFORE the rate limiter on admin login — an already-blocked IP never touches the rate_limits counters again. */
export async function isIpBlocked(db: D1Database, ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  const row = await db.prepare("SELECT 1 FROM blocked_ips WHERE ip=? AND (expires_at IS NULL OR expires_at > ?)").bind(ip, new Date().toISOString()).first();
  return Boolean(row);
}

/** `durationHours` omitted = indefinite (manual blocks only — see db/schema.ts's comment for why an automatic block always sets one). Upsert so re-blocking an already-blocked IP just refreshes reason/expiry instead of erroring. */
export async function blockIp(db: D1Database, ip: string, params: { reason: string; blockedBy: string; durationHours?: number }): Promise<void> {
  const now = new Date();
  const expiresAt = params.durationHours ? new Date(now.getTime() + params.durationHours * 60 * 60 * 1000).toISOString() : null;
  await db.prepare(
    `INSERT INTO blocked_ips (ip, reason, blocked_by, blocked_at, expires_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET reason=excluded.reason, blocked_by=excluded.blocked_by, blocked_at=excluded.blocked_at, expires_at=excluded.expires_at`,
  ).bind(ip, params.reason, params.blockedBy, now.toISOString(), expiresAt).run();
}

/** Returns false (not an error) for an IP that wasn't blocked — idempotent, same contract as revokeAdminSession. */
export async function unblockIp(db: D1Database, ip: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM blocked_ips WHERE ip=?").bind(ip).run();
  return result.meta.changes > 0;
}

/** Currently-active blocks only (expired ones are left in place as a historical record but excluded here — same "not useful to act on" reasoning as listAdminSessions' own expiry filter). */
export async function listBlockedIps(db: D1Database): Promise<BlockedIp[]> {
  const { results } = await db.prepare(
    "SELECT ip, reason, blocked_by AS blockedBy, blocked_at AS blockedAt, expires_at AS expiresAt FROM blocked_ips WHERE expires_at IS NULL OR expires_at > ? ORDER BY blocked_at DESC LIMIT 200",
  ).bind(new Date().toISOString()).all<BlockedIp>();
  return results;
}
