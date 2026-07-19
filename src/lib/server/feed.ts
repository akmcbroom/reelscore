/**
 * Feed assembly — shared by the home loader (batch 1, SSR) and the Hono
 * GET /api/feed route (batches 2+).
 *
 * Each feed batch fetches TMDB_PAGES_PER_BATCH Discover pages per active
 * media type. "all" interleaves movie/TV results alternately, preserving each
 * lens's own ranking (re-sorting by popularity would scramble e.g. Top Rated).
 * See docs/PRD.md §2 and DECISIONS 2026-07-19 (feed simplification).
 */

import {
  discoverTitles,
  getDisplayTitle,
  getReleaseDate,
  type TmdbTrendingItem,
} from "$lib/tmdb";
import { calculateReelScore } from "$lib/scoring";
import { getScoresBatched, type ScoreRequest } from "./scores";
import type { FeedItem, FeedPage, FeedQuery } from "$lib/schemas";

import { MAX_FEED_PAGES } from "$lib/feed.constants";

/** TMDB pages (20 items each) fetched per feed batch, per active media type. */
const TMDB_PAGES_PER_BATCH = 2;

/**
 * Alternately interleaves multiple lists, preserving each list's own order.
 * Used to blend movie + TV results for the "all" tab without re-ranking.
 */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(...lists.map((l) => l.length), 0);
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]!);
    }
  }
  return out;
}

/**
 * Builds one feed batch: Discover fetches (parallel) → interleave → dedup →
 * batched score lookup → FeedItem[].
 *
 * @param d1 - D1 binding (score cache)
 * @param tmdbApiKey - TMDB API key
 * @param mdblistApiKey - MDbList API key
 * @param query - Validated feed query (type, sort, page)
 * @returns Feed page with scored items
 */
export async function getFeedPage(
  d1: D1Database,
  tmdbApiKey: string,
  mdblistApiKey: string,
  query: FeedQuery
): Promise<FeedPage> {
  const mediaTypes: ("movie" | "tv")[] =
    query.type === "all" ? ["movie", "tv"] : [query.type];

  // Feed batch N covers TMDB pages (N-1)*B+1 .. N*B for each active type.
  const firstTmdbPage = (query.page - 1) * TMDB_PAGES_PER_BATCH + 1;
  const pageNumbers = Array.from(
    { length: TMDB_PAGES_PER_BATCH },
    (_, i) => firstTmdbPage + i
  );

  // All Discover fetches in parallel.
  const responses = await Promise.all(
    mediaTypes.map((mediaType) =>
      Promise.all(
        pageNumbers.map((p) => discoverTitles(tmdbApiKey, mediaType, query.sort, p))
      )
    )
  );

  // Per-type lists (pages concatenated in order), then interleave across types.
  let anySourceHasMore = false;
  const perType: TmdbTrendingItem[][] = responses.map((typeResponses) => {
    const items: TmdbTrendingItem[] = [];
    for (const res of typeResponses) {
      if (!res) continue;
      items.push(...res.results);
      if (res.page < res.total_pages) anySourceHasMore = true;
    }
    return items;
  });

  // Dedup within the batch — popularity drift between pages can repeat ids.
  const seen = new Set<number>();
  const blended = interleave(perType).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // Batched score lookup (D1 cache first, MDbList for misses/stale).
  const scoreRequests: ScoreRequest[] = blended.map((item) => ({
    tmdbId: item.id,
    mediaType: item.media_type,
    releaseDate: getReleaseDate(item) ?? null,
  }));
  const scoreData = await getScoresBatched(d1, mdblistApiKey, scoreRequests);

  const items: FeedItem[] = blended.map((item, i) => {
    const data = scoreData[i];
    // Recompute from the cached inputs — calculateReelScore is cheap pure
    // math and this keeps a single source of truth for the number.
    const result = data ? calculateReelScore(data.scores) : null;
    return {
      tmdbId: item.id,
      mediaType: item.media_type,
      title: getDisplayTitle(item),
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      releaseDate: getReleaseDate(item) ?? null,
      popularity: item.popularity,
      score: result?.score ?? null,
      sourceCount: data?.sourceCount ?? 0,
      // Full math only in dev builds — see docs/PRD.md Score display
      ...(import.meta.env.DEV && result?.breakdown
        ? { breakdown: result.breakdown }
        : {}),
    };
  });

  return {
    items,
    page: query.page,
    hasMore: anySourceHasMore && query.page < MAX_FEED_PAGES,
  };
}
