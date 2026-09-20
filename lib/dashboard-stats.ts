export type DailyCount = { date: string; count: number };
export type CountryCount = { country: string; count: number };

/**
 * Daily activation counts for the last `days` days, zero-filled — a day
 * with no activations is a real 0 on the chart, not a gap that makes the
 * line look shorter than the requested range. Reads `licenses.activated_at`
 * directly (the authoritative claim timestamp) rather than the live_events
 * feed, which is a security/activity log that can in principle be pruned
 * independently of license state.
 */
export async function countActivationsByDay(db: D1Database, days = 30): Promise<DailyCount[]> {
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  const sinceDay = since.toISOString().slice(0, 10);
  const { results } = await db.prepare(
    `SELECT substr(activated_at, 1, 10) AS day, COUNT(*) AS count
     FROM licenses
     WHERE activated_at IS NOT NULL AND substr(activated_at, 1, 10) >= ?
     GROUP BY day`,
  ).bind(sinceDay).all<{ day: string; count: number }>();
  const byDay = new Map(results.map((row) => [row.day, row.count]));

  const series: DailyCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date, count: byDay.get(date) ?? 0 });
  }
  return series;
}

/**
 * Top countries by customer-side activity (verifications/activations/
 * rejections — anything a real visitor triggered) over the last `days`
 * days. Deliberately excludes admin-originated events (actor_admin_id IS
 * NOT NULL) — this answers "where are our customers", not "where does our
 * team work from". Empty country (no geo signal available for that
 * request) is excluded rather than shown as an "Unknown" bucket, since it's
 * usually just a handful of localhost/dev-tool requests, not a real place.
 */
export async function listTopCountries(db: D1Database, days = 30, limit = 8): Promise<CountryCount[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await db.prepare(
    `SELECT country, COUNT(*) AS count
     FROM live_events
     WHERE actor_admin_id IS NULL AND country != '' AND created_at >= ?
     GROUP BY country
     ORDER BY count DESC
     LIMIT ?`,
  ).bind(since, limit).all<{ country: string; count: number }>();
  return results;
}
