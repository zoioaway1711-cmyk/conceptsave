import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  const reject = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    // Next's internal URL may use localhost while the browser uses 127.0.0.1.
    // Host is the actual request destination; only Vercel's proxy controls forwarded protocol.
    const protocol = process.env.VERCEL === '1' ? 'https:' : request.nextUrl.protocol;
    const expectedOrigin = `${protocol}//${request.headers.get('host') || request.nextUrl.host}`;
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) return reject("invalid_origin", 403);
    if (request.method !== "DELETE") {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reject("json_required", 415);
      // Count actual bytes: Content-Length alone can be absent or untrusted.
      const reader = request.clone().body?.getReader();
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 256 * 1024) { void reader.cancel(); return reject("payload_too_large", 413); }
          }
        } finally { reader.releaseLock(); }
      }
      try {
        const body = await request.clone().json();
        if (!body || typeof body !== "object" || Array.isArray(body)) return reject("invalid_json_object", 400);
      } catch { return reject("invalid_json", 400); }
    }
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export const config = { matcher: ["/api/:path*"] };
