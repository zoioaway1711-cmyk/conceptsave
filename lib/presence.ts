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

/**
 * Short "Xm ago" / "Xh ago" relative label for a timestamp — used
 * wherever the admin UI shows when a customer was last seen, so admins
 * get "left 10m ago" instead of having to mentally diff two full dates.
 * Never the only signal shown: callers keep the exact date available too
 * (e.g. via a `title` attribute), since a relative label goes stale the
 * moment the clock ticks and isn't reliable for precise auditing.
 */
export function formatRelativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "Never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Never";
  const deltaMs = now - then;
  if (deltaMs < 0) return "Just now";
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
