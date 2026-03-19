import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Score cache metadata — supplements KV cache with queryable score data.
 * Enables queries like "titles with score > X" without reading KV.
 * Full score breakdown lives in KV (keyed by `scores:{tmdb_id}`).
 */
export const scoreCacheMetadata = sqliteTable("score_cache_metadata", {
  tmdbId: integer("tmdb_id").primaryKey(),
  mediaType: text("media_type").notNull(),
  baseReelscore: integer("base_reelscore"),
  sourceCount: integer("source_count"),
  lastFetchedAt: text("last_fetched_at"),
  releaseDate: text("release_date"),
});
