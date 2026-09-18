import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately standalone (does not extend vite.config.ts): that config
// wires up the Cloudflare Workers plugin for the app build, which is
// incompatible with Vitest's default Node test environment. Unit tests
// here mock the "cloudflare:workers" module instead of running inside a
// real Workers runtime.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
