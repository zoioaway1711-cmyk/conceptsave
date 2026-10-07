import { z } from "zod";

/*
 * Product photos uploaded in the admin (loja_images, drizzle/0026).
 *
 * The browser resizes and compresses each photo to 960px and 480px wide
 * (app/sc-629f1dc76b/loja/image-upload.ts), so the Worker never decodes or
 * resizes an image (10 ms CPU budget). It only checks the bytes really are
 * WebP/JPEG, stores them, and serves them at
 * /loja-img/<id>-<480|960>.webp — the same "-480/-960.webp" naming the
 * catalog uses for the static photos, so ProductImage needs no change.
 * Ids are random and never reused, so responses are cached forever.
 */

export const IMAGE_SIZES = [480, 960] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

/** Per-size decoded limit. Keeps the JSON body under the upload route's cap. */
export const MAX_IMAGE_BYTES = 300 * 1024;

export const UPLOADED_IMAGE_BASE_RE = /^\/loja-img\/[0-9a-f]{32}$/;
/** Static photos shipped in public/loja, or one uploaded here. */
export const IMAGE_BASE_RE = /^(\/loja\/[a-z0-9-]{2,80}|\/loja-img\/[0-9a-f]{32})$/;

const b64 = z.string().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const dim = z.number().int().min(50).max(4000);

export const imageUploadSchema = z
  .object({
    mime: z.enum(["image/webp", "image/jpeg"]),
    large: z.object({ data: b64, width: dim, height: dim }).strict(),
    small: z.object({ data: b64, width: dim, height: dim }).strict(),
  })
  .strict();
export type ImageUpload = z.infer<typeof imageUploadSchema>;

function decode(data: string) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Magic bytes: the declared type must be what the file actually is. */
export function sniffMime(bytes: Uint8Array): "image/webp" | "image/jpeg" | null {
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export type SaveImageResult = { ok: true; base: string; width: number; height: number } | { ok: false; error: "invalid_image" | "too_large" };

export async function saveImage(db: D1Database, input: ImageUpload, actor: string): Promise<SaveImageResult> {
  for (const part of [input.large, input.small]) {
    const bytes = decode(part.data);
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };
    if (sniffMime(bytes) !== input.mime) return { ok: false, error: "invalid_image" };
  }
  // Same proportions in both sizes, and the small one really is smaller.
  if (input.small.width > input.large.width || Math.abs(input.small.height / input.small.width - input.large.height / input.large.width) > 0.02) {
    return { ok: false, error: "invalid_image" };
  }
  const id = crypto.randomUUID().replace(/-/g, "");
  const at = new Date().toISOString();
  const insert = (size: ImageSize, part: ImageUpload["large"]) =>
    db
      .prepare("INSERT INTO loja_images (id, size, mime, data_b64, width, height, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, size, input.mime, part.data, part.width, part.height, at, actor);
  await db.batch([insert(960, input.large), insert(480, input.small)]);
  return { ok: true, base: `/loja-img/${id}`, width: input.large.width, height: input.large.height };
}

export async function readImage(db: D1Database, id: string, size: ImageSize) {
  const row = await db.prepare("SELECT mime, data_b64 AS data FROM loja_images WHERE id = ? AND size = ?").bind(id, size).first<{ mime: string; data: string }>();
  return row ? { mime: row.mime, bytes: decode(row.data) } : null;
}
