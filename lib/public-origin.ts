import { isTrustedProxyRequest } from "./proxy-trust";

/*
 * A host name as it may appear in an absolute URL we print: DNS labels
 * (letters, digits, inner hyphens) or a bracketed IPv6 literal, optional
 * port. Anything else — spaces, quotes, "<", "/", "@", a second URL — is
 * refused, so a forged Host header can never inject markup into the
 * sitemap XML or smuggle another origin into robots.txt.
 */
const HOST_PATTERN = /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?|\[[0-9a-f:.]{2,45}\])(?::\d{1,5})?$/i;

export function isSafeHost(host: string | null | undefined): host is string {
  return typeof host === "string" && host.length <= 253 && HOST_PATTERN.test(host);
}

/**
 * Public origin for absolute URLs in responses (sitemap, robots). The
 * forwarded host is honored only from our own verified proxy — anyone can
 * send `x-vf-forwarded-host`, and these responses are cacheable, so an
 * unverified value could poison them. Every candidate must also be a
 * syntactically valid host; otherwise the request URL's own host is used.
 */
export function publicOrigin(request: Request) {
  const forwarded = isTrustedProxyRequest(request) ? request.headers.get("x-vf-forwarded-host") : null;
  const header = request.headers.get("host");
  const host = (isSafeHost(forwarded) && forwarded) || (isSafeHost(header) && header) || new URL(request.url).host;
  const proto = /^(localhost|127\.)/.test(host) ? "http" : "https";
  return `${proto}://${host.toLowerCase()}`;
}
