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
  /** TMDB returns seasons array on /tv/{id} — used for seasons list in Title Modal */
  seasons?: TmdbSeason[];
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
  original_language: string;
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

/** A single episode from TMDB's /tv/{id}/season/{N} endpoint */
export interface TmdbEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  /** Landscape screenshot image path */
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
}

/** Full season detail including episodes array — from /tv/{id}/season/{N} */
export interface TmdbSeasonDetail extends TmdbSeason {
  episodes: TmdbEpisode[];
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
    // TMDB returns seasons array on /tv/{id} — used for Title Modal seasons list
    seasons: tv.seasons,
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

// --- Trending (Weekly) ---

/**
 * Fetches trending movies and TV shows for the week from TMDB.
 * Unlike Discover (which uses TMDB's daily popularity metric),
 * trending/week captures cultural moments — big premieres, viral
 * hits, award buzz. Used to top the Discover grid so the most
 * culturally relevant content appears first.
 *
 * Returns both movies and TV in one call with media_type included
 * on each result (unlike Discover, which requires manual tagging).
 * Shallow endpoint (~40 titles across 2 pages) — not suitable for
 * deep pagination, only for seeding the top of the grid.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number (1-based, 20 results per page)
 * @returns Paginated trending results with media_type included
 */
export async function getTrending(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/trending/all/week",
    { page: String(page), region: "US" }
  );
}

// --- Popular (Deep Pagination) ---

/**
 * Fetches popular movies from TMDB, filtered to US availability.
 * Uses the Discover endpoint with watch_region=US to ensure only
 * titles available in the US are returned. No language filter —
 * non-English hits with US distribution (Squid Game, Parasite, etc.)
 * should still appear. vote_count.gte=10 filters zero-audience content.
 * Has 500+ pages — ideal for infinite scroll.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number (1-based, 20 results per page)
 * @returns Paginated popular movies with US availability
 */
export async function getPopularMovies(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  // Discover endpoint with watch_region=US filters to titles
  // available on US streaming/theatrical. No language filter —
  // see CLAUDE.md "U.S. releases only" (region, not language).
  // vote_count.gte=10 filters out zero-audience indie/obscure content.
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/movie",
    {
      page: String(page),
      sort_by: "popularity.desc",
      watch_region: "US",
      "vote_count.gte": "10",
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
 * Fetches popular TV shows from TMDB, sorted by popularity.
 * Uses a 2-year premiere date floor (first_air_date.gte) to exclude
 * legacy long-running shows like Grey's Anatomy (premiered 2005) while
 * keeping popular recent shows like Daredevil Born Again (Jan 2025).
 * Excludes News (10763) and Talk (10767) genres — daily programs that
 * inflate popularity but aren't discovery-worthy for ReelScore.
 * vote_count.gte=50 filters low-audience content (higher bar than movies
 * because TV has more junk entries on TMDB).
 * No language filter — non-English hits with US distribution appear.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number (1-based, 20 results per page)
 * @returns Paginated popular TV shows with US availability
 */
export async function getPopularTV(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  // popularity.desc keeps genuinely popular shows ranked high.
  // first_air_date.gte (2 years ago) filters out legacy shows that
  // would otherwise dominate — Grey's Anatomy, Law & Order, etc.
  // Top Rated TV (vote_average.desc) handles acclaimed older shows.
  // watch_region=US filters to US-available content.
  // without_genres excludes News (10763) and Talk (10767).
  // vote_count.gte=50 — higher bar than movies to filter TV junk.
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const dateFloor = twoYearsAgo.toISOString().split("T")[0];

  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/tv",
    {
      page: String(page),
      sort_by: "popularity.desc",
      watch_region: "US",
      without_genres: "10763|10767",
      "vote_count.gte": "50",
      "first_air_date.gte": dateFloor,
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

// --- Multi-Source Discovery Endpoints ---
// These 4 endpoints + getPopularMovies + getPopularTV form the 6-source
// blended discovery feed. See CLAUDE.md Discovery Feed (Home Page).

/**
 * Fetches movies currently in US theaters via Discover.
 * Uses region=US so release_date filters apply to US release dates.
 * 45-day lookback to today — no lookahead (Upcoming handles future).
 * vote_count.gte=10 filters zero-audience content.
 * Sorted by popularity so mainstream titles surface first.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated now-playing movies (US theaters)
 */
export async function getNowPlayingMovies(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 45);
  const dateGte = past.toISOString().split("T")[0];
  const dateLte = now.toISOString().split("T")[0];

  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/movie",
    {
      page: String(page),
      sort_by: "popularity.desc",
      region: "US",
      "release_date.gte": dateGte,
      "release_date.lte": dateLte,
      "vote_count.gte": "10",
    }
  );

  if (!response) return null;

  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

/**
 * Fetches top-rated movies via Discover, sorted by audience rating.
 * vote_count.gte=300 ensures only movies with significant audience
 * engagement — prevents obscure titles with perfect scores from a
 * handful of votes from appearing.
 * watch_region=US filters to US-available content.
 * Recent content is already covered by Popular Movies and Now Playing,
 * so this source adds a quality signal (acclaimed films).
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated top-rated movies (US)
 */
export async function getTopRatedMovies(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/movie",
    {
      page: String(page),
      sort_by: "vote_average.desc",
      watch_region: "US",
      "vote_count.gte": "300",
    }
  );

  if (!response) return null;

  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

/**
 * Fetches upcoming movies releasing in the US within the next 30 days.
 * Uses region=US so release_date filters apply to US theatrical dates —
 * no language filter needed since region already ensures US distribution.
 * Sorted by popularity so the most anticipated releases surface first.
 * Shallow endpoint (limited pages) — exhausts naturally at high page numbers.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated upcoming movies (US, next 30 days)
 */
export async function getUpcomingMovies(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + 30);
  const dateGte = now.toISOString().split("T")[0];
  const dateLte = future.toISOString().split("T")[0];

  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/movie",
    {
      page: String(page),
      sort_by: "popularity.desc",
      region: "US",
      "release_date.gte": dateGte,
      "release_date.lte": dateLte,
    }
  );

  if (!response) return null;

  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

/**
 * Fetches highly-rated TV shows via Discover.
 * Sorted by vote_average.desc to surface the best-reviewed shows.
 * vote_count.gte=200 ensures only well-established shows with
 * significant audience engagement — prevents obscure titles with
 * perfect scores from a handful of votes.
 * Excludes News (10763) and Talk (10767) genres.
 * watch_region=US filters to US-available content.
 *
 * @param apiKey - TMDB API key
 * @param page - Page number
 * @returns Paginated top-rated TV shows (US)
 */
export async function getTopRatedTV(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/tv",
    {
      page: String(page),
      sort_by: "vote_average.desc",
      watch_region: "US",
      without_genres: "10763|10767",
      "vote_count.gte": "200",
    }
  );

  if (!response) return null;

  response.results = response.results.map((r) => ({
    ...r,
    media_type: "tv" as const,
  }));

  return response;
}

// --- Blend & Dedup Helper ---

/** Animation genre ID on TMDB — used for anime filtering */
const ANIMATION_GENRE_ID = 16;

/**
 * Blends multiple TMDB result arrays into a single deduplicated list.
 * Shared by index.astro (page 1) and feed.ts (pages 2+) to ensure
 * identical blending logic across all feed pages.
 *
 * Steps:
 * 1. Flatten all source arrays into one pool
 * 2. Deduplicate by TMDB ID (first occurrence wins)
 * 3. Filter out anime (Japanese + Animation genre 16)
 * 4. Filter out excluded IDs (cross-dedup from previous pages)
 * 5. Sort by popularity descending
 *
 * @param sources - Arrays of TMDB items from different Discover queries
 * @param excludeIds - Set of TMDB IDs to exclude (cross-page dedup)
 * @returns Deduplicated, filtered, sorted array (caller takes first 60)
 */
export function blendAndDedup(
  sources: TmdbTrendingItem[][],
  excludeIds: Set<number>
): TmdbTrendingItem[] {
  const seen = new Set<number>();
  const items: TmdbTrendingItem[] = [];

  for (const source of sources) {
    for (const item of source) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);

      // Filter anime: Japanese language + Animation genre.
      // Anime has disproportionate TMDB engagement globally, crowding
      // out US-relevant content. Western animation (Pixar, Disney) and
      // non-anime Japanese content pass through.
      const isAnime =
        item.original_language === "ja" &&
        item.genre_ids?.includes(ANIMATION_GENRE_ID);
      if (isAnime) continue;

      // Cross-dedup: skip items already shown on previous pages
      if (excludeIds.has(item.id)) continue;

      items.push(item);
    }
  }

  // Sort by popularity descending so the feed feels cohesive
  items.sort((a, b) => b.popularity - a.popularity);

  return items;
}

// --- Deprecated Endpoints (kept for potential future use) ---

/**
 * @deprecated Replaced by getNowPlayingMovies. Kept for potential
 * future use in other features.
 */
export async function getNewReleaseMovies(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 45);
  const future = new Date(now);
  future.setDate(future.getDate() + 7);
  const dateGte = past.toISOString().split("T")[0];
  const dateLte = future.toISOString().split("T")[0];

  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/movie",
    {
      page: String(page),
      sort_by: "popularity.desc",
      region: "US",
      "release_date.gte": dateGte,
      "release_date.lte": dateLte,
      "vote_count.gte": "10",
    }
  );

  if (!response) return null;

  response.results = response.results.map((r) => ({
    ...r,
    media_type: "movie" as const,
  }));

  return response;
}

/**
 * @deprecated Replaced by modified getPopularTV (first_air_date.desc).
 * Kept for potential future use in other features.
 */
export async function getNewReleaseTV(
  apiKey: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbTrendingItem> | null> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 180);
  const future = new Date(now);
  future.setDate(future.getDate() + 7);
  const dateGte = past.toISOString().split("T")[0];
  const dateLte = future.toISOString().split("T")[0];

  const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTrendingItem>>(
    apiKey,
    "/discover/tv",
    {
      page: String(page),
      sort_by: "popularity.desc",
      watch_region: "US",
      "first_air_date.gte": dateGte,
      "first_air_date.lte": dateLte,
      "vote_count.gte": "10",
    }
  );

  if (!response) return null;

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

// --- Season Details (Episodes) ---

/**
 * Fetches full season details including all episodes from TMDB.
 * Uses the /tv/{id}/season/{season_number} endpoint.
 *
 * @param apiKey - TMDB API key
 * @param tvId - TMDB TV show ID
 * @param seasonNumber - Season number to fetch
 * @returns Season detail with episodes array, or null
 */
export async function getSeasonDetails(
  apiKey: string,
  tvId: number,
  seasonNumber: number
): Promise<TmdbSeasonDetail | null> {
  return tmdbFetch<TmdbSeasonDetail>(
    apiKey,
    `/tv/${tvId}/season/${seasonNumber}`
  );
}

/**
 * Gets season details with KV caching. Episode data rarely changes
 * for aired seasons — 7-day TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tvId - TMDB TV show ID
 * @param seasonNumber - Season number to fetch
 * @returns Cached or freshly-fetched season detail
 */
export async function getCachedSeasonDetails(
  kv: KVNamespace,
  apiKey: string,
  tvId: number,
  seasonNumber: number
): Promise<TmdbSeasonDetail | null> {
  const cacheKey = `tmdb:season:${tvId}:${seasonNumber}`;

  const cached = await kvGet<TmdbSeasonDetail>(kv, cacheKey);
  if (cached) return cached;

  const season = await getSeasonDetails(apiKey, tvId, seasonNumber);
  if (!season) return null;

  // Episode data rarely changes for aired seasons — cache for 7 days
  await kvPut(kv, cacheKey, season, 7 * 24 * 60 * 60);

  return season;
}

// --- Videos (Trailers) ---

/** A video (trailer, teaser, clip, etc.) from TMDB */
// --- Title Logos ---

export interface TmdbLogo {
  /** Path to logo image on TMDB CDN */
  file_path: string;
  /** Language code (e.g., "en") — null for language-neutral logos */
  iso_639_1: string | null;
  width: number;
  height: number;
  /** Community vote average — higher means better quality */
  vote_average: number;
  /** Number of community votes — more votes = more validated */
  vote_count: number;
}

/**
 * Fetches logo images for a title from TMDB's images endpoint.
 * Filters to English logos only for consistency.
 *
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Array of English logos or null
 */
export async function getLogos(
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbLogo[] | null> {
  const path = mediaType === "movie"
    ? `/movie/${tmdbId}/images`
    : `/tv/${tmdbId}/images`;

  const response = await tmdbFetch<{ logos: TmdbLogo[] }>(apiKey, path);
  // Filter to English logos only — avoids non-Latin scripts
  const englishLogos = response?.logos?.filter(
    (l) => l.iso_639_1 === "en"
  );
  return englishLogos && englishLogos.length > 0 ? englishLogos : null;
}

/**
 * Picks the best logo — returns the first logo in TMDB's list.
 * TMDB orders by relevance/popularity. Displayed in original colors
 * (no invert) since many logos have solid backgrounds that don't
 * invert cleanly.
 *
 * @param logos - Array of logos from TMDB
 * @returns First logo or null
 */
export function getBestLogo(logos: TmdbLogo[]): TmdbLogo | null {
  return logos.length > 0 ? logos[0] : null;
}

/**
 * Gets title logos with KV caching. Logos rarely change — 7-day TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Cached or freshly-fetched logos
 */
export async function getCachedLogos(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbLogo[] | null> {
  const cacheKey = `tmdb:logos:${tmdbId}`;

  const cached = await kvGet<TmdbLogo[]>(kv, cacheKey);
  if (cached) return cached;

  const logos = await getLogos(apiKey, tmdbId, mediaType);
  if (!logos) return null;

  // Logos rarely change — cache for 7 days
  await kvPut(kv, cacheKey, logos, 7 * 24 * 60 * 60);

  return logos;
}

// --- Videos ---

export interface TmdbVideo {
  id: string;
  /** YouTube video ID — used to build embed URL */
  key: string;
  name: string;
  /** Video hosting site — we only use "YouTube" */
  site: string;
  /** Video type: "Trailer", "Teaser", "Clip", "Featurette", etc. */
  type: string;
  official: boolean;
}

/**
 * Fetches videos (trailers, teasers, etc.) for a title from TMDB.
 *
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Array of videos or null
 */
export async function getVideos(
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbVideo[] | null> {
  const path = mediaType === "movie"
    ? `/movie/${tmdbId}/videos`
    : `/tv/${tmdbId}/videos`;

  const response = await tmdbFetch<{ results: TmdbVideo[] }>(apiKey, path);
  return response?.results ?? null;
}

/**
 * Gets the best trailer for a title — prefers official YouTube trailers,
 * falls back to teasers, then any YouTube video.
 *
 * @param videos - Array of videos from TMDB
 * @returns Best trailer video or null if none found
 */
export function getBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
  const youtubeVideos = videos.filter((v) => v.site === "YouTube");

  // Prefer official trailers
  const officialTrailer = youtubeVideos.find(
    (v) => v.type === "Trailer" && v.official
  );
  if (officialTrailer) return officialTrailer;

  // Fall back to any trailer
  const anyTrailer = youtubeVideos.find((v) => v.type === "Trailer");
  if (anyTrailer) return anyTrailer;

  // Fall back to teaser
  const teaser = youtubeVideos.find((v) => v.type === "Teaser");
  if (teaser) return teaser;

  // Fall back to any YouTube video
  return youtubeVideos[0] ?? null;
}

/**
 * Gets videos with KV caching. Trailers rarely change — 7-day TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Cached or freshly-fetched videos
 */
export async function getCachedVideos(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbVideo[] | null> {
  const cacheKey = `tmdb:videos:${tmdbId}`;

  const cached = await kvGet<TmdbVideo[]>(kv, cacheKey);
  if (cached) return cached;

  const videos = await getVideos(apiKey, tmdbId, mediaType);
  if (!videos) return null;

  // Trailers rarely change — cache for 7 days
  await kvPut(kv, cacheKey, videos, 7 * 24 * 60 * 60);

  return videos;
}

// --- Content Ratings (MPAA / TV Ratings) ---

/**
 * Fetches the US content rating (e.g., "PG-13", "R", "TV-MA") for a title.
 * Movies and TV use different TMDB endpoints:
 *   - Movies: /movie/{id}/release_dates → US certification
 *   - TV: /tv/{id}/content_ratings → US rating
 *
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns US content rating string (e.g., "PG-13") or null if unavailable
 */
export async function getContentRating(
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<string | null> {
  if (mediaType === "movie") {
    // Movies: extract US certification from release_dates endpoint
    const response = await tmdbFetch<{
      results: Array<{
        iso_3166_1: string;
        release_dates: Array<{ certification: string }>;
      }>;
    }>(apiKey, `/movie/${tmdbId}/release_dates`);

    const usRelease = response?.results?.find((r) => r.iso_3166_1 === "US");
    // Find the first non-empty certification in the US release dates
    const certification = usRelease?.release_dates?.find(
      (rd) => rd.certification && rd.certification.length > 0
    )?.certification;

    return certification ?? null;
  }

  // TV: extract US rating from content_ratings endpoint
  const response = await tmdbFetch<{
    results: Array<{ iso_3166_1: string; rating: string }>;
  }>(apiKey, `/tv/${tmdbId}/content_ratings`);

  const usRating = response?.results?.find((r) => r.iso_3166_1 === "US");
  return usRating?.rating ?? null;
}

/**
 * Gets content rating with KV caching. Ratings never change — 7-day TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - TMDB API key
 * @param tmdbId - TMDB title ID
 * @param mediaType - "movie" or "tv"
 * @returns Cached or freshly-fetched content rating
 */
export async function getCachedContentRating(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<string | null> {
  const cacheKey = `tmdb:rating:${tmdbId}`;

  const cached = await kvGet<string>(kv, cacheKey);
  if (cached) return cached;

  const rating = await getContentRating(apiKey, tmdbId, mediaType);
  if (!rating) return null;

  // Content ratings never change — cache for 7 days
  await kvPut(kv, cacheKey, rating, 7 * 24 * 60 * 60);

  return rating;
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
