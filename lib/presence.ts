/**
 * Presence is derived entirely from `customer_profiles.last_seen_at` — no
 * background job, no realtime push. "Online" is a query result, not an
 * event: a stale row simply stops appearing as online next time anyone
 * asks, it doesn't need an explicit USER_OFFLINE transition to be correct.
 */
export const PRESENCE_ONLINE_WINDOW_MS = 90 * 1000;
export const PRESENCE_IDLE_WINDOW_MS = 5 * 60 * 1000;

export type PresenceState = "online" | "idle" | "offline";

export function presenceOf(lastSeenAt: string | null | undefined, now = Date.now()): PresenceState {
  if (!lastSeenAt) return "offline";
  const delta = now - new Date(lastSeenAt).getTime();
  if (delta < 0) return "offline";
  if (delta <= PRESENCE_ONLINE_WINDOW_MS) return "online";
  if (delta <= PRESENCE_IDLE_WINDOW_MS) return "idle";
  return "offline";
}

export async function touchPresence(db: D1Database, profileId: string, now = new Date().toISOString()) {
  await db.prepare("UPDATE customer_profiles SET last_seen_at=? WHERE id=?").bind(now, profileId).run();
}
