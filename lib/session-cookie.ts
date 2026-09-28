/**
 * Session cookies use the `__Host-` prefix: the browser only accepts such a
 * cookie when it is Secure, has Path=/ and NO Domain attribute — so a
 * sibling subdomain (or an HTTP man-in-the-middle) can never plant or
 * overwrite it ("cookie tossing" → session fixation / login CSRF).
 *
 * The un-prefixed legacy names are still READ as a fallback so nobody is
 * logged out by the rename (admin cookies expire within 8h, customer
 * cookies within 180 days — after that the fallback can be removed). When
 * both are present the prefixed one always wins, so a planted legacy
 * cookie can't override a real session.
 */
export const ADMIN_COOKIE = "__Host-vf_admin";
export const LEGACY_ADMIN_COOKIE = "vf_admin";
export const CUSTOMER_COOKIE = "__Host-vf_customer";
export const LEGACY_CUSTOMER_COOKIE = "vf_customer";

const ATTRIBUTES = "HttpOnly; Secure; SameSite=Strict; Path=/";

function escapeName(name: string) {
  return name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** First value found for the first name in `names` that is present (order = priority). */
export function readCookie(cookieHeader: string | null | undefined, names: string[]): string | undefined {
  if (!cookieHeader) return undefined;
  for (const name of names) {
    const value = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapeName(name)}=([^;]+)`))?.[1];
    if (value) return value;
  }
  return undefined;
}

/** Set-Cookie values for a fresh session: the prefixed cookie, plus clearing the legacy one. */
export function sessionCookies(name: string, legacyName: string, value: string, maxAgeSeconds: number): string[] {
  return [`${name}=${value}; ${ATTRIBUTES}; Max-Age=${maxAgeSeconds}`, `${legacyName}=; ${ATTRIBUTES}; Max-Age=0`];
}

/** Set-Cookie values that log out under both the new and the legacy name. */
export function clearedSessionCookies(name: string, legacyName: string): string[] {
  return [`${name}=; ${ATTRIBUTES}; Max-Age=0`, `${legacyName}=; ${ATTRIBUTES}; Max-Age=0`];
}

/** Response headers with several Set-Cookie lines (a plain object can only hold one). */
export function headersWithCookies(cookies: string[], extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}
