/**
 * TMDB media extras: watch providers, logos, videos/trailers, content ratings.
 */

import { tmdbFetch } from "./client";
import type {
  TmdbLogo,
  TmdbVideo,
  TmdbWatchProviders,
} from "./types";

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

  // We only care about US availability — see docs/PRD.md
  return response.results["US"] ?? null;
}

// --- Title Logos ---

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
  return logos.length > 0 ? logos[0]! : null;
}

// --- Videos (Trailers) ---

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
