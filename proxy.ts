import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isTrustedProxyRequest } from "./lib/proxy-trust";

/**
 * The real app runs on Cloudflare Workers with a D1 binding that only
 * exists in that runtime — it can't run on Vercel. Rather than duplicate
 * the backend behind a second, slower, credential-holding code path, a
 * Vercel deployment of this same repo transparently proxies every request
 * to the real production site instead — fetching it server-side and
 * streaming the response back, so the browser's address bar never leaves
 * the Vercel domain (unlike a `NextResponse.redirect`, which would send
 * the visitor straight to the Cloudflare Workers hostname). Set
 * `PRODUCTION_URL` in the Vercel project's environment variables to the
 * real Cloudflare domain to enable this. Cloudflare deployments never set
 * `VERCEL`, so this is a no-op there.
 */
async function vercelProxy(request: NextRequest): Promise<Response | null> {
  if (process.env.VERCEL !== "1") return null;
  const target = process.env.PRODUCTION_URL;
  if (!target) return null;
  const destination = new URL(request.nextUrl.pathname + request.nextUrl.search, target);
  const targetOrigin = new URL(target).origin;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");

  // Stamp the real visitor's IP/location/host so the Worker can tell this
  // request apart from one hitting its public workers.dev URL directly —
  // and so it can log/rate-limit by the actual visitor instead of
  // Vercel's own egress IP. `x-forwarded-for`/`x-vercel-ip-*` are set by
  // Vercel's own edge (the first hop for this domain, backed by their own
  // GeoIP data — not fabricated, not browser-precise geolocation, same
  // "approximate" spirit as the country-only signal this replaces), not by
  // the client, so they're trustworthy here; `PROXY_TRUST_SECRET` is what
  // makes them trustworthy again once they reach the Worker (see
  // lib/proxy-trust.ts).
  const proxySecret = process.env.PROXY_TRUST_SECRET;
  if (proxySecret) {
    headers.set("x-vf-proxy-secret", proxySecret);
    headers.set("x-vf-forwarded-host", request.nextUrl.host);
    const realIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (realIp) headers.set("x-vf-real-ip", realIp);
    const country = request.headers.get("x-vercel-ip-country");
    if (country) headers.set("x-vf-real-country", country);
    const region = request.headers.get("x-vercel-ip-country-region");
    if (region) headers.set("x-vf-real-region", region);
    const city = request.headers.get("x-vercel-ip-city");
    if (city) headers.set("x-vf-real-city", city);
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const upstream = await fetch(destination, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("connection");
  responseHeaders.delete("transfer-encoding");

  // The Worker only knows its own workers.dev hostname (that's the URL we
  // fetched), so any redirect it issues — even a "relative" one resolved
  // against that URL — comes back pointing there. Rewrite it back onto the
  // original Vercel host so a 3xx never sends the browser off-domain.
  const location = upstream.headers.get("location");
  if (location) {
    try {
      const resolved = new URL(location, destination);
      if (resolved.origin === targetOrigin) {
        resolved.protocol = request.nextUrl.protocol;
        resolved.host = request.nextUrl.host;
        responseHeaders.set("location", resolved.toString());
      }
    } catch {
      // Not a parseable URL — leave it as-is.
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// Base64 of 16 random bytes — a fresh value per request, never reused.
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Per-request CSP with a nonce, replacing the old static header from
 * next.config.ts's headers() (removed — a static config file can't mint a
 * fresh nonce per request, and having BOTH a nonced middleware policy and
 * a nonce-less static one active at once would have the browser enforce
 * their INTERSECTION, silently dropping the nonce's effect anyway).
 * 'strict-dynamic' lets Next's own nonce'd bootstrap script load the
 * chunk/hydration scripts it needs without listing every hash — those
 * child scripts are trusted because the script that loaded them was
 * already trusted by the nonce, not because of their own origin/hash.
 * Without this, React's client bundle never executes: the page still
 * server-renders correctly (looks right), but every click/link handler is
 * dead because no JS ever attached to the DOM.
 */
function cspHeaderValue(nonce: string): string {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`;
}

export async function proxy(request: NextRequest) {
  const proxied = await vercelProxy(request);
  if (proxied) return proxied;
  const nonce = generateNonce();
  const csp = cspHeaderValue(nonce);
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    // Forward the nonce as a REQUEST header so Server Components can read
    // it via next/headers, and Next auto-applies it to its own generated
    // scripts when it sees this response header format.
    const forwarded = new Headers(request.headers);
    forwarded.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: forwarded } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": csp,
  };
  const reject = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    // Next's internal URL may use localhost while the browser uses 127.0.0.1.
    // Host is the actual request destination; only Vercel's proxy controls forwarded protocol.
    const protocol = process.env.VERCEL === '1' ? 'https:' : request.nextUrl.protocol;
    // A request forwarded by our own Vercel proxy has Origin set to the
    // PUBLIC host (e.g. www.saveconcept.online) but Host set to this
    // Worker's own workers.dev hostname — compare against the forwarded
    // host instead, but only when it's provably from that trusted proxy.
    const host = (isTrustedProxyRequest(request) && request.headers.get('x-vf-forwarded-host')) || request.headers.get('host') || request.nextUrl.host;
    const expectedOrigin = `${protocol}//${host}`;
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

// Broadened from "/api/:path*" so the Vercel redirect above catches every
// path, not just API calls. Non-API requests skip straight past the
// origin/CSRF/body checks below, which only run for methods other than
// GET/HEAD/OPTIONS under /api/ — unchanged from before.
export const config = { matcher: ["/:path*"] };
