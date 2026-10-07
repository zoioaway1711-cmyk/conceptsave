import { env } from "cloudflare:workers";
import { readImage } from "@/lib/loja-images";

/*
 * Product photos uploaded in the admin (lib/loja-images.ts), at
 * /loja-img/<id>-<480|960>.webp. Outside /api on purpose: API responses are
 * forced to no-store, and these never change (a new upload gets a new id),
 * so they are cached for a year by the browser and the edge.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const match = /^([0-9a-f]{32})-(480|960)\.webp$/.exec(file);
  if (!match) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const image = await readImage((env as unknown as { DB: D1Database }).DB, match[1], Number(match[2]) as 480 | 960);
  if (!image) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(image.bytes, {
    headers: {
      "content-type": image.mime,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
