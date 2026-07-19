import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config — used only for `npm run db:generate` (SQL generation).
 * Migrations are applied with wrangler (`npm run db:migrate[:remote]`), which
 * reads migrations_dir from wrangler.jsonc.
 */
export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/server/db/schema.ts",
  dialect: "sqlite",
});
