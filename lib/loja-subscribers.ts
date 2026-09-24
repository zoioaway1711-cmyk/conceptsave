import { z } from "zod";
import { PRODUCTS } from "@/app/loja/_lib/catalog";
import { OPT_IN_TEXT } from "@/app/loja/_lib/consent-texts";

/*
 * Storefront e-mail opt-ins (loja_subscribers). The store has no e-mail
 * provider: nothing is sent automatically; the team exports the list from
 * the admin. Duplicate sign-ups are ignored silently (the response never
 * reveals whether an e-mail was already on the list).
 */

const SKUS = PRODUCTS.map((p) => p.sku);

export const subscribeSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(160).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/),
    kind: z.enum(["news", "restock"]),
    sku: z.string().max(80).optional(),
    consent: z.literal(true),
  })
  .refine((v) => (v.kind === "restock" ? Boolean(v.sku && SKUS.includes(v.sku)) : !v.sku), { message: "invalid_sku" });

export async function subscribe(db: D1Database, input: z.infer<typeof subscribeSchema>) {
  await db
    .prepare("INSERT OR IGNORE INTO loja_subscribers (email, kind, sku, consent_text, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(input.email, input.kind, input.kind === "restock" ? input.sku : "", OPT_IN_TEXT[input.kind], new Date().toISOString())
    .run();
}

export type Subscriber = { id: number; email: string; kind: "news" | "restock"; sku: string; consentText: string; createdAt: string };

export async function listSubscribers(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, email, kind, sku, consent_text AS consentText, created_at AS createdAt FROM loja_subscribers ORDER BY created_at DESC LIMIT 5000")
    .all<Subscriber>();
  return results;
}

export async function deleteSubscriber(db: D1Database, id: number) {
  const r = await db.prepare("DELETE FROM loja_subscribers WHERE id = ?").bind(id).run();
  return r.meta.changes > 0;
}
