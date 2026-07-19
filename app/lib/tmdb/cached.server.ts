/**
 * KV-cached wrappers around the TMDB fetchers.
 * Server-only (touches the SCORE_CACHE KV binding). NOT re-exported from the
 * barrel index — import directly as `~/lib/tmdb/cached.server`.
 */

import { kvGet, kvPut, getCacheTtl } from "../cache.server";
import { getTitleDetails, getCredits, getSeasonDetails } from "./details";
import {
  getWatchProviders,
  getLogos,
  getVideos,
  getContentRating,
} from "./media";
import type {
  TmdbCredits,
  TmdbLogo,
  TmdbSeasonDetail,
  TmdbTitle,
  TmdbVideo,
  TmdbWatchProviders,
} from "./types";

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const THREE_DAYS = 3 * 24 * 60 * 60;

/**
 * Gets title details with KV caching.
 * TTL follows the release-recency tiers (24h/3d/7d) since details of
 * just-released titles (runtime, poster) still settle.
 */
export async function getCachedTitleDetails(
  kv: KVNamespace,
  apiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbTitle | null> {
  const cacheKey = `tmdb:title:${tmdbId}`;

  const cached = await kvGet<TmdbTitle>(kv, cacheKey);
  if (cached) return cached;

  const title = await getTitleDetails(apiKey, tmdbId, mediaType);
  if (!title) return null;

  await kvPut(kv, cacheKey, title, getCacheTtl(title.releaseDate));
  return title;
}

/** Gets credits with KV caching. Credits rarely change — 7-day TTL. */
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

  await kvPut(kv, cacheKey, credits, SEVEN_DAYS);
  return credits;
}

/**
 * Gets watch providers with KV caching.
 * Streaming availability changes occasionally — 3-day TTL.
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

  await kvPut(kv, cacheKey, providers, THREE_DAYS);
  return providers;
}

/**
 * Gets season details with KV caching.
 * Episode data rarely changes for aired seasons — 7-day TTL.
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

  await kvPut(kv, cacheKey, season, SEVEN_DAYS);
  return season;
}

/** Gets title logos with KV caching. Logos rarely change — 7-day TTL. */
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

  await kvPut(kv, cacheKey, logos, SEVEN_DAYS);
  return logos;
}

/** Gets videos with KV caching. Trailers rarely change — 7-day TTL. */
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

  await kvPut(kv, cacheKey, videos, SEVEN_DAYS);
  return videos;
}

/** Gets content rating with KV caching. Ratings never change — 7-day TTL. */
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

  await kvPut(kv, cacheKey, rating, SEVEN_DAYS);
  return rating;
}
