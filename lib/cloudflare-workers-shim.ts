/**
 * Build-time stand-in for the `cloudflare:workers` module, which only
 * exists inside the actual Cloudflare Workers runtime. The real production
 * app (built via `npm run build`, vinext's Cloudflare pipeline) never sees
 * this file — vinext resolves the real module natively.
 *
 * This shim exists so `next build`/`next dev` (used only for the Vercel
 * deployment, see proxy.ts) can statically load route modules that import
 * `cloudflare:workers` without crashing. Those routes are never actually
 * reached on Vercel — proxy.ts redirects every request to the real
 * Cloudflare-hosted site before any handler runs — so `env` here is
 * intentionally empty rather than a fake D1 implementation.
 */
export const env: Record<string, unknown> = {};
