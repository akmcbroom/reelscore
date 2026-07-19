/**
 * MDbList API client: types, normalization, and the raw fetch.
 * MDbList is the sole source for all 6 audience score data.
 * We do NOT hit TMDB for scores — see docs/PRD.md §1 Score engine.
 *
 * Cached score reads/writes live in scores.server.ts (D1) — this module is
 * pure fetch + parse so it stays trivially unit-testable.
 *
 * API docs: https://mdblist.docs.apiary.io
 */

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
 * Note: "tomatoesaudience" is the MDbList key for the RT Audience Score (was "popcorn" in older API versions).
 */
export const AUDIENCE_SOURCES = [
  "imdb",
  "tomatoesaudience",
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

/**
 * Full mathematical breakdown of a ReelScore calculation.
 * Stored in the D1 `scores` table so the dev tooltip can display it without
 * recalculating. See docs/PRD.md §1 Score display (dev-mode transparency).
 */
export interface ScoreBreakdown {
  /** Per-source contribution details */
  sources: Array<{
    source: AudienceSource;
    normalizedScore: number;
    baseWeight: number;
    voteFactor: number;
    effectiveWeight: number;
    votes: number;
  }>;
  /** Weighted average before reliability adjustment */
  weightedAverage: number;
  /** Reliability adjustment applied (-3 to +3) */
  reliabilityAdjustment: number;
  /** Final clamped Base ReelScore */
  baseReelScore: number;
}

/** Cached score data (one row in the D1 `scores` table) */
export interface CachedScoreData {
  tmdbId: number;
  imdbId: string | null;
  scores: NormalizedScore[];
  sourceCount: number;
  fetchedAt: string;
  /**
   * Full calculation breakdown for dev tooltip display.
   * Populated by calculateReelScore() and stored here so future reads
   * don't need to recalculate — see CLAUDE.md Score Transparency.
   */
  breakdown?: ScoreBreakdown;
}

// --- Normalization ---

/**
 * Normalizes a raw `value` field to the 0-100 scale based on its source.
 * This is a fallback — `parseRatings()` prefers MDbList's pre-normalized
 * `score` field. See that function's JSDoc for details.
 *
 * Different sources use different scales for the `value` field:
 * - IMDb: 0-10 (multiply by 10)
 * - Rotten Tomatoes Audience (tomatoesaudience): 0-100 (already normalized)
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
    case "tomatoesaudience":
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

    // Handle rate limiting — wait and retry once if we get a 429.
    // MDbList returns Retry-After header (seconds) or X-RateLimit-Reset (timestamp).
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
      console.warn(`MDbList rate limited for tmdbId=${tmdbId}, retrying in ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      const retryResponse = await fetch(url);
      if (!retryResponse.ok) {
        console.error(`MDbList retry failed: ${retryResponse.status} for tmdbId=${tmdbId}`);
        return null;
      }
      return (await retryResponse.json()) as MDbListResponse;
    }

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
