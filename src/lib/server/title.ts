/**
 * Title detail assembly for the modal — the JSON replacement for the old
 * HTMX HTML endpoint. Fetches details first (release date drives the score
 * TTL tier), then everything else in parallel through the KV-cached wrappers.
 */

import { getBestLogo, getBestTrailer, getDirectors, getTopCast } from "$lib/tmdb";
import {
  getCachedContentRating,
  getCachedCredits,
  getCachedLogos,
  getCachedSeasonDetails,
  getCachedTitleDetails,
  getCachedVideos,
  getCachedWatchProviders,
} from "./tmdb-cached";
import { calculateReelScore } from "$lib/scoring";
import { getScoresForTitle } from "./scores";
import type { Episode, SeasonResponse, TitleDetail } from "$lib/schemas";

/**
 * Streaming provider dedup: TMDB returns variants like "Paramount+",
 * "Paramount+ Amazon Channel", "Paramount+ Apple TV Channel". Strip known
 * channel/tier suffixes to find the base service and keep only the first
 * occurrence (TMDB lists the primary/direct version first). See docs/PRD.md §4.
 */
const PROVIDER_SUFFIXES = [
  " Amazon Channel",
  " Apple TV Channel",
  " Roku Premium Channel",
  " with Ads",
  " Premium",
  " Essential",
  " Basic",
];

function getBaseProviderName(name: string): string {
  // Trim whitespace — TMDB sometimes has trailing spaces in provider names
  let base = name.trim();
  // Normalize "Plus" → "+" for consistent matching ("Paramount Plus" → "Paramount+")
  base = base.replace(/\s*\bPlus\b/gi, "+");
  for (const suffix of PROVIDER_SUFFIXES) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base.trim();
}

/**
 * Builds the full TitleDetail payload for GET /api/title/:id.
 * Returns null when the title doesn't exist on TMDB.
 */
export async function getTitleDetailPayload(
  d1: D1Database,
  kv: KVNamespace,
  tmdbApiKey: string,
  mdblistApiKey: string,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TitleDetail | null> {
  // Stage 1: details first — releaseDate drives the score cache TTL tier.
  const title = await getCachedTitleDetails(kv, tmdbApiKey, tmdbId, mediaType);
  if (!title) return null;

  // Stage 2: everything else in parallel (each KV-cached).
  const [credits, scoreData, contentRating, videos, providers, logos] =
    await Promise.all([
      getCachedCredits(kv, tmdbApiKey, tmdbId, mediaType),
      getScoresForTitle(d1, mdblistApiKey, {
        tmdbId,
        mediaType,
        releaseDate: title.releaseDate || null,
        imdbId: title.imdbId,
      }),
      getCachedContentRating(kv, tmdbApiKey, tmdbId, mediaType),
      getCachedVideos(kv, tmdbApiKey, tmdbId, mediaType),
      getCachedWatchProviders(kv, tmdbApiKey, tmdbId, mediaType),
      getCachedLogos(kv, tmdbApiKey, tmdbId, mediaType),
    ]);

  const result = scoreData ? calculateReelScore(scoreData.scores) : null;
  const trailer = videos ? getBestTrailer(videos) : null;
  const logo = logos ? getBestLogo(logos) : null;

  const seenProviders = new Set<string>();
  const dedupedProviders = (providers?.flatrate ?? [])
    .filter((p) => {
      const base = getBaseProviderName(p.provider_name);
      if (seenProviders.has(base)) return false;
      seenProviders.add(base);
      return true;
    })
    .slice(0, 6);

  return {
    tmdbId: title.tmdbId,
    mediaType,
    title: title.title,
    overview: title.overview,
    releaseDate: title.releaseDate || null,
    runtime: title.runtime,
    genres: title.genres,
    posterPath: title.posterPath,
    backdropPath: title.backdropPath,
    logoPath: logo?.file_path ?? null,
    contentRating,
    trailerKey: trailer?.key ?? null,
    score: result?.score ?? null,
    sourceCount: scoreData?.sourceCount ?? 0,
    ...(import.meta.env.DEV && result?.breakdown
      ? { breakdown: result.breakdown }
      : {}),
    directors: (credits ? getDirectors(credits) : []).map((d) => ({
      id: d.id,
      name: d.name,
      profilePath: d.profile_path,
    })),
    cast: (credits ? getTopCast(credits, 10) : []).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
    })),
    providers: dedupedProviders.map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logoPath: p.logo_path,
    })),
    // Filter out "Specials" (season 0)
    seasons: (title.seasons ?? [])
      .filter((s) => s.season_number !== 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
      })),
  };
}

/** Builds the episode list for GET /api/season/:id. */
export async function getSeasonPayload(
  kv: KVNamespace,
  tmdbApiKey: string,
  tvId: number,
  seasonNumber: number
): Promise<SeasonResponse | null> {
  const season = await getCachedSeasonDetails(kv, tmdbApiKey, tvId, seasonNumber);
  if (!season) return null;

  const episodes: Episode[] = season.episodes.map((e) => ({
    id: e.id,
    name: e.name,
    overview: e.overview,
    episodeNumber: e.episode_number,
    seasonNumber: e.season_number,
    stillPath: e.still_path,
    airDate: e.air_date,
    runtime: e.runtime,
  }));

  return { episodes };
}
