/**
 * Drizzle client factory for the D1 binding.
 * Create per-request: `const db = createDb(env.DB)` in loaders/Hono handlers.
 */

import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
