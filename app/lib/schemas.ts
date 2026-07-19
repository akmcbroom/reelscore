/**
 * Zod contracts shared by the Hono API and the React client.
 * Every /api/* route validates its inputs with these schemas; response types
 * are inferred so the client and server can never drift.
 */

import { z } from "zod";

import { FEED_SORTS } from "./tmdb/discover";

// --- Feed ---

/** Query params for GET /api/feed (and the home loader). */
export const feedQuerySchema = z.object({
  type: z.enum(["all", "movie", "tv"]).default("all"),
  sort: z.enum(FEED_SORTS).default("popular"),
  /** Feed batch number (1-based). Capped at 10 — see docs/PRD.md §2. */
  page: z.coerce.number().int().min(1).max(10).default(1),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

/** One title card's worth of data. */
export const feedItemSchema = z.object({
  tmdbId: z.number(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  releaseDate: z.string().nullable(),
  popularity: z.number(),
  /** Base ReelScore 0–100; null = insufficient sources or unreleased */
  score: z.number().nullable(),
  sourceCount: z.number(),
  /** Full score math for the dev tooltip — only present in dev builds */
  breakdown: z.unknown().optional(),
});

export type FeedItem = z.infer<typeof feedItemSchema>;

/** Response shape of GET /api/feed. */
export const feedPageSchema = z.object({
  items: z.array(feedItemSchema),
  page: z.number(),
  /** False when TMDB is exhausted or the 10-batch cap is reached */
  hasMore: z.boolean(),
});

export type FeedPage = z.infer<typeof feedPageSchema>;
