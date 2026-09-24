import { isTrustedProxyRequest } from "./proxy-trust";

/**
 * Public origin for absolute URLs in responses (sitemap, robots). The
 * forwarded host is honored only from our own verified proxy — anyone can
 * send `x-vf-forwarded-host`, and these responses are cacheable, so an
 * unverified value could poison them.
 */
export function publicOrigin(request: Request) {
  const forwarded = isTrustedProxyRequest(request) ? request.headers.get("x-vf-forwarded-host") : null;
  const host = forwarded ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = /^(localhost|127\.)/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}
