/**
 * TMDB API types.
 * Bottom of the tmdb module dependency graph — no imports, ever.
 */

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

/**
 * A feed item from Discover/Trending endpoints. (The name is historical —
 * Discover results are normalized into this same shape with media_type added.)
 */
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

/** A video (trailer, teaser, clip, etc.) from TMDB */
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
