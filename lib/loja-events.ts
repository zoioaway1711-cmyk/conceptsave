import { z } from "zod";

/*
 * First-party storefront analytics (loja_events). The browser only sends
 * after the visitor opts in (see app/loja/_lib/analytics.ts); this module
 * then re-applies the privacy rules server-side: event names and param
 * keys are allowlisted, values are truncated, and nothing identifying
 * (IP, cookies, profile) is stored — only a random per-tab session id.
 */

export const EVENT_NAMES = [
  "view_item_list",
  "select_item",
  "view_item",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "purchase",
  "add_to_wishlist",
  "search",
  "filter_used",
  "sort_changed",
  "delivery_lookup",
] as const;

const PARAM_KEYS = new Set([
  "currency",
  "value",
  "item_list_name",
  "shipping_tier",
  "payment_type",
  "search_term",
  "results",
  "list",
  "filter",
  "active",
  "sort",
  "result",
  "transaction_id",
]);
const ITEM_KEYS = new Set(["item_id", "item_name", "item_brand", "item_category", "price", "discount", "quantity", "index", "item_list_name"]);

export const eventsBatchSchema = z.object({
  sessionId: z.string().regex(/^[a-z0-9]{8,40}$/),
  events: z
    .array(
      z.object({
        name: z.enum(EVENT_NAMES),
        path: z.string().max(200),
        params: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(25),
});

function clean(value: unknown): string | number | boolean | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 80);
  return null;
}

/**
 * Search terms are free text: a shopper may type an e-mail, CPF or phone
 * into the search box. Those patterns are redacted before storage (a name
 * can't be detected reliably, so terms are also cut to 40 chars).
 */
export function redactTerm(term: string) {
  return term
    .replace(/[^\s@]+@[^\s@]+/g, "[e-mail]")
    .replace(/\(?\d[\d.\-\s/()]{3,}\d/g, "[número]")
    .slice(0, 40);
}

export function sanitizeParams(params: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "items" && Array.isArray(v)) {
      out.items = v.slice(0, 20).map((item) => {
        const o: Record<string, unknown> = {};
        if (item && typeof item === "object") {
          for (const [ik, iv] of Object.entries(item)) if (ITEM_KEYS.has(ik)) o[ik] = clean(iv);
        }
        return o;
      });
    } else if (k === "search_term" && typeof v === "string") {
      out[k] = redactTerm(v);
    } else if (PARAM_KEYS.has(k)) {
      out[k] = clean(v);
    }
  }
  return out;
}

/** Strip query strings (could carry a search term typed with personal data). */
export function cleanPath(path: string) {
  return path.split("?")[0].split("#")[0].slice(0, 120) || "/";
}

export async function insertEvents(db: D1Database, batch: z.infer<typeof eventsBatchSchema>) {
  const at = new Date().toISOString();
  await db.batch(
    batch.events.map((e) =>
      db
        .prepare("INSERT INTO loja_events (name, params_json, path, session_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(e.name, JSON.stringify(sanitizeParams(e.params)), cleanPath(e.path), batch.sessionId, at),
    ),
  );
  // Retention: 90 days, swept opportunistically.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    await db.prepare("DELETE FROM loja_events WHERE created_at < ?").bind(cutoff).run().catch(() => {});
  }
}

export const FUNNEL_STEPS = ["view_item", "add_to_cart", "view_cart", "begin_checkout", "add_shipping_info", "add_payment_info", "purchase"] as const;

export async function eventMetrics(db: D1Database, days: number) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const [counts, sessions, searches, products] = await Promise.all([
    db
    .prepare("SELECT name, COUNT(*) AS total, COUNT(DISTINCT session_id) AS sessions FROM loja_events WHERE created_at >= ? GROUP BY name")
    .bind(since)
    .all<{ name: string; total: number; sessions: number }>(),
    db
    .prepare("SELECT COUNT(DISTINCT session_id) AS n FROM loja_events WHERE created_at >= ?")
    .bind(since)
    .first<{ n: number }>(),
    db
    .prepare(
      "SELECT json_extract(params_json, '$.search_term') AS term, COUNT(*) AS n, SUM(CASE WHEN json_extract(params_json, '$.results') = 0 THEN 1 ELSE 0 END) AS zero FROM loja_events WHERE name = 'search' AND created_at >= ? GROUP BY lower(term) ORDER BY n DESC LIMIT 15",
    )
    .bind(since)
    .all<{ term: string; n: number; zero: number }>(),
    db
    .prepare(
      "SELECT json_extract(params_json, '$.items[0].item_name') AS item, SUM(CASE WHEN name = 'view_item' THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN name = 'add_to_cart' THEN 1 ELSE 0 END) AS adds FROM loja_events WHERE name IN ('view_item', 'add_to_cart') AND created_at >= ? GROUP BY item ORDER BY views DESC LIMIT 20",
    )
    .bind(since)
    .all<{ item: string; views: number; adds: number }>(),
  ]);
  const byName = Object.fromEntries(counts.results.map((r) => [r.name, r]));
  return {
    days,
    sessions: sessions?.n ?? 0,
    funnel: FUNNEL_STEPS.map((step) => ({ step, sessions: byName[step]?.sessions ?? 0, total: byName[step]?.total ?? 0 })),
    events: counts.results,
    searches: searches.results,
    products: products.results,
  };
}
