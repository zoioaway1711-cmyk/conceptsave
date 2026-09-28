import { env } from "cloudflare:workers";
import { CUSTOMER_COOKIE, LEGACY_CUSTOMER_COOKIE, readCookie } from "./session-cookie";

async function key() {
  const secret = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * A license serial is single-use (see app/api/profiles/session/route.ts) —
 * it logs a customer in exactly once, to claim the license, and never
 * works again afterwards, even for its own owner. That makes this cookie
 * the ONLY way back into an account post-activation, so it's deliberately
 * long-lived rather than the short admin-session-style expiry this used to
 * share: a customer who verified a product three months ago shouldn't be
 * locked out just because a short cookie lapsed, with no serial left to
 * re-enter. Exported so the route that issues the cookie can set a
 * matching `Max-Age` instead of the two durations silently drifting apart.
 */
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days

/**
 * The session identity is an opaque internal profile id (`cus_<uuid>`), not
 * a license serial — unlike the old digit-serial system, the plaintext
 * secret a customer types is never itself the session subject, so it never
 * ends up embedded in a cookie, this module has no DB dependency at all
 * (pure signature/expiry check), and a customer can own many licenses
 * without any of them individually acting as "the" credential.
 */
export async function customerCookie(profileId: string) {
  const payload = `customer.${profileId}.${Date.now() + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000}`;
  const signature = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload));
  return `${payload}.${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function customerId(request: Request): Promise<string | null> {
  const token = readCookie(request.headers.get("cookie"), [CUSTOMER_COOKIE, LEGACY_CUSTOMER_COOKIE]);
  const match = token?.match(/^customer\.([A-Za-z0-9_-]{1,80})\.(\d+)\.([a-f0-9]{64})$/);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= Date.now()) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await key(), Uint8Array.from(match[3].match(/../g)!, (byte) => parseInt(byte, 16)), new TextEncoder().encode(`customer.${match[1]}.${match[2]}`));
    return valid ? match[1] : null;
  } catch { return null; }
}
