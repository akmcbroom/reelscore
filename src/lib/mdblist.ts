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
  "popcorn",
  "metacriticuser",
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
 * Normalizes a raw `value` field to the 0-100 scale based on its source.
 * This is a fallback — `parseRatings()` prefers MDbList's pre-normalized
 * `score` field. See that function's JSDoc for details.
 *
 * Different sources use different scales for the `value` field:
 * - IMDb: 0-10 (multiply by 10)
 * - Rotten Tomatoes Audience (popcorn): 0-100 (already normalized)
 * - Metacritic User (metacriticuser): 0-10 (multiply by 10)
 * - Letterboxd: 0-5 (multiply by 20)
 * - Trakt: 0-100 (already normalized, comes as percentage)
 * - TMDB: 0-100 (already normalized — NOT 0-10 like TMDB's own API)
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
    case "metacriticuser":
      // 0-10 scale → multiply by 10
      return Math.round(value * 10);
    case "letterboxd":
      // 0-5 scale → multiply by 20
      return Math.round(value * 20);
    case "popcorn":
    case "tmdb":
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
 * Uses path-based routing: /tmdb/movie/{id} or /imdb/movie/{id}
 * Prefers IMDb ID lookup for accuracy; falls back to TMDB ID.
 *
 * @param apiKey - MDbList API key
 * @param tmdbId - TMDB title ID
 * @param imdbId - IMDb ID (e.g., "tt1234567") if known — preferred for accuracy
 * @param mediaType - "movie" or "tv" (needed to build the correct API path)
 * @returns Parsed API response or null if the request fails
 */
export async function fetchMDbListScores(
  apiKey: string,
  tmdbId: number,
  imdbId?: string | null,
  mediaType?: "movie" | "tv"
): Promise<MDbListResponse | null> {
  // MDbList uses "show" not "tv" in its path
  const mdbMediaType = mediaType === "tv" ? "show" : "movie";
  let url: string;

  if (imdbId) {
    // IMDb ID lookup is more accurate — see CLAUDE.md
    url = `${MDBLIST_API_BASE}/imdb/${mdbMediaType}/${imdbId}?apikey=${apiKey}`;
  } else {
    // Fall back to TMDB ID
    url = `${MDBLIST_API_BASE}/tmdb/${mdbMediaType}/${tmdbId}?apikey=${apiKey}`;
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
 * Uses MDbList's pre-normalized `score` field (0-100) rather than
 * manually normalizing `value`, because MDbList already handles
 * the different source scales correctly. Falls back to our own
 * `normalizeScore()` if the `score` field is missing.
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

    // Prefer MDbList's pre-normalized score (0-100), fall back to manual normalization
    const score = rating.score ?? normalizeScore(rating.value, rating.source);

    // Skip sources with no data (raw value was 0 or score is null/0)
    if (score === null || score === 0) continue;

    normalized.push({
      source: rating.source as AudienceSource,
      rawValue: rating.value,
      normalizedScore: Math.round(score),
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

  // Guard: MDbList may return responses without a ratings array
  // (e.g., error objects, titles not found, or unexpected shapes)
  if (!response.ratings || !Array.isArray(response.ratings)) return null;

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

// --- Batched Score Fetching ---

/**
 * Fetches scores for multiple titles, using KV cache first.
 * Reads all caches in parallel (fast), then only fetches uncached
 * titles from MDbList in rate-limited batches (slow but necessary).
 *
 * @param kv - Cloudflare KV namespace binding
 * @param apiKey - MDbList API key
 * @param titles - Array of title info to fetch scores for
 * @param batchSize - Number of concurrent API requests per batch (default: 4)
 * @param delayMs - Delay between API batches in milliseconds (default: 250)
 * @returns Array of scores in the same order as input titles
 */
export async function getScoresBatched(
  kv: KVNamespace,
  apiKey: string,
  titles: Array<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    releaseDate: string | null;
    imdbId?: string | null;
  }>,
  batchSize = 4,
  delayMs = 250
): Promise<(CachedScoreData | null)[]> {
  // Step 1: Read all KV caches in parallel (fast — no API calls)
  const cacheKeys = titles.map((t) => scoresCacheKey(t.tmdbId));
  const cached = await Promise.all(
    cacheKeys.map((key) => kvGet<CachedScoreData>(kv, key))
  );

  const results: (CachedScoreData | null)[] = [...cached];

  // Step 2: Identify uncached titles that need API fetches
  const uncachedIndices: number[] = [];
  for (let i = 0; i < titles.length; i++) {
    if (!cached[i]) uncachedIndices.push(i);
  }

  // Step 3: Fetch uncached titles from MDbList in rate-limited batches
  for (let i = 0; i < uncachedIndices.length; i += batchSize) {
    const batchIndices = uncachedIndices.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batchIndices.map((idx) => {
        const t = titles[idx]!;
        return getScores(kv, apiKey, t.tmdbId, t.releaseDate, t.imdbId, t.mediaType);
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      results[batchIndices[j]!] = batchResults[j] ?? null;
    }

    // Delay between API batches (skip delay after last batch)
    if (i + batchSize < uncachedIndices.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
