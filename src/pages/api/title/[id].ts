/**
 * Title detail API endpoint — serves HTMX HTML partial for the title modal.
 *
 * Route: GET /api/title/:id?type=movie|tv
 *
 * Fetches all data in parallel:
 *   - Title details (metadata, genres, seasons)
 *   - Credits (cast, crew/director)
 *   - Scores (MDbList via KV cache)
 *   - Content rating (MPAA / TV rating)
 *   - Videos (trailers)
 *   - Watch providers (streaming availability)
 *
 * Returns an HTML fragment for HTMX to swap into the modal dialog.
 * See CLAUDE.md Title Modal.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getTitleDetails,
  getCredits,
  getDirectors,
  getTopCast,
  getWatchProviders,
  getCachedVideos,
  getCachedContentRating,
  getBestTrailer,
  getImageUrl,
  type TmdbTitle,
  type TmdbCastMember,
  type TmdbCrewMember,
  type TmdbWatchProvider,
  type TmdbVideo,
  type TmdbSeason,
} from "../../../lib/tmdb.ts";
import { getScores } from "../../../lib/mdblist.ts";
import { calculateReelScore, getSourceLabel } from "../../../lib/scoring.ts";
import type { AudienceSource, NormalizedScore } from "../../../lib/mdblist.ts";

// --- HTML Rendering Helpers ---

/**
 * Renders the score badge HTML — same logic as ScoreBadge.astro and feed.ts
 * but as a raw string for the API endpoint.
 */
function renderScoreBadge(
  score: number | null,
  isUnreleased: boolean,
  sources: NormalizedScore[]
): string {
  let colorClass = "bg-black/40 text-white/60";
  let display: string;
  let titleText: string;

  if (isUnreleased) {
    display = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    titleText = "Not yet released";
  } else if (score !== null) {
    display = String(score);
    if (score >= 70) colorClass = "bg-score-green text-black";
    else if (score >= 60) colorClass = "bg-score-gold text-black";
    else colorClass = "bg-score-red text-white";
    titleText = `ReelScore: ${score}`;
  } else {
    display = "—";
    titleText = "Not enough ratings";
  }

  // Dev-only source breakdown tooltip
  if (import.meta.env.DEV && sources.length > 0) {
    const breakdown = sources
      .map((s) => `${getSourceLabel(s.source as AudienceSource)}: ${s.normalizedScore}`)
      .join(" | ");
    titleText = score !== null
      ? `ReelScore: ${score} (${sources.length} sources)\n${breakdown}`
      : `Insufficient sources (${sources.length}/2)\n${breakdown}`;
  }

  return `<span class="inline-flex items-center justify-center rounded-full font-bold tabular-nums text-base w-11 h-11 ${colorClass}" title="${titleText}">${display}</span>`;
}

/**
 * Renders a single cast member card with profile photo and character name.
 */
function renderCastCard(member: TmdbCastMember): string {
  const photoUrl = getImageUrl(member.profile_path, "profile", "medium");
  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" alt="${member.name.replace(/"/g, "&quot;")}" class="h-full w-full object-cover" loading="lazy" />`
    : `<div class="flex h-full w-full items-center justify-center bg-surface-700 text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>`;

  return `
    <div class="flex-shrink-0 w-20 text-center">
      <div class="w-20 h-20 rounded-full overflow-hidden mx-auto">
        ${photoHtml}
      </div>
      <p class="mt-1.5 text-xs font-medium text-white truncate">${member.name.replace(/</g, "&lt;")}</p>
      <p class="text-[10px] text-white/50 truncate">${member.character.replace(/</g, "&lt;")}</p>
    </div>`;
}

/**
 * Renders the director section with profile photo.
 */
function renderDirector(director: TmdbCrewMember): string {
  const photoUrl = getImageUrl(director.profile_path, "profile", "medium");
  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" alt="${director.name.replace(/"/g, "&quot;")}" class="h-full w-full object-cover" loading="lazy" />`
    : `<div class="flex h-full w-full items-center justify-center bg-surface-700 text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>`;

  return `
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
        ${photoHtml}
      </div>
      <div>
        <p class="text-xs text-white/50">Director</p>
        <p class="text-sm font-medium text-white">${director.name.replace(/</g, "&lt;")}</p>
      </div>
    </div>`;
}

/**
 * Renders a streaming provider logo.
 */
function renderProvider(provider: TmdbWatchProvider): string {
  const logoUrl = getImageUrl(provider.logo_path, "logo", "small");
  if (!logoUrl) return "";
  return `<img src="${logoUrl}" alt="${provider.provider_name.replace(/"/g, "&quot;")}" title="${provider.provider_name.replace(/"/g, "&quot;")}" class="w-8 h-8 rounded-md" loading="lazy" />`;
}

/**
 * Renders a season row for TV shows.
 */
function renderSeason(season: TmdbSeason): string {
  // Skip "Specials" (season 0) to keep the list clean
  if (season.season_number === 0) return "";

  const year = season.air_date ? new Date(season.air_date).getFullYear() : "";
  return `
    <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div>
        <span class="text-sm font-medium text-white">${season.name.replace(/</g, "&lt;")}</span>
        ${year ? `<span class="ml-2 text-xs text-white/40">${year}</span>` : ""}
      </div>
      <span class="text-xs text-white/50">${season.episode_count} episodes</span>
    </div>`;
}

// --- Main Handler ---

export const GET: APIRoute = async ({ params, request }) => {
  const tmdbId = parseInt(params.id ?? "", 10);
  if (isNaN(tmdbId)) {
    return new Response("Invalid title ID", { status: 400 });
  }

  const url = new URL(request.url);
  const mediaType = (url.searchParams.get("type") ?? "movie") as "movie" | "tv";

  const apiKey = env.TMDB_API_KEY;
  const mdblistKey = env.MDBLIST_API_KEY;
  const kv = env.SCORE_CACHE;

  // Fetch all data in parallel — this is the key performance optimization.
  // Each call hits KV cache first, only going to the API on cache miss.
  const [title, credits, scoreData, contentRating, videos, watchProviders] =
    await Promise.all([
      getTitleDetails(apiKey, tmdbId, mediaType),
      getCredits(apiKey, tmdbId, mediaType),
      getScores(kv, mdblistKey, tmdbId, null, null, mediaType),
      getCachedContentRating(kv, apiKey, tmdbId, mediaType),
      getCachedVideos(kv, apiKey, tmdbId, mediaType),
      getWatchProviders(apiKey, tmdbId, mediaType),
    ]);

  if (!title) {
    return new Response(
      `<div class="p-8 text-center text-white/50">Title not found.</div>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 404 }
    );
  }

  // --- Process fetched data ---

  const result = scoreData ? calculateReelScore(scoreData.scores) : null;
  const score = result?.score ?? null;
  const sources = result?.sources ?? [];
  const isUnreleased = title.releaseDate
    ? new Date(title.releaseDate) > new Date()
    : false;

  const directors = credits ? getDirectors(credits) : [];
  const cast = credits ? getTopCast(credits, 10) : [];
  const trailer = videos ? getBestTrailer(videos) : null;
  const streamingProviders = watchProviders?.flatrate ?? [];

  const year = title.releaseDate
    ? new Date(title.releaseDate).getFullYear()
    : null;
  const typeBadge = mediaType === "tv" ? "TV" : "Movie";

  // Format runtime: movies show "Xhr Ym", TV shows show "Xm per episode"
  let runtimeDisplay = "";
  if (title.runtime) {
    if (mediaType === "movie") {
      const hrs = Math.floor(title.runtime / 60);
      const mins = title.runtime % 60;
      runtimeDisplay = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    } else {
      runtimeDisplay = `${title.runtime}m per episode`;
    }
  }

  // Backdrop image for the modal header
  const backdropUrl = getImageUrl(title.backdropPath, "backdrop", "large");
  const posterUrl = getImageUrl(title.posterPath, "poster", "medium");

  // --- Render HTML ---

  const html = `
    <div class="modal-content" data-tmdb-id="${tmdbId}" data-media-type="${mediaType}">
      <!-- Backdrop header -->
      <div class="relative h-48 sm:h-56 md:h-64 overflow-hidden rounded-t-lg">
        ${backdropUrl
          ? `<img src="${backdropUrl}" alt="" class="h-full w-full object-cover" />`
          : `<div class="h-full w-full bg-surface-700"></div>`
        }
        <div class="absolute inset-0 bg-gradient-to-t from-surface-800 via-surface-800/60 to-transparent"></div>

        <!-- Close button -->
        <button
          @click="$store.titleModal.close()"
          class="absolute top-3 right-3 z-20 rounded-full bg-black/50 p-1.5 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>

        <!-- Title info overlay on backdrop -->
        <div class="absolute bottom-0 left-0 right-0 p-4 sm:p-6 flex items-end gap-4">
          ${posterUrl
            ? `<img src="${posterUrl}" alt="${title.title.replace(/"/g, "&quot;")}" class="hidden sm:block w-24 rounded-lg shadow-lg flex-shrink-0" />`
            : ""
          }
          <div class="flex-1 min-w-0">
            <h2 class="text-xl sm:text-2xl font-bold text-white leading-tight">${title.title.replace(/</g, "&lt;")}</h2>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-white/60">
              <span class="badge badge-secondary text-[10px] px-1.5 py-0">${typeBadge}</span>
              ${year ? `<span>${year}</span>` : ""}
              ${contentRating ? `<span class="border border-white/20 rounded px-1.5 py-0 text-xs">${contentRating}</span>` : ""}
              ${runtimeDisplay ? `<span>${runtimeDisplay}</span>` : ""}
            </div>
          </div>
          <div class="flex-shrink-0">
            ${renderScoreBadge(score, isUnreleased, sources)}
          </div>
        </div>
      </div>

      <!-- Body content -->
      <div class="p-4 sm:p-6 space-y-6">

        <!-- Genres -->
        ${title.genres.length > 0 ? `
          <div class="flex flex-wrap gap-2">
            ${title.genres.map((g) => `<span class="badge badge-secondary text-xs">${g.name}</span>`).join("")}
          </div>
        ` : ""}

        <!-- Overview -->
        ${title.overview ? `
          <p class="text-sm text-white/70 leading-relaxed">${title.overview.replace(/</g, "&lt;")}</p>
        ` : ""}

        <!-- Director -->
        ${directors.length > 0 ? `
          <div>
            ${directors.map(renderDirector).join("")}
          </div>
        ` : ""}

        <!-- Cast -->
        ${cast.length > 0 ? `
          <div>
            <h3 class="text-sm font-semibold text-white/80 mb-3">Cast</h3>
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              ${cast.map(renderCastCard).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Seasons (TV only) -->
        ${mediaType === "tv" && title.seasons && title.seasons.length > 0 ? `
          <div>
            <h3 class="text-sm font-semibold text-white/80 mb-2">Seasons</h3>
            <div class="rounded-lg bg-surface-700/50 px-3">
              ${title.seasons.map(renderSeason).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Trailer button -->
        ${trailer ? `
          <button
            @click="$store.titleModal.trailerKey = '${trailer.key}'; $store.titleModal.showTrailer = true"
            class="btn btn-secondary w-full gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            Watch Trailer
          </button>
        ` : ""}

        <!-- Streaming providers -->
        ${streamingProviders.length > 0 ? `
          <div>
            <h3 class="text-sm font-semibold text-white/80 mb-2">Stream On</h3>
            <div class="flex flex-wrap gap-2">
              ${streamingProviders.map(renderProvider).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    </div>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
