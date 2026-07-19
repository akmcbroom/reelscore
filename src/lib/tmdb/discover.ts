/**
 * TMDB Discover queries for the feed.
 *
 * Rebuilt design (DECISIONS 2026-07-19): each (mediaType, sort) view is ONE
 * Discover query with native TMDB pagination. The old 6-source blendAndDedup +
 * lockstep pagination + exclude-param machinery was retired as
 * overcomplicated. The tuned content filters from that era are preserved here.
 *
 * All queries share these US-content filters (see docs/PRD.md §2):
 * - certification_country=US (+ certification.lte=R for movies)
 * - include_adult=false
 * - with_watch_monetization_type=flatrate|free|ads wherever watch_region is used
 * - TV excludes News (10763) and Talk (10767) genres
 * - No language filter — international titles with US distribution appear
 * - Anime (ja + Animation genre) filtered post-fetch via filterAnime()
 */

import { tmdbFetch } from "./client";
import type { TmdbPaginatedResponse, TmdbTrendingItem } from "./types";

/** The four feed sort lenses — each maps 1:1 to a Discover query. */
export const FEED_SORTS = ["popular", "top_rated", "new_releases", "upcoming"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

/** Animation genre ID on TMDB — used for anime filtering */
const ANIMATION_GENRE_ID = 16;

/** TV genres excluded from all TV queries: News (10763), Talk (10767) */
const TV_EXCLUDED_GENRES = "10763|10767";

/** Formats a Date as TMDB's expected YYYY-MM-DD. */
function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

/** Returns a date offset from today by the given number of days. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/**
 * Builds the Discover query params for a given media type + sort lens.
 * Kept as a separate pure function so the query logic is easy to audit
 * against the PRD without mocking fetch.
 */
export function buildDiscoverParams(
  mediaType: "movie" | "tv",
  sort: FeedSort
): Record<string, string> {
  if (mediaType === "movie") {
    // Movie sources add certification.lte=R to exclude NC-17/unrated.
    const base: Record<string, string> = {
      include_adult: "false",
      certification_country: "US",
      "certification.lte": "R",
    };

    switch (sort) {
      case "popular":
        // vote_count.gte=10 filters zero-audience indie/obscure content.
        return {
          ...base,
          sort_by: "popularity.desc",
          watch_region: "US",
          with_watch_monetization_type: "flatrate|free|ads",
          "vote_count.gte": "10",
        };
      case "top_rated":
        // vote_count.gte=300 prevents obscure titles with perfect scores
        // from a handful of votes from topping the list.
        return {
          ...base,
          sort_by: "vote_average.desc",
          watch_region: "US",
          with_watch_monetization_type: "flatrate|free|ads",
          "vote_count.gte": "300",
        };
      case "new_releases":
        // In-theaters window: 45-day lookback to today. region=US makes
        // release_date filters apply to US release dates.
        return {
          ...base,
          sort_by: "popularity.desc",
          region: "US",
          "release_date.gte": daysFromNow(-45),
          "release_date.lte": daysFromNow(0),
          "vote_count.gte": "10",
        };
      case "upcoming":
        // Next 30 days of US releases. No vote floor — unreleased titles
        // have no votes yet.
        return {
          ...base,
          sort_by: "popularity.desc",
          region: "US",
          "release_date.gte": daysFromNow(0),
          "release_date.lte": daysFromNow(30),
        };
    }
  }

  // TV
  const base: Record<string, string> = {
    include_adult: "false",
    certification_country: "US",
    without_genres: TV_EXCLUDED_GENRES,
  };

  switch (sort) {
    case "popular": {
      // 2-year premiere floor excludes legacy long-runners (Grey's Anatomy)
      // that would otherwise dominate popularity.desc forever. Top Rated
      // handles acclaimed older shows. vote_count.gte=50 — higher bar than
      // movies because TV has more junk entries on TMDB.
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return {
        ...base,
        sort_by: "popularity.desc",
        watch_region: "US",
        with_watch_monetization_type: "flatrate|free|ads",
        "vote_count.gte": "50",
        "first_air_date.gte": isoDate(twoYearsAgo),
      };
    }
    case "top_rated":
      return {
        ...base,
        sort_by: "vote_average.desc",
        watch_region: "US",
        with_watch_monetization_type: "flatrate|free|ads",
        "vote_count.gte": "200",
      };
    case "new_releases":
      // Shows that premiered in the last 90 days. Lower vote floor —
      // brand-new shows haven't accumulated votes.
      return {
        ...base,
        sort_by: "popularity.desc",
        watch_region: "US",
        with_watch_monetization_type: "flatrate|free|ads",
        "vote_count.gte": "10",
        "first_air_date.gte": daysFromNow(-90),
        "first_air_date.lte": daysFromNow(0),
      };
    case "upcoming":
      // Premieres in the next 60 days. No vote floor and no monetization
      // filter — unaired shows often lack both providers and votes.
      return {
        ...base,
        sort_by: "popularity.desc",
        "first_air_date.gte": daysFromNow(1),
        "first_air_date.lte": daysFromNow(60),
      };
  }
}

/**
 * Removes anime from a result list: Japanese original language + Animation
 * genre. Anime has disproportionate TMDB engagement globally, crowding out
 * US-relevant content. Western animation (Pixar, Disney) and non-anime
 * Japanese content pass through.
 */
export function filterAnime(items: TmdbTrendingItem[]): TmdbTrendingItem[] {
  return items.filter(
    (item) =>
      !(
        item.original_language === "ja" &&
        item.genre_ids?.includes(ANIMATION_GENRE_ID)
      )
  );
}

/**
 * Runs one Discover query for a (mediaType, sort) view.
 * Tags each result with media_type (Discover omits it) and applies the
 * anime filter. Native TMDB pagination — 20 results per page.
 *
 * @param apiKey - TMDB API key
 * @param mediaType - "movie" or "tv"
 * @param sort - Feed sort lens
 * @param page - TMDB page number (1-based)
 * @returns Paginated, filtered results or null on API failure
 */
export async function discoverTitles(
  apiKey: string,
  mediaType: "movie" | "tv",
  sort: FeedSort,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const params = buildDiscoverParams(mediaType, sort);
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    mediaType === "movie" ? "/discover/movie" : "/discover/tv",
    { ...params, page: String(page) }
  );

  if (!response) return null;

  response.results = filterAnime(
    response.results.map((r) => ({ ...r, media_type: mediaType }))
  );

  return response;
}
