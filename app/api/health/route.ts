import { env } from "cloudflare:workers";

export async function GET() {
  try {
    await (env as unknown as { DB: D1Database }).DB.prepare("SELECT 1").first();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
