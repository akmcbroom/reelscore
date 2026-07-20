/**
 * Zod contracts shared by the Hono API and the Svelte client.
 * Every /api/* route validates its inputs with these schemas; response types
 * are inferred so the client and server can never drift.
 */

import { z } from "zod";

import { FEED_SORTS } from "./tmdb/discover";
import { MAX_FEED_PAGES } from "./feed.constants";

// --- Feed ---

/** Query params for GET /api/feed (and the home loader). */
export const feedQuerySchema = z.object({
  type: z.enum(["all", "movie", "tv"]).default("all"),
  sort: z.enum(FEED_SORTS).default("popular"),
  /** Feed batch number (1-based). Capped — see docs/PRD.md §2. */
  page: z.coerce.number().int().min(1).max(MAX_FEED_PAGES).default(1),
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

// --- Title detail (modal) ---

const personSchema = z.object({
  id: z.number(),
  name: z.string(),
  profilePath: z.string().nullable(),
});

/** Response shape of GET /api/title/:id — everything the modal renders. */
export const titleDetailSchema = z.object({
  tmdbId: z.number(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  overview: z.string(),
  releaseDate: z.string().nullable(),
  /** Minutes — movie total or TV per-episode */
  runtime: z.number().nullable(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  /** Best English logo path, or null to fall back to text title */
  logoPath: z.string().nullable(),
  contentRating: z.string().nullable(),
  /** YouTube video id of the best trailer */
  trailerKey: z.string().nullable(),
  score: z.number().nullable(),
  sourceCount: z.number(),
  breakdown: z.unknown().optional(),
  directors: z.array(personSchema),
  cast: z.array(personSchema.extend({ character: z.string() })),
  /** Streaming providers — deduped by base service name, max 6 */
  providers: z.array(
    z.object({ id: z.number(), name: z.string(), logoPath: z.string() })
  ),
  /** TV only — Specials (season 0) filtered out */
  seasons: z.array(
    z.object({
      seasonNumber: z.number(),
      name: z.string(),
      episodeCount: z.number(),
    })
  ),
});

export type TitleDetail = z.infer<typeof titleDetailSchema>;

/** One episode in the season carousel (GET /api/season/:id). */
export const episodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string(),
  episodeNumber: z.number(),
  seasonNumber: z.number(),
  stillPath: z.string().nullable(),
  airDate: z.string().nullable(),
  runtime: z.number().nullable(),
});

export type Episode = z.infer<typeof episodeSchema>;

export const seasonResponseSchema = z.object({
  episodes: z.array(episodeSchema),
});

export type SeasonResponse = z.infer<typeof seasonResponseSchema>;
