import { z } from "zod";
import { PRODUCTS } from "@/app/loja/_lib/catalog";
import { OPT_IN_TEXT } from "@/app/loja/_lib/consent-texts";
import { antiBotShape } from "./loja-antibot";
import { loadCatalog } from "./loja-catalog";
import { cleanLine, isStrictEmail } from "./text-sanitize";

/*
 * Storefront e-mail opt-ins (loja_subscribers). The store has no e-mail
 * provider: nothing is sent automatically; the team exports the list from
 * the admin. Duplicate sign-ups are ignored silently (the response never
 * reveals whether an e-mail was already on the list).
 */

export const subscribeSchema = z
  .object({
    // Normalized (invisible characters out, lowercase) BEFORE the unique
    // index sees it, so "ana@x.com" and "ana\u200b@x.com" can't both be stored.
    email: z
      .string()
      .max(160)
      .transform((v) => cleanLine(v).toLowerCase())
      .refine(isStrictEmail),
    kind: z.enum(["news", "restock"]),
    sku: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
    consent: z.literal(true),
    ...antiBotShape,
  })
  .refine((v) => (v.kind === "restock" ? Boolean(v.sku) : !v.sku), { message: "invalid_sku" });

/** Returns false when a restock sign-up names a SKU that isn't in the live catalog. */
export async function subscribe(db: D1Database, input: z.infer<typeof subscribeSchema>) {
  await loadCatalog(db);
  if (input.kind === "restock" && !PRODUCTS.some((p) => p.sku === input.sku)) return false;
  await db
    .prepare("INSERT OR IGNORE INTO loja_subscribers (email, kind, sku, consent_text, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(input.email, input.kind, input.kind === "restock" ? input.sku : "", OPT_IN_TEXT[input.kind], new Date().toISOString())
    .run();
  return true;
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
