import { env } from "cloudflare:workers";
import { z } from "zod";
import { applyCatalog, type CatalogSnapshot, type Product, type StoreSettings } from "@/app/loja/_lib/catalog";
import { SEED_SETTINGS } from "./loja-catalog-seed";
import { cryptoConfigured } from "./loja-crypto";
import { pixConfigured } from "./loja-pix";
import { cleanLine, cleanMultiline } from "./text-sanitize";

/*
 * Server-side catalog access (loja_products / loja_settings).
 *
 * `loadCatalog()` reads both tables, applies them to the catalog registry
 * (app/loja/_lib/catalog.ts) and returns the snapshot that the layout
 * hands to the browser. Cached per Worker isolate for CACHE_MS; admin
 * writes invalidate the local isolate immediately, other isolates pick the
 * change up within the TTL.
 */

const CACHE_MS = 15_000;
let cached: { at: number; snapshot: CatalogSnapshot } | null = null;
let inflight: Promise<CatalogSnapshot> | null = null;

function db(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}

type ProductRow = {
  slug: string;
  sku: string;
  brand: string;
  name: string;
  presentation: string;
  category: Product["category"];
  summary: string;
  description: string;
  price: number;
  oldPrice: number | null;
  unitsJson: string | null;
  badge: string | null;
  rating: number;
  reviewCount: number;
  specsJson: string;
  freeShipping: number;
  available: number;
  purchasable: number;
  coldChain: number;
  healthNotice: number;
  imageJson: string;
  keywordsJson: string;
  relatedJson: string;
  boughtTogetherJson: string;
  updatedAt: string;
};

const SELECT_PRODUCTS = `SELECT slug, sku, brand, name, presentation, category, summary, description, price, old_price AS oldPrice, units_json AS unitsJson, badge, rating, review_count AS reviewCount, specs_json AS specsJson, free_shipping AS freeShipping, available, purchasable, cold_chain AS coldChain, health_notice AS healthNotice, image_json AS imageJson, keywords_json AS keywordsJson, related_json AS relatedJson, bought_together_json AS boughtTogetherJson, updated_at AS updatedAt FROM loja_products ORDER BY sort_order, slug`;

function toProduct(r: ProductRow): Product {
  return {
    slug: r.slug,
    sku: r.sku,
    brand: r.brand,
    name: r.name,
    presentation: r.presentation,
    category: r.category,
    summary: r.summary,
    description: r.description,
    price: r.price,
    ...(r.oldPrice !== null ? { oldPrice: r.oldPrice } : {}),
    ...(r.unitsJson ? { units: JSON.parse(r.unitsJson) } : {}),
    ...(r.badge ? { badge: r.badge } : {}),
    rating: r.rating,
    reviewCount: r.reviewCount,
    specs: JSON.parse(r.specsJson),
    freeShipping: Boolean(r.freeShipping),
    available: Boolean(r.available),
    purchasable: Boolean(r.purchasable),
    coldChain: Boolean(r.coldChain),
    healthNotice: Boolean(r.healthNotice),
    image: JSON.parse(r.imageJson),
    keywords: JSON.parse(r.keywordsJson),
    related: JSON.parse(r.relatedJson),
    boughtTogether: JSON.parse(r.boughtTogetherJson),
  };
}

/*
 * Admin-edited text is published on every (edge-cached) store page, so it
 * gets the same invisible/bidi/control-character cleanup as customer input
 * (lib/text-sanitize.ts). Length limits run BEFORE the cleanup, so the
 * work per request stays bounded.
 */
const line = (min: number, max: number) => z.string().max(max).transform(cleanLine).pipe(z.string().min(min));
const multiline = (min: number, max: number) => z.string().max(max).transform(cleanMultiline).pipe(z.string().min(min));

export const settingsSchema = z.object({
  supportHours: line(3, 80),
  whatsappUrl: z.union([z.literal(""), z.string().trim().url().regex(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, "use um link wa.me")]),
  instagramUrl: z.union([z.literal(""), z.string().trim().url().regex(/^https:\/\/(www\.)?instagram\.com\//, "use um link instagram.com")]),
  supportEmail: z.union([z.literal(""), z.string().trim().email()]),
  privacyEmail: z.union([z.literal(""), z.string().trim().email()]),
  maxInstallments: z.number().int().min(1).max(12),
  deliveryWindow: line(3, 60),
  deliveryDetail: multiline(3, 300),
  paymentNote: multiline(3, 300),
  returns: multiline(3, 400),
});

/**
 * Categories that may never be sold online (vials and vial kits) — a
 * regulatory decision (docs/loja-revisao-regulatoria.md), not a catalog
 * setting. The admin API refuses to mark them purchasable and
 * createOrder refuses them even if a row says otherwise. Lifting this is
 * a deliberate code change, never a click in the admin.
 */
export const REGULATED_CATEGORIES: ReadonlySet<Product["category"]> = new Set(["frascos", "kits"]);

export async function readCatalog(database: D1Database = db()): Promise<CatalogSnapshot> {
  const [products, settings] = await Promise.all([
    database.prepare(SELECT_PRODUCTS).all<ProductRow>(),
    database.prepare("SELECT key, value_json AS valueJson, updated_at AS updatedAt FROM loja_settings").all<{ key: string; valueJson: string; updatedAt: string }>(),
  ]);
  // A missing or invalid setting must never take the whole store down (or
  // lock the admin out of fixing it): each field falls back to the seed
  // value on its own, and the problem is logged.
  const raw: Record<string, unknown> = {};
  for (const r of settings.results) {
    try {
      raw[r.key] = JSON.parse(r.valueJson);
    } catch {
      // unreadable JSON → falls back below
    }
  }
  const merged: Record<string, unknown> = { ...SEED_SETTINGS };
  for (const key of Object.keys(SEED_SETTINGS) as (keyof StoreSettings)[]) {
    const field = settingsSchema.shape[key].safeParse(raw[key]);
    if (field.success) merged[key] = field.data;
    else console.error(`[loja] loja_settings.${key} ausente ou inválido — usando o valor padrão`);
  }
  const parsed = { data: merged as StoreSettings };
  // Version = latest change across both tables, so clients re-apply only when something changed.
  const version = [...products.results.map((p) => p.updatedAt), ...settings.results.map((s) => s.updatedAt)].sort().at(-1) ?? "empty";
  // Gateways come from Worker secrets, not the DB; part of the version so a
  // browser that saw them off re-applies when they turn on (new deploy).
  const gateways = { pix: pixConfigured(), crypto: cryptoConfigured() };
  return {
    version: `${version}#${products.results.length}#${gateways.pix ? "p" : "-"}${gateways.crypto ? "c" : "-"}`,
    products: products.results.map(toProduct),
    settings: parsed.data,
    gateways,
  };
}

export async function loadCatalog(database?: D1Database): Promise<CatalogSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    applyCatalog(cached.snapshot);
    return cached.snapshot;
  }
  inflight ??= readCatalog(database)
    .then((snapshot) => {
      cached = { at: Date.now(), snapshot };
      return snapshot;
    })
    .finally(() => {
      inflight = null;
    });
  const snapshot = await inflight;
  applyCatalog(snapshot);
  return snapshot;
}

export function invalidateCatalog() {
  cached = null;
}

/* ---------- admin writes ---------- */

export const productUpdateSchema = z
  .object({
    name: line(2, 120),
    presentation: line(2, 120),
    summary: line(3, 300),
    description: multiline(3, 2000),
    price: z.number().positive().finite().max(1_000_000),
    oldPrice: z.number().positive().finite().max(1_000_000).nullable(),
    badge: z.string().max(40).transform(cleanLine).nullable(),
    specs: z.array(line(1, 200)).min(1).max(20),
    freeShipping: z.boolean(),
    available: z.boolean(),
    purchasable: z.boolean(),
    coldChain: z.boolean(),
  })
  .strict()
  .refine((v) => v.oldPrice === null || v.oldPrice > v.price, { message: "O preço anterior precisa ser maior que o atual", path: ["oldPrice"] });

export const REGULATED_PURCHASABLE_MESSAGE = "Frascos e kits com frasco não podem ser vendidos online (restrição regulatória).";

export async function updateProduct(database: D1Database, slug: string, input: z.infer<typeof productUpdateSchema>, actor: string) {
  const before = await database.prepare(`${SELECT_PRODUCTS.replace(" ORDER BY sort_order, slug", "")} WHERE slug = ?`).bind(slug).first<ProductRow>();
  if (!before) return null;
  if (input.purchasable && REGULATED_CATEGORIES.has(before.category)) return { error: "regulated" as const };
  await database
    .prepare(
      `UPDATE loja_products SET name = ?, presentation = ?, summary = ?, description = ?, price = ?, old_price = ?, badge = ?, specs_json = ?, free_shipping = ?, available = ?, purchasable = ?, cold_chain = ?, updated_at = ?, updated_by = ? WHERE slug = ?`,
    )
    .bind(
      input.name,
      input.presentation,
      input.summary,
      input.description,
      input.price,
      input.oldPrice,
      input.badge || null,
      JSON.stringify(input.specs),
      input.freeShipping ? 1 : 0,
      input.available ? 1 : 0,
      input.purchasable ? 1 : 0,
      input.coldChain ? 1 : 0,
      new Date().toISOString(),
      actor,
      slug,
    )
    .run();
  invalidateCatalog();
  const b = toProduct(before);
  const changed = (Object.keys(input) as (keyof typeof input)[]).filter((k) => JSON.stringify(b[k as keyof Product] ?? null) !== JSON.stringify(input[k]));
  return { before: b, changed };
}

export async function updateSettings(database: D1Database, input: StoreSettings, actor: string) {
  const at = new Date().toISOString();
  await database.batch(
    Object.entries(input).map(([k, v]) =>
      database
        .prepare("INSERT INTO loja_settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
        .bind(k, JSON.stringify(v), at, actor),
    ),
  );
  invalidateCatalog();
}
