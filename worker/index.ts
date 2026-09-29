import { WorkerEntrypoint } from "cloudflare:workers";
import app from "vinext/server/fetch-handler";
import { sendDailyStoreSummary } from "../lib/loja-telegram";

/*
 * Worker entry: a thin gateway in front of the vinext app.
 *
 * Why: the Worker runs on Cloudflare's Free plan (10 ms CPU per request).
 * Server-rendering a /loja page takes ~60 ms of CPU, so most page views were
 * being killed with "Worker exceeded CPU time limit" (503 → the browser's
 * "This page couldn't load"). Every /loja page renders the same output for
 * every visitor (per-visitor data — cart, favorites, orders — is loaded by
 * the browser from /api/loja/*), so the rendered page is served through
 * Workers Caching: on a hit the render never runs and costs no CPU.
 *
 * Shape (Cloudflare's "gateway + cached entrypoint" pattern):
 * - `default` (cache disabled in wrangler config) runs on every request. For
 *   cacheable page requests it forwards to `CachedPages` via ctx.exports,
 *   then swaps the CSP nonce baked into the cached HTML for a fresh one, so
 *   every visitor still gets a unique, unguessable nonce.
 * - `CachedPages` (cache enabled) renders through the app and marks
 *   successful, cookie-free page responses as cacheable at the edge.
 *
 * Anything else (API routes, admin, POSTs, the portal) goes straight to the
 * app, uncached, exactly as before.
 */

type Env = Record<string, unknown>;

// Only store pages. Their server components never read cookies, headers or
// searchParams (checked when this was added) — if one ever starts to, it
// must be removed from here or it would leak one visitor's page to another.
const CACHEABLE_PATH = /^\/loja(?:\/[^?#]*)?$/;
// File-like routes (/loja/sitemap.xml …) are left out: they build absolute
// URLs from the public host, which only the per-visitor x-vf-* proxy
// headers carry, and those are stripped before the cached render.
const FILE_LIKE_PATH = /\/[^/]*\.[a-z0-9]+$/i;
// Query parameters that must never become part of a cache key: the order
// page's access token (?t=) and its one-shot "just ordered" flag. The page
// HTML doesn't depend on them (the browser reads them), so dropping them
// also keeps every order link on one shared cache entry.
const PRIVATE_QUERY_PARAMS = ["t", "novo"];

// Edge freshness: catalog/settings edits in the admin show up within
// FRESH_SECONDS; after that visitors keep getting the previous copy while a
// background render refreshes it (and keep it if that render fails).
const FRESH_SECONDS = 60;
const STALE_SECONDS = 86_400;

// What the browser (and the Vercel proxy in front) sees: never cache.
const CLIENT_CACHE_CONTROL = "no-store, must-revalidate";

const NONCE_HEADER = "x-vf-cache-nonce";

function isCacheablePageRequest(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("upgrade")) return false;
  return CACHEABLE_PATH.test(url.pathname) && !FILE_LIKE_PATH.test(url.pathname);
}

// Router state headers the RSC response varies on (RSC, Next-Router-*,
// Next-Url, X-Vinext-*). They go into the cache key so a client-side
// navigation never gets a payload rendered for a different router state.
function isRouterHeader(name: string): boolean {
  return name === "rsc" || name.startsWith("next-") || name.startsWith("x-vinext-");
}

async function cacheKey(request: Request, url: URL): Promise<string> {
  const parts: string[] = [];
  for (const [name, value] of request.headers) if (isRouterHeader(name)) parts.push(`${name}:${value}`);
  const keyUrl = new URL(url);
  for (const name of PRIVATE_QUERY_PARAMS) keyUrl.searchParams.delete(name);
  const base = keyUrl.pathname + keyUrl.search;
  if (parts.length === 0) return base;
  parts.sort();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}#rsc=${hex}`;
}

// Base64 of 16 random bytes — same format as proxy.ts's generateNonce().
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function nonceFromCsp(csp: string | null): string | null {
  return csp?.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1] ?? null;
}

function isPageContent(contentType: string | null): boolean {
  return !!contentType && /^(text\/html|text\/x-component)\b/i.test(contentType);
}

export class CachedPages extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const response = await app.fetch(request, this.env, this.ctx);
    const cacheable =
      response.status === 200 && !response.headers.has("set-cookie") && isPageContent(response.headers.get("content-type"));
    if (!cacheable) return response;
    const headers = new Headers(response.headers);
    headers.set("cache-control", `public, max-age=0, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}, stale-if-error=${STALE_SECONDS}`);
    // The cache key already covers the router headers; a Vary list here
    // would only split entries further (or block storage altogether).
    headers.delete("vary");
    const nonce = nonceFromCsp(headers.get("content-security-policy"));
    if (nonce) headers.set(NONCE_HEADER, nonce);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

type Exports = { CachedPages?: { fetch(request: Request, init?: RequestInit & { cf?: { cacheKey?: string } }): Promise<Response> } };

async function serveCachedPage(request: Request, url: URL, ctx: ExecutionContext): Promise<Response | null> {
  const cached = (ctx as ExecutionContext & { exports?: Exports }).exports?.CachedPages;
  if (!cached) return null; // local dev / runtimes without ctx.exports: render normally

  // Nothing visitor-specific may reach the cached render: drop cookies,
  // credentials and the Vercel proxy's per-visitor headers.
  const forwarded = new Request(request);
  for (const name of ["cookie", "authorization"]) forwarded.headers.delete(name);
  for (const name of [...forwarded.headers.keys()]) if (name.startsWith("x-vf-")) forwarded.headers.delete(name);

  // A cache miss renders the page in its own CachedPages invocation, which
  // can still be killed by the Free plan's CPU limit. That invocation has
  // its own CPU budget (the gateway's stays tiny), so one retry turns most
  // of those misses into a success that then fills the cache.
  const key = await cacheKey(request, url);
  const attempt = () => cached.fetch(new Request(forwarded), { cf: { cacheKey: key } }).catch(() => null);
  let response = await attempt();
  if (!response || response.status >= 500) {
    await response?.body?.cancel();
    response = await attempt();
  }
  if (!response) return null; // fall back to rendering in the gateway itself
  const oldNonce = response.headers.get(NONCE_HEADER);
  const headers = new Headers(response.headers);
  headers.delete(NONCE_HEADER);
  headers.set("cache-control", CLIENT_CACHE_CONTROL);
  if (!oldNonce) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });

  // Fresh nonce per visitor: rewrite it in the CSP header and in every
  // nonce="" attribute of the cached document.
  const nonce = generateNonce();
  headers.set("content-security-policy", (headers.get("content-security-policy") ?? "").replaceAll(`'nonce-${oldNonce}'`, `'nonce-${nonce}'`));
  const body = (await response.text()).replaceAll(oldNonce, nonce);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  /** Daily store summary to the owner's Telegram (cron in vite.config.ts: 11:00 UTC = 08:00 in São Paulo). */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      sendDailyStoreSummary(env.DB as D1Database).catch((error) => console.error("[loja] resumo diário falhou", error)),
    );
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (isCacheablePageRequest(request, url)) {
      const page = await serveCachedPage(request, url, ctx);
      if (page) return page;
    }
    return neverCacheImplicitly(await app.fetch(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;

/*
 * Wrangler 4.92 ignores the per-entrypoint `exports` block (it warns
 * "Unexpected fields ... exports"), so the top-level `cache.enabled: true`
 * also applies to this gateway. Pages and APIs already send no-store, but a
 * response WITHOUT any Cache-Control could be stored heuristically — and if
 * it depended on the visitor's cookie, served to someone else. Anything
 * that doesn't state its own caching policy is therefore marked private.
 */
function neverCacheImplicitly(response: Response): Response {
  if (response.headers.has("cache-control")) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
