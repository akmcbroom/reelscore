/**
 * TMDB API client core: fetch helper, image URLs, and pure display helpers.
 * Depends only on types.ts — keep it at the bottom of the dependency graph.
 *
 * NOT used for scores — all scores come from MDbList.
 * See docs/ARCHITECTURE.md "External API notes".
 *
 * API docs: https://developer.themoviedb.org/reference
 */

import type { TmdbSearchResult, TmdbTrendingItem } from "./types";

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

/**
 * Makes an authenticated request to the TMDB API.
 * TMDB uses query parameter auth with `api_key`.
 *
 * @param apiKey - TMDB API key
 * @param path - API path (e.g., "/movie/123")
 * @param params - Additional query parameters
 * @returns Parsed JSON response or null on failure
 */
export async function tmdbFetch<T>(
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

/**
 * Returns the display title from a search/feed result.
 * Movies use "title", TV shows use "name".
 */
export function getDisplayTitle(
  item: TmdbSearchResult | TmdbTrendingItem
): string {
  return item.title ?? item.name ?? "Unknown Title";
}

/**
 * Returns the release date from a search/feed result.
 * Movies use "release_date", TV shows use "first_air_date".
 */
export function getReleaseDate(
  item: TmdbSearchResult | TmdbTrendingItem
): string | undefined {
  return item.release_date ?? item.first_air_date;
}
