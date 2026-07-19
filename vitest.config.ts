import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Standalone vitest config — deliberately does NOT reuse vite.config.ts.
 * The SvelteKit + Cloudflare plugins aren't needed for these pure-function
 * unit tests (scoring math, parsers, TTL policy). Tests exercising bindings
 * should mock them. The $lib alias mirrors SvelteKit's.
 */
export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
