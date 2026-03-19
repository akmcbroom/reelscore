/**
 * MDbList API client.
 * MDbList is the sole source for all 6 audience score data.
 * We do NOT hit TMDB for scores — see CLAUDE.md Score Engine.
 *
 * API docs: https://mdblist.docs.apiary.io
 */

import {
  kvGet,
  kvPut,
  scoresCacheKey,
  getCacheTtl,
} from "./kv.ts";

// --- Types ---

/** A single rating from one of the 6 audience score sources */
export interface MDbListRating {
  source: string;
  value: number;
  score: number;
  votes: number;
  url?: string;
}

/** Cross-platform IDs returned by MDbList */
export interface MDbListIds {
  imdb: string | null;
  tmdb: number | null;
  trakt: number | null;
  tvdb: number | null;
  mal: number | null;
}

/** Full API response from MDbList for a single title */
export interface MDbListResponse {
  title: string;
  year: number;
  released: string;
  description: string;
  runtime: number;
  score: number;
  scoreaverage: number;
  ids: MDbListIds;
  type: string;
  ratings: MDbListRating[];
}

/**
 * The 6 audience score sources we care about.
 * MDbList may return other sources — we filter to only these.
 */
export const AUDIENCE_SOURCES = [
  "imdb",
  "tomatoes",
  "metacritic",
  "letterboxd",
  "trakt",
  "tmdb",
] as const;

export type AudienceSource = (typeof AUDIENCE_SOURCES)[number];

/** Parsed score data for a single source, normalized to 0-100 */
export interface NormalizedScore {
  source: AudienceSource;
  /** Original value from the source (e.g., 7.2 for IMDb, 85 for RT) */
  rawValue: number;
  /** Normalized to 0-100 scale */
  normalizedScore: number;
  /** Number of votes/ratings on this source */
  votes: number;
}

/** Cached score data stored in KV */
export interface CachedScoreData {
  tmdbId: number;
  imdbId: string | null;
  scores: NormalizedScore[];
  sourceCount: number;
  fetchedAt: string;
}

// --- Normalization ---

/**
 * Normalizes a raw score value to the 0-100 scale based on its source.
 *
 * Different sources use different scales:
 * - IMDb: 0-10 (multiply by 10)
 * - Rotten Tomatoes: 0-100 (already normalized)
 * - Metacritic: 0-100 (already normalized)
 * - Letterboxd: 0-5 (multiply by 20)
 * - Trakt: 0-100 (already normalized, comes as percentage)
 * - TMDB: 0-10 (multiply by 10)
 *
 * A raw value of 0 means "no data" — returns null.
 * See CLAUDE.md: "Zero score = nil"
 *
 * @param value - Raw score value from MDbList
 * @param source - Which rating source this value is from
 * @returns Normalized score (0-100) or null if no data
 */
export function normalizeScore(value: number, source: string): number | null {
  // Raw 0 from MDbList means no data, not an actual score of zero
  if (value === 0) return null;

  switch (source) {
    case "imdb":
    case "tmdb":
      // 0-10 scale → multiply by 10
      return Math.round(value * 10);
    case "letterboxd":
      // 0-5 scale → multiply by 20
      return Math.round(value * 20);
    case "tomatoes":
    case "metacritic":
    case "trakt":
      // Already on 0-100 scale
      return Math.round(value);
    default:
      return null;
  }
}

// --- API Client ---

const MDBLIST_API_BASE = "https://api.mdblist.com";

/**
 * Fetches score data from MDbList for a given title.
 * Prefers IMDb ID lookup for accuracy; falls back to TMDB ID.
 *
 * @param apiKey - MDbList API key
 * @param tmdbId - TMDB title ID
 * @param imdbId - IMDb ID (e.g., "tt1234567") if known — preferred for accuracy
 * @param mediaType - "movie" or "tv" (needed for TMDB ID lookups to disambiguate)
 * @returns Parsed API response or null if the request fails
 */
export async function fetchMDbListScores(
  apiKey: string,
  tmdbId: number,
  imdbId?: string | null,
  mediaType?: "movie" | "tv"
): Promise<MDbListResponse | null> {
  let url: string;

  if (imdbId) {
    // IMDb ID lookup is more accurate — see CLAUDE.md
    url = `${MDBLIST_API_BASE}/?apikey=${apiKey}&i=${imdbId}`;
  } else {
    // Fall back to TMDB ID
    url = `${MDBLIST_API_BASE}/?apikey=${apiKey}&tm=${tmdbId}`;
    if (mediaType) {
      // Append media type to disambiguate movies vs TV shows with same TMDB ID
      url += `&m=${mediaType === "movie" ? "movie" : "show"}`;
    }
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `MDbList API error: ${response.status} ${response.statusText} for tmdbId=${tmdbId}`
      );
      return null;
    }

    const data = (await response.json()) as MDbListResponse;
    return data;
  } catch (error) {
    console.error(`MDbList API fetch failed for tmdbId=${tmdbId}:`, error);
    return null;
  }
}

/**
 * Parses MDbList ratings into normalized scores, filtering to only
 * the 6 audience sources we care about.
 *
 * @param ratings - Raw ratings array from MDbList API response
 * @returns Array of normalized scores (only sources with valid data)
 */
export function parseRatings(ratings: MDbListRating[]): NormalizedScore[] {
  const normalized: NormalizedScore[] = [];

  for (const rating of ratings) {
    // Only process our 6 audience sources
    if (!AUDIENCE_SOURCES.includes(rating.source as AudienceSource)) {
      continue;
    }

    const score = normalizeScore(rating.value, rating.source);

    // Skip sources with no data (raw value was 0)
    if (score === null) continue;

    normalized.push({
      source: rating.source as AudienceSource,
      rawValue: rating.value,
      normalizedScore: score,
      votes: rating.votes,
    });
  }

  return normalized;
}

// --- Cached Score Fetching ---

/**
 * Gets score data for a title, using KV cache when available.
 * If cached data exists and hasn't expired, returns it.
 * Otherwise fetches fresh data from MDbList, caches it, and returns it.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - MDbList API key
 * @param tmdbId - TMDB title ID
 * @param releaseDate - ISO date string for cache TTL calculation
 * @param imdbId - IMDb ID if known (preferred for MDbList lookup accuracy)
 * @param mediaType - "movie" or "tv"
 * @param bypassCache - If true, skip cache and fetch fresh (used for manual refresh)
 * @returns Cached score data or null if fetching failed
 */
export async function getScores(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  releaseDate: string | null,
  imdbId?: string | null,
  mediaType?: "movie" | "tv",
  bypassCache = false
): Promise<CachedScoreData | null> {
  const cacheKey = scoresCacheKey(tmdbId);

  // Check cache first (unless bypassing for manual refresh)
  if (!bypassCache) {
    const cached = await kvGet<CachedScoreData>(kv, cacheKey);
    if (cached) return cached;
  }

  // Fetch fresh data from MDbList
  const response = await fetchMDbListScores(apiKey, tmdbId, imdbId, mediaType);
  if (!response) return null;

  // Parse and normalize the ratings
  const scores = parseRatings(response.ratings);

  // Extract IMDb ID from response if we didn't have it
  // MDbList provides IMDb ID in its response body — see CLAUDE.md
  const resolvedImdbId = imdbId || response.ids?.imdb || null;

  const scoreData: CachedScoreData = {
    tmdbId,
    imdbId: resolvedImdbId,
    scores,
    sourceCount: scores.length,
    fetchedAt: new Date().toISOString(),
  };

  // Cache the result with appropriate TTL
  const ttl = getCacheTtl(releaseDate);
  await kvPut(kv, cacheKey, scoreData, ttl);

  return scoreData;
}
