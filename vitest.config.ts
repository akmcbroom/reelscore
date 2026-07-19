import { defineConfig } from "vitest/config";

/**
 * Standalone vitest config — deliberately does NOT reuse vite.config.ts.
 * The Cloudflare + React Router plugins try to boot a workerd runner, which
 * these pure-function unit tests (scoring math, parsers, TTL policy) don't
 * need. Tests exercising bindings should mock them.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
