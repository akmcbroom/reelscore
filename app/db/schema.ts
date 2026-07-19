/**
 * Drizzle schema — single source of DB truth.
 * All tables (score cache now; auth/watchlist/ratings in later phases) live
 * here. Migrations via `npm run db:generate` → `npm run db:migrate`.
 */

import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * Score cache — one row per title (movie or TV share the TMDB id space per
 * media type, but in practice ids don't collide across types for our usage;
 * tmdb_id is the primary key and media_type is informational).
 *
 * Scores live in D1 (not KV) for queryability and strong consistency — see
 * docs/ARCHITECTURE.md "Caching architecture". TTL is enforced in code by
 * comparing fetched_at against the release-recency tiers (getCacheTtl); a
 * stale row is a refetch trigger and gets upserted in place.
 */
export const scores = sqliteTable("scores", {
  tmdbId: integer("tmdb_id").primaryKey(),
  mediaType: text("media_type").notNull(), // "movie" | "tv"
  imdbId: text("imdb_id"),
  /** Base ReelScore 0–100; null = insufficient sources (< 2) */
  baseReelscore: integer("base_reelscore"),
  sourceCount: integer("source_count").notNull().default(0),
  /** JSON NormalizedScore[] — the per-source inputs */
  scoresJson: text("scores_json").notNull(),
  /** JSON ScoreBreakdown — full math for the dev tooltip; null when no score */
  breakdown: text("breakdown"),
  releaseDate: text("release_date"),
  /** ISO timestamp of the MDbList fetch — D1 has no date type */
  fetchedAt: text("fetched_at").notNull(),
});
