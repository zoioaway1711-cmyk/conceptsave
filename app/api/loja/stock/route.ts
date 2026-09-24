import { env } from "cloudflare:workers";
import { publicStock } from "@/lib/loja-stock";

/** Public availability for controlled SKUs: { sku: { available, low } }. */
export async function GET() {
  try {
    return Response.json({ stock: await publicStock((env as unknown as { DB: D1Database }).DB) });
  } catch {
    // Fail open to the catalog's own availability; checkout re-checks stock server-side anyway.
    return Response.json({ stock: {} }, { status: 503 });
  }
}
