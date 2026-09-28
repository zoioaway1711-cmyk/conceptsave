import { env } from "cloudflare:workers";

/**
 * Constant-time-ish compare that never short-circuits on the first
 * mismatched byte (unlike `===`), so a network attacker measuring response
 * latency can't use it to guess the secret one byte at a time. Kept
 * synchronous (unlike lib/admin-auth.ts's digest-based timingSafeEqual, the
 * gold standard) specifically so isTrustedProxyRequest() stays synchronous
 * too — it's called inline from ~15 call sites across the codebase
 * (clientIp, approximateLocation, isSameOrigin), and making all of those
 * async would be a much larger, riskier change for a secret that's already
 * 256 bits of CSPRNG output (brute-forcing it isn't the realistic threat
 * here; a cheap timing leak on top of that would be an unnecessary one).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  const length = Math.max(bytesA.length, bytesB.length, 32);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < length; i++) diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  return diff === 0;
}

/**
 * True only when this request arrived via our own Vercel reverse proxy
 * (proxy.ts's vercelProxy()), which stamps every request it forwards with
 * a shared secret. The Worker's workers.dev subdomain is publicly
 * reachable on its own (see saveconcept.online domain notes), so without
 * this check anyone hitting it directly could forge `x-vf-real-ip`,
 * `x-vf-real-country`, or `x-vf-forwarded-host` to fake a visitor's IP,
 * location, or the Origin/Host CSRF check in proxy.ts.
 */
export function isTrustedProxyRequest(request: Request): boolean {
  const secret = (env as unknown as { PROXY_TRUST_SECRET?: string }).PROXY_TRUST_SECRET;
  const header = request.headers.get("x-vf-proxy-secret");
  if (!secret || !header) return false;
  return constantTimeEqual(header, secret);
}
