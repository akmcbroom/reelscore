/// <reference path="../.astro/types.d.ts" />

/**
 * Cloudflare Workers environment bindings.
 * In Astro v6, access via: import { env } from "cloudflare:workers"
 * NOT via Astro.locals.runtime.env (removed in v6).
 */
interface Env {
  DB: D1Database;
  SCORE_CACHE: KVNamespace;
  TMDB_API_KEY: string;
  MDBLIST_API_KEY: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APPLE_CLIENT_ID: string;
  APPLE_CLIENT_SECRET: string;
}

declare module "cloudflare:workers" {
  const env: Env;
  export { env };
}
