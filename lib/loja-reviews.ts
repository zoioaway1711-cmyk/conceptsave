import { z } from "zod";
import type { PublicReview, ReviewsSummary } from "@/app/loja/_lib/catalog";
import { getOrder } from "./loja-orders";
import { cleanLine, cleanMultiline } from "./text-sanitize";

/*
 * Real customer reviews (loja_reviews, drizzle/0026).
 *
 * - Only the page of a DELIVERED order can write one (the order's access
 *   token proves who is writing), one per product of that order.
 * - Nothing is published until an admin approves it; the product's
 *   rating/review_count columns are then recomputed from the approved rows,
 *   so every number the store shows comes from real, moderated reviews.
 */

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const reviewInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
    rating: z.number().int().min(1).max(5),
    text: z.string().max(800).transform(cleanMultiline).pipe(z.string().min(10, "Escreva pelo menos 10 caracteres").max(600)),
    author: z.string().max(60).transform(cleanLine).pipe(z.string().min(2, "Informe como quer aparecer").max(40)),
  })
  .strict();
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** "Maria Teste Silva" → "Maria S." — the default public name, never the full name. */
export function defaultAuthor(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cliente";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : "";
  return `${parts[0]}${last}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function monthLabel(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

export type SubmitReviewResult =
  | { ok: true; id: string }
  | { ok: false; error: "not_found" | "not_delivered" | "not_in_order" | "already_reviewed" };

export async function submitReview(db: D1Database, orderId: string, input: ReviewInput): Promise<SubmitReviewResult> {
  const order = await getOrder(db, orderId);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "delivered") return { ok: false, error: "not_delivered" };
  if (!order.items.some((i) => i.slug === input.slug)) return { ok: false, error: "not_in_order" };
  const id = `rev_${crypto.randomUUID()}`;
  const city = `${order.address.city}, ${order.address.uf.toUpperCase()}`.slice(0, 80);
  const res = await db
    .prepare(
      "INSERT INTO loja_reviews (id, order_id, product_slug, rating, text, author, city, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(order_id, product_slug) DO NOTHING",
    )
    .bind(id, orderId, input.slug, input.rating, input.text, input.author, city, new Date().toISOString())
    .run();
  if (!res.meta.changes) return { ok: false, error: "already_reviewed" };
  return { ok: true, id };
}

/** What the order page needs: whether it can review, and the state of each product already reviewed. */
export async function orderReviewState(db: D1Database, orderId: string) {
  const rows = await db.prepare("SELECT product_slug AS slug, status FROM loja_reviews WHERE order_id = ?").bind(orderId).all<{ slug: string; status: ReviewStatus }>();
  return Object.fromEntries(rows.results.map((r) => [r.slug, r.status])) as Record<string, ReviewStatus>;
}

export type AdminReview = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  productSlug: string;
  rating: number;
  text: string;
  author: string;
  city: string;
  status: ReviewStatus;
  createdAt: string;
  moderatedAt: string | null;
  moderatedBy: string | null;
};

export async function listReviews(db: D1Database, status?: ReviewStatus, limit = 100): Promise<AdminReview[]> {
  const where = status ? "WHERE r.status = ?" : "";
  const stmt = db.prepare(
    `SELECT r.id, r.order_id AS orderId, o.number AS orderNumber, r.product_slug AS productSlug, r.rating, r.text, r.author, r.city, r.status, r.created_at AS createdAt, r.moderated_at AS moderatedAt, r.moderated_by AS moderatedBy
     FROM loja_reviews r LEFT JOIN loja_orders o ON o.id = r.order_id ${where} ORDER BY r.created_at DESC LIMIT ?`,
  );
  const rows = await (status ? stmt.bind(status, limit) : stmt.bind(limit)).all<AdminReview>();
  return rows.results;
}

/** Recomputes a product's public rating from its approved reviews. */
function recomputeStatement(db: D1Database, slug: string, at: string) {
  return db
    .prepare(
      `UPDATE loja_products SET
         rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM loja_reviews WHERE product_slug = ?1 AND status = 'approved'), 0),
         review_count = (SELECT COUNT(*) FROM loja_reviews WHERE product_slug = ?1 AND status = 'approved'),
         updated_at = ?2
       WHERE slug = ?1`,
    )
    .bind(slug, at);
}

export async function moderateReview(db: D1Database, id: string, status: "approved" | "rejected", actor: string) {
  const row = await db.prepare("SELECT product_slug AS slug, status FROM loja_reviews WHERE id = ?").bind(id).first<{ slug: string; status: ReviewStatus }>();
  if (!row) return null;
  const at = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE loja_reviews SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ?").bind(status, at, actor, id),
    recomputeStatement(db, row.slug, at),
  ]);
  return { from: row.status, slug: row.slug };
}

/** Real per-star counts and the latest approved reviews (with text) for the home page. */
export async function readReviewsSummary(db: D1Database, productNames: Map<string, string>, latest = 6): Promise<ReviewsSummary> {
  const [counts, rows] = await Promise.all([
    db.prepare("SELECT rating AS stars, COUNT(*) AS count FROM loja_reviews WHERE status = 'approved' GROUP BY rating").all<{ stars: number; count: number }>(),
    db
      .prepare("SELECT id, product_slug AS productSlug, rating, text, author, city, created_at AS createdAt FROM loja_reviews WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?")
      .bind(latest)
      .all<{ id: string; productSlug: string; rating: number; text: string; author: string; city: string; createdAt: string }>(),
  ]);
  const byStars = new Map(counts.results.map((r) => [r.stars, r.count]));
  return {
    breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: byStars.get(stars) ?? 0 })),
    latest: rows.results
      .filter((r) => productNames.has(r.productSlug))
      .map((r): PublicReview => ({ id: r.id, productSlug: r.productSlug, productName: productNames.get(r.productSlug)!, rating: r.rating, text: r.text, author: r.author, city: r.city, month: monthLabel(r.createdAt) })),
  };
}

/** Approved reviews of one product, newest first (product page). */
export async function productReviews(db: D1Database, slug: string, productName: string, limit = 10): Promise<PublicReview[]> {
  const rows = await db
    .prepare("SELECT id, rating, text, author, city, created_at AS createdAt FROM loja_reviews WHERE product_slug = ? AND status = 'approved' ORDER BY created_at DESC LIMIT ?")
    .bind(slug, limit)
    .all<{ id: string; rating: number; text: string; author: string; city: string; createdAt: string }>();
  return rows.results.map((r) => ({ id: r.id, productSlug: slug, productName, rating: r.rating, text: r.text, author: r.author, city: r.city, month: monthLabel(r.createdAt) }));
}
