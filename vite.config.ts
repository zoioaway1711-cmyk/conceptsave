import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

// Real D1 database, created under the project's own Cloudflare account
// (`wrangler d1 create verificafarma-db`) — this repo isn't running through
// a managed "site creator" control plane that would otherwise inject a real
// binding over a build-time placeholder, so it's set directly here.
// `wrangler dev`/local builds still use Miniflare's local simulated D1
// regardless of this id (only `wrangler deploy`/`--remote` actually talk to
// the real database), so local development is unaffected.
const REAL_DATABASE_NAME = "verificafarma-db";
const REAL_DATABASE_ID = "2b6c5d64-f8c2-4fd6-8561-75927749037e";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  // Cloudflare's asset server defaults to redirecting `/index.html` -> `/`
  // (its usual "canonical URL" behavior). That default is wrong here: `/`
  // is the Next.js landing page (app/page.tsx), not the static customer
  // portal in public/index.html — the redirect was silently bouncing
  // visitors straight back to the landing page instead of ever reaching
  // the actual verification/login screen. "none" serves each static file
  // at its literal path, no redirect.
  assets: { html_handling: "none" as const },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: REAL_DATABASE_NAME,
          database_id: REAL_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
