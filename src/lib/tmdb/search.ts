/**
 * TMDB search and genre lists.
 */

import { tmdbFetch } from "./client";
import type {
  TmdbGenre,
  TmdbPaginatedResponse,
  TmdbSearchResult,
} from "./types";

/**
 * Searches for movies and TV shows by query string.
 * Uses TMDB's multi-search to get both types in one call.
 *
 * @param apiKey - TMDB API key
 * @param query - Search query
 * @param page - Page number (1-based)
 * @returns Paginated search results (filtered to movie/tv only)
 */
export async function searchTitles(
  apiKey: string,
  query: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbSearchResult> | null> {
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbSearchResult>>(
    apiKey,
    "/search/multi",
    { query, page: String(page), include_adult: "false" }
  );

  if (!response) return null;

  // Filter out "person" results — we only want movies and TV shows
  response.results = response.results.filter(
    (r) => r.media_type === "movie" || r.media_type === "tv"
  );

  return response;
}

/**
 * Fetches the full list of movie genres from TMDB.
 * Useful for mapping genre_ids to genre names in search/feed results.
 *
 * @param apiKey - TMDB API key
 * @returns Array of genres or null
 */
export async function getMovieGenres(
  apiKey: string
): Promise<TmdbGenre[] | null> {
  const response = await tmdbFetch<{ genres: TmdbGenre[] }>(
    apiKey,
    "/genre/movie/list"
  );
  return response?.genres ?? null;
}

/**
 * Fetches the full list of TV genres from TMDB.
 *
 * @param apiKey - TMDB API key
 * @returns Array of genres or null
 */
export async function getTvGenres(
  apiKey: string
): Promise<TmdbGenre[] | null> {
  const response = await tmdbFetch<{ genres: TmdbGenre[] }>(
    apiKey,
    "/genre/tv/list"
  );
  return response?.genres ?? null;
}
