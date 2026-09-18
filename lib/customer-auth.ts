import { env } from "cloudflare:workers";

async function key() {
  const secret = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * The session identity is an opaque internal profile id (`cus_<uuid>`), not
 * a license serial — unlike the old digit-serial system, the plaintext
 * secret a customer types is never itself the session subject, so it never
 * ends up embedded in a cookie, this module has no DB dependency at all
 * (pure signature/expiry check), and a customer can own many licenses
 * without any of them individually acting as "the" credential.
 */
export async function customerCookie(profileId: string) {
  const payload = `customer.${profileId}.${Date.now() + 8 * 60 * 60 * 1000}`;
  const signature = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload));
  return `${payload}.${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function customerId(request: Request): Promise<string | null> {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)vf_customer=([^;]+)/)?.[1];
  const match = token?.match(/^customer\.([A-Za-z0-9_-]{1,80})\.(\d+)\.([a-f0-9]{64})$/);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= Date.now()) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await key(), Uint8Array.from(match[3].match(/../g)!, (byte) => parseInt(byte, 16)), new TextEncoder().encode(`customer.${match[1]}.${match[2]}`));
    return valid ? match[1] : null;
  } catch { return null; }
}
