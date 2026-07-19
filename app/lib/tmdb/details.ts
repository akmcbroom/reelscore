/**
 * TMDB title details, credits, and season/episode fetching.
 */

import { tmdbFetch } from "./client";
import type {
  TmdbCastMember,
  TmdbCredits,
  TmdbCrewMember,
  TmdbMovieDetails,
  TmdbSeasonDetail,
  TmdbTitle,
  TmdbTvDetails,
} from "./types";

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
