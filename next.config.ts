import type { NextConfig } from "next";

// Kept in sync with public/_headers, which covers the statically-served
// customer-facing UI (index.html, app.js) that bypasses this Next.js
// runtime entirely. The admin app itself lives under app/admin/* and is
// already covered by this config's headers() — EXCEPT Content-Security-
// Policy, which proxy.ts sets per-request instead (it needs a fresh nonce
// every time so Next's own inline bootstrap scripts are allowed to run;
// a static header here can't mint one). Do not add a CSP line back here —
// a second, nonce-less CSP header would intersect with proxy.ts's and
// silently block every script again.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  // Scoped to the Vercel build (package.json's build:vercel sets this env
  // var) — vinext's own Cloudflare pipeline also reads this config file and
  // needs `cloudflare:workers` to resolve to the REAL module, not this
  // build-only shim, so the alias must not apply there.
  ...(process.env.NEXT_BUILD_TARGET === "vercel"
    ? { turbopack: { resolveAlias: { "cloudflare:workers": "./lib/cloudflare-workers-shim.ts" } } }
    : {}),
};

export default nextConfig;
