/**
 * TMDB API client.
 * Used for title metadata, images, cast/crew, genres, streaming
 * availability, search, and feed data (trending, now playing, etc.).
 *
 * NOT used for scores — all scores come from MDbList.
 * See CLAUDE.md External API Notes.
 *
 * API docs: https://developer.themoviedb.org/reference
 */

import { kvGet, kvPut, getCacheTtl } from "./kv.ts";

// --- Constants ---

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/** Image size presets for posters and profile photos */
export const IMAGE_SIZES = {
  poster: {
    small: "w185",
    medium: "w342",
    large: "w500",
    original: "original",
  },
  backdrop: {
    small: "w300",
    medium: "w780",
    large: "w1280",
    original: "original",
  },
  profile: {
    small: "w45",
    medium: "w185",
    large: "h632",
    original: "original",
  },
  logo: {
    small: "w45",
    medium: "w92",
    large: "w154",
    original: "original",
  },
} as const;

// --- Types ---

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number;
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TmdbGenre[];
  adult: boolean;
  original_language: string;
  imdb_id: string | null;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TmdbGenre[];
  original_language: string;
  /** TV shows don't have imdb_id in base details — use external_ids if needed */
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface TmdbWatchProviders {
  flatrate?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
  link?: string;
}

export interface TmdbSearchResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  release_date?: string;
  first_air_date?: string;
  adult?: boolean;
}

export interface TmdbPaginatedResponse<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export interface TmdbTrendingItem {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  release_date?: string;
  first_air_date?: string;
}

export interface TmdbSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

// --- Unified Title Type ---

/**
 * Normalized title object that works for both movies and TV shows.
 * This is the shape we pass around in the app after fetching from TMDB.
 */
export interface TmdbTitle {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  overview: string;
  releaseDate: string;
  runtime: number | null;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  posterPath: string | null;
  backdropPath: string | null;
  genres: TmdbGenre[];
  imdbId: string | null;
  /** TV-only fields */
  numberOfSeasons?: number;
  seasons?: TmdbSeason[];
}

// --- Image URL Helpers ---

/**
 * Builds a full TMDB image URL from a path and size preset.
 *
 * @param path - Image path from TMDB (e.g., "/abc123.jpg"), or null
 * @param type - Image type ("poster", "backdrop", "profile", "logo")
 * @param size - Size preset ("small", "medium", "large", "original")
 * @returns Full image URL, or null if path is null
 */
export function getImageUrl(
  path: string | null,
  type: keyof typeof IMAGE_SIZES = "poster",
  size: "small" | "medium" | "large" | "original" = "medium"
): string | null {
  if (!path) return null;
  const sizeValue = IMAGE_SIZES[type][size];
  return `${TMDB_IMAGE_BASE}/${sizeValue}${path}`;
}

// --- API Fetch Helper ---

/**
 * Makes an authenticated request to the TMDB API.
 * TMDB uses query parameter auth with `api_key`.
 *
 * @param apiKey - TMDB API key
 * @param path - API path (e.g., "/movie/123")
 * @param params - Additional query parameters
 * @returns Parsed JSON response or null on failure
 */
async function tmdbFetch<T>(
  apiKey: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(
        `TMDB API error: ${response.status} ${response.statusText} for ${path}`
      );
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`TMDB API fetch failed for ${path}:`, error);
    return null;
  }
}

// --- Title Details ---

/**
 * Fetches movie details from TMDB.
 *
 * @param apiKey - TMDB API key
 * @param movieId - TMDB movie ID
 * @returns Movie details or null
 */
export async function getMovieDetails(
  apiKey: string,
  movieId: number
): Promise<TmdbMovieDetails | null> {
  return tmdbFetch<TmdbMovieDetails>(apiKey, `/movie/${movieId}`);
}

/**
 * Fetches TV show details from TMDB.
 *
 * @param apiKey - TMDB API key
 * @param tvId - TMDB TV show ID
 * @returns TV show details or null
 */
export async function getTvDetails(
  apiKey: string,
  tvId: number
): Promise<TmdbTvDetails | null> {
  return tmdbFetch<TmdbTvDetails>(apiKey, `/tv/${tvId}`);
}

/**
 * Fetches title details and normalizes them into a unified TmdbTitle shape.
 * This is the primary function for getting title metadata — use this
 * instead of getMovieDetails/getTvDetails directly.
 *
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Normalized title object or null
 */
export async function getTitleDetails(
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbTitle | null> {
  if (mediaType === "movie") {
    const movie = await getMovieDetails(apiKey, tmdbId);
    if (!movie) return null;

    return {
      tmdbId: movie.id,
      mediaType: "movie",
      title: movie.title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      runtime: movie.runtime,
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
      popularity: movie.popularity,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      genres: movie.genres,
      imdbId: movie.imdb_id,
    };
  }

  const tv = await getTvDetails(apiKey, tmdbId);
  if (!tv) return null;

  return {
    tmdbId: tv.id,
    mediaType: "tv",
    title: tv.name,
    overview: tv.overview,
    releaseDate: tv.first_air_date,
    runtime: tv.episode_run_time?.[0] ?? null,
    voteAverage: tv.vote_average,
    voteCount: tv.vote_count,
    popularity: tv.popularity,
    posterPath: tv.poster_path,
    backdropPath: tv.backdrop_path,
    genres: tv.genres,
    imdbId: null, // TV shows don't include imdb_id in base details
    numberOfSeasons: tv.number_of_seasons,
  };
}

// --- Credits ---

/**
 * Fetches cast and crew for a title.
 *
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Credits object with cast and crew arrays, or null
 */
export async function getCredits(
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbCredits | null> {
  const path = mediaType === "movie"
    ? `/movie/${tmdbId}/credits`
    : `/tv/${tmdbId}/credits`;

  return tmdbFetch<TmdbCredits>(apiKey, path);
}

/**
 * Extracts the director(s) from a credits response.
 * Movies typically have 1 director; TV shows may have none at this level.
 */
export function getDirectors(credits: TmdbCredits): TmdbCrewMember[] {
  return credits.crew.filter((c) => c.job === "Director");
}

/**
 * Gets the top-billed cast members (first N by billing order).
 *
 * @param credits - Credits response
 * @param limit - Max number of cast members to return (default 10)
 */
export function getTopCast(credits: TmdbCredits, limit = 10): TmdbCastMember[] {
  return credits.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, limit);
}

// --- Watch Providers (Streaming Availability) ---

/**
 * Fetches streaming availability for a title in the US.
 *
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Watch provider data for the US, or null
 */
export async function getWatchProviders(
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbWatchProviders | null> {
  const path = mediaType === "movie"
    ? `/movie/${tmdbId}/watch/providers`
    : `/tv/${tmdbId}/watch/providers`;

  const response = await tmdbFetch<{ results: Record<string, TmdbWatchProviders> }>(
    apiKey,
    path
  );

  if (!response?.results) return null;

  // We only care about US availability — see CLAUDE.md
  return response.results["US"] ?? null;
}

// --- Search ---

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

// --- Feed Endpoints (Trending, Now Playing, etc.) ---

/**
 * Fetches trending movies and TV shows for the week.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number (1-based, 20 results per page from TMDB)
 * @returns Paginated trending results
 */
export async function getTrending(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/trending/all/week",
    { page: String(page) }
  );
}

/**
 * Fetches movies currently in theaters.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated now-playing movies
 */
export async function getNowPlaying(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/movie/now_playing",
    { page: String(page) }
  );

  if (!response) return null;

  // now_playing returns movies without media_type — add it
  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

/**
 * Fetches TV shows currently on the air.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated on-the-air TV shows
 */
export async function getOnTheAir(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/tv/on_the_air",
    { page: String(page) }
  );

  if (!response) return null;

  // on_the_air returns TV shows without media_type — add it
  response.results = response.results.map((r) => ({
    ...r,
    media_type: "tv" as const,
    // TV shows use "name" instead of "title"
  }));

  return response;
}

/**
 * Fetches upcoming movies.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated upcoming movies
 */
export async function getUpcoming(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/movie/upcoming",
    { page: String(page) }
  );

  if (!response) return null;

  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

// --- Popular (Deep Pagination) ---

/**
 * Fetches popular movies from TMDB, filtered to US releases.
 * Uses the Discover endpoint with watch_region=US and with_release_type
 * to ensure only titles available in the US are returned.
 * Unlike trending (which has ~40 titles total), discover has 500+ pages,
 * making it ideal for infinite scroll pagination.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number (1-based, 20 results per page)
 * @returns Paginated popular movies with US releases
 */
export async function getPopularMovies(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  // Discover endpoint supports proper region filtering.
  // watch_region=US limits to titles available in the US.
  // sort_by=popularity.desc gives the same ordering as /movie/popular.
  // See CLAUDE.md "U.S. releases only".
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/movie",
    {
      page: String(page),
      sort_by: "popularity.desc",
      watch_region: "US",
      with_original_language: "en",
    }
  );

  if (!response) return null;

  // Discover endpoint returns movies without media_type — add it
  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

/**
 * Fetches popular TV shows from TMDB, filtered to US releases.
 * Uses the Discover endpoint with watch_region=US for proper region filtering.
 * Has 500+ pages — ideal for deep pagination.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number (1-based, 20 results per page)
 * @returns Paginated popular TV shows with US releases
 */
export async function getPopularTV(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  // Discover endpoint with English language + US watch region.
  // See CLAUDE.md "U.S. releases only".
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/tv",
    {
      page: String(page),
      sort_by: "popularity.desc",
      watch_region: "US",
      with_original_language: "en",
    }
  );

  if (!response) return null;

  // Discover endpoint returns TV shows without media_type — add it
  response.results = response.results.map((r) => ({
    ...r,
    media_type: "tv" as const,
  }));

  return response;
}

// --- Genre List ---

/**
 * Fetches the full list of movie genres from TMDB.
 * Useful for mapping genre_ids to genre names in search/trending results.
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

// --- Cached Title Fetching ---

/**
 * Gets title details with KV caching.
 * Caches the normalized TmdbTitle object in KV to avoid repeated API calls.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Cached or freshly-fetched title details
 */
export async function getCachedTitleDetails(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbTitle | null> {
  const cacheKey = `tmdb:title:${tmdbId}`;

  // Check cache first
  const cached = await kvGet<TmdbTitle>(kv, cacheKey);
  if (cached) return cached;

  // Fetch fresh from TMDB
  const title = await getTitleDetails(apiKey, tmdbId, mediaType);
  if (!title) return null;

  // Cache with TTL based on release date
  const ttl = getCacheTtl(title.releaseDate);
  await kvPut(kv, cacheKey, title, ttl);

  return title;
}

/**
 * Gets credits with KV caching.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Cached or freshly-fetched credits
 */
export async function getCachedCredits(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbCredits | null> {
  const cacheKey = `tmdb:credits:${tmdbId}`;

  const cached = await kvGet<TmdbCredits>(kv, cacheKey);
  if (cached) return cached;

  const credits = await getCredits(apiKey, tmdbId, mediaType);
  if (!credits) return null;

  // Credits rarely change — cache for 7 days
  await kvPut(kv, cacheKey, credits, 7 * 24 * 60 * 60);

  return credits;
}

/**
 * Gets watch providers with KV caching.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Cached or freshly-fetched watch providers for US
 */
export async function getCachedWatchProviders(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbWatchProviders | null> {
  const cacheKey = `tmdb:providers:${tmdbId}`;

  const cached = await kvGet<TmdbWatchProviders>(kv, cacheKey);
  if (cached) return cached;

  const providers = await getWatchProviders(apiKey, tmdbId, mediaType);
  if (!providers) return null;

  // Streaming availability changes occasionally — cache for 3 days
  await kvPut(kv, cacheKey, providers, 3 * 24 * 60 * 60);

  return providers;
}

// --- Utility: Get Display Title ---

/**
 * Returns the display title from a search/trending result.
 * Movies use "title", TV shows use "name".
 */
export function getDisplayTitle(
  item: TmdbSearchResult | TmdbTrendingItem
): string {
  return item.title ?? item.name ?? "Unknown Title";
}

/**
 * Returns the release date from a search/trending result.
 * Movies use "release_date", TV shows use "first_air_date".
 */
export function getReleaseDate(
  item: TmdbSearchResult | TmdbTrendingItem
): string | undefined {
  return item.release_date ?? item.first_air_date;
}
