import { z } from "zod";
import { ANY_SERIAL_PATTERN, isValidPrefixCode } from "./serial";

const licenseSerial = z.string().trim().transform((value) => value.toUpperCase()).refine((value) => ANY_SERIAL_PATTERN.test(value), "Formato de serial inválido");
const jsonObject = z.record(z.unknown());
const boundedJson = <T extends z.ZodTypeAny>(schema: T, max: number) => schema.refine((value) => JSON.stringify(value).length <= max, "Dados excedem o limite permitido");

// serials/revokedSerials/verifiedAt are intentionally gone: license
// ownership and activation timestamps live only in the `licenses` table
// (lib/licenses.ts) now, never as a client-editable JSON blob on the
// profile. Revoking a license is its own admin action
// (app/api/admin/licenses/[id]/route.ts PATCH), not a field here.
export const profileSchema = z.object({
  id: z.string().trim().min(1).max(80),
  preferredLanguage: z.enum(["pt", "en", "es"]).default("pt"),
  benefits: boundedJson(z.array(jsonObject), 10000).default([]),
  consent: boundedJson(jsonObject, 2000).default({}),
});
export const adminProfileSchema = z.object({
  id: z.string().trim().min(1).max(80),
  points: z.number().int().min(0).max(10000000).default(0),
  level: z.number().int().min(1).max(5).default(1),
  levelName: z.string().max(40).default("Essencial"),
  rankOverride: z.number().int().min(0).max(5).default(0),
  blocked: z.boolean().default(false),
});

// product/maker/lot/status/credited are intentionally NOT accepted here:
// the route always derives them itself from the licenses/materials tables
// and from changes() on the guarded activation UPDATE — never from the
// client. Only list fields the route actually reads.
export const sessionLoginSchema = z.object({ serial: licenseSerial });

export const licenseCheckSchema = z.object({
  serial: licenseSerial,
  profileId: z.string().trim().min(1).max(80).default("anonymous"),
  action: z.enum(["login", "verification"]).default("verification"),
  source: z.enum(["manual", "qr-camera", "qr-image", "qr-link"]).default("manual"),
  language: z.enum(["pt", "en", "es"]).default("pt"),
  metadata: boundedJson(jsonObject, 6000).default({}),
});

export const materialCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  prefixCode: z.string().trim().toUpperCase().refine(isValidPrefixCode, "Prefixo deve ter 2 a 10 letras/números"),
  maker: z.string().trim().max(160).default(""),
  brand: z.string().trim().max(160).default(""),
});

export const materialUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  maker: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(160).optional(),
  archived: z.boolean().optional(),
});

export const licenseCreateSchema = z.object({
  materialId: z.number().int().positive(),
  lot: z.string().trim().max(80).default(""),
  expiresAt: z.string().datetime().nullable().default(null),
});

export const licenseActionSchema = z.object({
  licenseId: z.number().int().positive(),
  action: z.enum(["revoke", "replace"]),
});

export const licenseUpdateSchema = z.object({
  lot: z.string().trim().max(80).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// One row from the imported serial sheet (SERIAL, LOTE, PRODUTO, VALIDADE
// columns) — `serial` is intentionally NOT run through the `licenseSerial`
// transform/refine used elsewhere: that refine rejects on invalid shape,
// which is fine for a single customer-facing submission but would abort
// the whole batch on one bad row here. The import route validates each
// row's shape itself so it can report a per-row error instead.
export const licenseImportRowSchema = z.object({
  serial: z.string().trim().min(1).max(40),
  product: z.string().trim().min(1).max(160),
  lot: z.string().trim().max(80).default(""),
  expiresAt: z.string().datetime().nullable().default(null),
});

export const licenseImportSchema = z.object({
  rows: z.array(licenseImportRowSchema).min(1).max(1000),
  maker: z.string().trim().max(160).default(""),
  brand: z.string().trim().max(160).default(""),
});

/**
 * Defense-in-depth against CSRF on top of the SameSite=Strict session
 * cookies: rejects cross-site state-changing requests whose Origin (or,
 * lacking that, Referer) header doesn't match the request's own host.
 * Same-origin requests never send a mismatching Origin, so this never
 * blocks legitimate same-site calls; it only rejects forged cross-site ones.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const source = origin || request.headers.get("referer");
  if (!source) return true;
  try {
    return new URL(source).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function readBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const raw = await request.text();
    if (raw.length > 64000) return null;
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}
export function parseStoredJson<T>(raw: unknown, fallback: T): T {
  try {
    const value = JSON.parse(String(raw));
    return value && typeof value === "object" && Array.isArray(value) === Array.isArray(fallback) ? value : fallback;
  } catch { return fallback; }
}
