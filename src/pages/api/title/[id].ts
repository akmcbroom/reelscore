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
  getCachedLogos,
  getBestLogo,
  getImageUrl,
  type TmdbTitle,
  type TmdbCastMember,
  type TmdbCrewMember,
  type TmdbWatchProvider,
  type TmdbVideo,
  type TmdbLogo,
  type TmdbSeason,
} from "../../../lib/tmdb.ts";
import { getScores } from "../../../lib/mdblist.ts";
import { calculateReelScore, getSourceLabel } from "../../../lib/scoring.ts";
import type { AudienceSource, NormalizedScore } from "../../../lib/mdblist.ts";

// --- HTML Rendering Helpers ---

/** Score tier colors — shared between the score lip and backdrop border. */
type ScoreTier = { from: string; to: string; fromClass: string; toClass: string; borderClass: string; textColor: string };
const SCORE_TIERS: Record<string, ScoreTier> = {
  green: { from: "#22c55e", to: "#166534", fromClass: "from-green-500", toClass: "to-green-800", borderClass: "border-green-800", textColor: "text-white/90" },
  gold:  { from: "#f59e0b", to: "#92400e", fromClass: "from-amber-500", toClass: "to-amber-800", borderClass: "border-amber-800", textColor: "text-white/90" },
  red:   { from: "#ef4444", to: "#991b1b", fromClass: "from-red-500",   toClass: "to-red-800",   borderClass: "border-red-800",   textColor: "text-white/90" },
  none:  { from: "#525252", to: "#262626", fromClass: "from-neutral-600", toClass: "to-neutral-800", borderClass: "border-neutral-800", textColor: "text-white/60" },
};

function getScoreTier(score: number | null, isUnreleased: boolean): ScoreTier {
  if (isUnreleased || score === null) return SCORE_TIERS.none;
  if (score >= 70) return SCORE_TIERS.green;
  if (score >= 60) return SCORE_TIERS.gold;
  return SCORE_TIERS.red;
}

/**
 * Renders the score lip HTML for the modal — gradient tab with concave SVG
 * curves on both sides. Larger than the card version (w-16 h-7, text-xl).
 * Mirrors TitleCard.astro score lip design.
 */
function renderScoreLip(
  score: number | null,
  isUnreleased: boolean,
  sources: NormalizedScore[],
  tmdbId: number
): string {
  const tier = getScoreTier(score, isUnreleased);

  let display: string;
  if (isUnreleased) {
    display = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  } else if (score !== null) {
    display = String(score);
  } else {
    display = "—";
  }

  let titleText = isUnreleased
    ? "Not yet released"
    : score !== null
      ? `ReelScore: ${score}`
      : "Not enough ratings";
  if (import.meta.env.DEV && sources.length > 0) {
    const breakdown = sources
      .map((s) => `${getSourceLabel(s.source as AudienceSource)}: ${s.normalizedScore}`)
      .join(" | ");
    titleText = score !== null
      ? `ReelScore: ${score} (${sources.length} sources)\n${breakdown}`
      : `Insufficient sources (${sources.length}/2)\n${breakdown}`;
  }

  const gradL = `grad-ml-${tmdbId}`;
  const gradR = `grad-mr-${tmdbId}`;

  return `
    <div class="flex items-end">
      <svg class="overflow-visible h-4" viewBox="0 0 16 16">
        <defs><linearGradient id="${gradL}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${tier.from}"/><stop offset="100%" stop-color="${tier.to}"/></linearGradient></defs>
        <path d="M16,0 Q16,16 0,16 L16,16 Z" fill="url(#${gradL})"/>
      </svg>
      <div class="flex items-center justify-center z-10 rounded-t-lg w-16 h-7 bg-gradient-to-b ${tier.fromClass} ${tier.toClass}" title="${titleText}">
        <span class="font-mono font-bold text-xl tabular-nums ${tier.textColor}">${display}</span>
      </div>
      <svg class="overflow-visible h-4" viewBox="0 0 16 16">
        <defs><linearGradient id="${gradR}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${tier.from}"/><stop offset="100%" stop-color="${tier.to}"/></linearGradient></defs>
        <path d="M0,0 Q0,16 16,16 L0,16 Z" fill="url(#${gradR})"/>
      </svg>
    </div>`;
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
 * Renders the full seasons section for TV shows as a horizontal season
 * pill selector with a lazy-loaded episode carousel below.
 *
 * Season pills scroll horizontally; clicking one loads that season's
 * episodes via HTMX into the carousel area below. Previously loaded
 * seasons are cached in Alpine state to avoid re-fetching.
 *
 * @param seasons - Array of season metadata from TMDB
 * @param tmdbId - TV show TMDB ID (needed for episode fetch URL)
 */
function renderSeasonsSection(seasons: TmdbSeason[], tmdbId: number, showTitle: string): string {
  // Filter out "Specials" (season 0)
  const filteredSeasons = seasons.filter((s) => s.season_number !== 0);
  if (filteredSeasons.length === 0) return "";

  const firstSeason = filteredSeasons[0].season_number;
  const encodedShowTitle = encodeURIComponent(showTitle);

  // Skeleton placeholders matching episode card layout — shown while HTMX fetches
  const skeletonCards = Array.from({ length: 4 }, () => `
    <div class="flex-shrink-0 w-40">
      <div class="skeleton aspect-video rounded-md"></div>
      <div class="skeleton h-3 w-16 mt-1.5 rounded"></div>
      <div class="skeleton h-3.5 w-32 mt-1 rounded"></div>
    </div>`).join("");

  // Season pill buttons — horizontal scroll
  const seasonPills = filteredSeasons.map((s) => `
    <button
      class="flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors"
      :class="selectedSeason === ${s.season_number} ? 'bg-white text-black' : 'bg-surface-600 text-white/60 hover:bg-surface-500 hover:text-white/80'"
      @click="if (selectedSeason !== ${s.season_number}) { selectedSeason = ${s.season_number}; if (!loadedSeasons.includes(${s.season_number})) { loadedSeasons.push(${s.season_number}); htmx.ajax('GET', '/api/season/${tmdbId}?season=${s.season_number}&show=${encodedShowTitle}', { target: '#season-episodes-${tmdbId}-${s.season_number}', swap: 'innerHTML' }); } }"
    >${s.season_number}</button>`).join("");

  // Episode containers — one per season, only the selected one is visible
  const episodeContainers = filteredSeasons.map((s) => `
    <div x-show="selectedSeason === ${s.season_number}" x-transition:enter="transition ease-out duration-150" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100">
      <div id="season-episodes-${tmdbId}-${s.season_number}">
        <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          ${skeletonCards}
        </div>
      </div>
    </div>`).join("");

  return `
    <div x-data="{ selectedSeason: ${firstSeason}, loadedSeasons: [${firstSeason}] }" x-init="htmx.ajax('GET', '/api/season/${tmdbId}?season=${firstSeason}&show=${encodedShowTitle}', { target: '#season-episodes-${tmdbId}-${firstSeason}', swap: 'innerHTML' })">
      <h3 class="text-sm font-semibold text-white/80 mb-2">Seasons</h3>
      <!-- Season pill slider -->
      <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        ${seasonPills}
      </div>
      <!-- Episode carousel area -->
      <div class="mt-2">
        ${episodeContainers}
      </div>
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
  const [title, credits, scoreData, contentRating, videos, watchProviders, logos] =
    await Promise.all([
      getTitleDetails(apiKey, tmdbId, mediaType),
      getCredits(apiKey, tmdbId, mediaType),
      getScores(kv, mdblistKey, tmdbId, null, null, mediaType),
      getCachedContentRating(kv, apiKey, tmdbId, mediaType),
      getCachedVideos(kv, apiKey, tmdbId, mediaType),
      getWatchProviders(apiKey, tmdbId, mediaType),
      getCachedLogos(kv, apiKey, tmdbId, mediaType),
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
  const logo = logos ? getBestLogo(logos) : null;
  const logoUrl = logo ? getImageUrl(logo.file_path, "logo", "original") : null;
  // Deduplicate streaming providers — TMDB returns variants like
  // "Paramount+", "Paramount+ Amazon Channel", "Paramount+ Apple TV Channel".
  // We strip known channel suffixes to find the base service name and keep
  // only the first occurrence (TMDB lists the primary/direct version first).
  // Capped at 6 to avoid cluttering the modal header.
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
    // Normalize "Plus" → "+" for consistent matching (e.g., "Paramount Plus" → "Paramount+")
    base = base.replace(/\s*\bPlus\b/gi, "+");
    // Strip known suffixes (channel variants, tier names)
    for (const suffix of PROVIDER_SUFFIXES) {
      if (base.endsWith(suffix)) {
        base = base.slice(0, -suffix.length);
        break;
      }
    }
    return base.trim();
  }

  const rawProviders = watchProviders?.flatrate ?? [];
  const seenProviders = new Set<string>();
  const streamingProviders = rawProviders.filter((p) => {
    const base = getBaseProviderName(p.provider_name);
    if (seenProviders.has(base)) return false;
    seenProviders.add(base);
    return true;
  }).slice(0, 6);

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
    <div class="modal-content flex flex-col flex-1 min-h-0" data-tmdb-id="${tmdbId}" data-media-type="${mediaType}">
      <!-- Sticky header — backdrop + title info, stays fixed while body scrolls -->
      <div class="relative flex-shrink-0">
        <!-- Backdrop image — no overflow-hidden so score lip can extend above -->
        <div class="relative h-full aspect-video">
          ${backdropUrl
            ? `<img src="${backdropUrl}" alt="" class="h-full w-full object-cover rounded-t-lg border-t-4 ${getScoreTier(score, isUnreleased).borderClass}" />`
            : `<div class="h-full w-full bg-surface-700 rounded-t-lg border-t-4 ${getScoreTier(score, isUnreleased).borderClass}"></div>`
          }
          <div class="absolute inset-0 bg-gradient-to-t from-surface-800 via-surface-800/60 to-transparent"></div>

          <!-- Close button — top left -->
          <button
            @click="$store.titleModal.close()"
            class="absolute top-3 left-3 z-20 rounded-full bg-black/50 p-1.5 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>

          <!-- Score lip — top right, pulled above modal edge with -mt-7 -->
          <div class="absolute top-0 right-4 z-20 -mt-7">
            ${renderScoreLip(score, isUnreleased, sources, tmdbId)}
          </div>

          <!-- Title info overlay on backdrop -->
          <div class="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
            <div class="max-w-md">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${title.title.replace(/"/g, "&quot;")}" class="min-h-10 max-h-14 w-auto max-w-56 object-left brightness-0 invert" />`
                : `<h2 class="text-xl sm:text-2xl font-bold text-white leading-tight">${title.title.replace(/</g, "&lt;")}</h2>`
              }
              <div class="mt-2 flex flex-wrap items-center gap-1 text-sm text-white/60">
                <span>${mediaType === "tv" ? "TV Show" : "Movie"}</span>
                ${year ? `<span>•</span><span>${year}</span>` : ""}
                ${mediaType === "movie" && runtimeDisplay ? `<span>•</span><span>${runtimeDisplay}</span>` : ""}
                ${contentRating ? `<span>•</span><span class="border border-white/60 rounded px-0.5 py-0.5 text-xs leading-none font-bold">${contentRating}</span>` : ""}
              </div>
              <!-- Genres — displayed under title metadata -->
              ${title.genres.length > 0 ? `
                <div class="mt-2 flex flex-wrap gap-1.5">
                  ${title.genres.map((g) => `<span class="badge-secondary bg-white/10 backdrop-blur">${g.name}</span>`).join("")}
                </div>
              ` : ""}
            <!-- Overview — clamped to 2 lines, click to read full -->
            ${title.overview ? `<p
              class="mt-2 text-sm text-white/70 leading-tight text-pretty line-clamp-2 cursor-pointer hover:text-white/90 transition-colors"
              @click="$store.titleModal.openOverview('${title.overview.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;")}')"
              title="Click to read full overview"
            >${title.overview.replace(/</g, "&lt;")}</p>` : ""}
            <!-- Trailer button + Streaming providers -->
            ${trailer || streamingProviders.length > 0 ? `<div class="mt-2.5 flex flex-wrap items-center gap-2">
              ${trailer ? `<button
                @click="$store.titleModal.trailerKey = '${trailer.key}'; $store.titleModal.showTrailer = true"
                class="btn gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="6 3 20 12 6 21 6 3"/>
                </svg>
                Watch Trailer
              </button>` : ""}
              ${streamingProviders.length > 0 ? `<div class="flex items-center gap-2">${streamingProviders.map(renderProvider).join("")}</div>` : ""}
            </div>` : ""}
            </div>
          </div>
        </div>
      </div>

      <!-- Scrollable body content -->
      <div class="flex-1 overflow-y-auto overscroll-contain min-h-0">
        <!-- Sticky top fade — stays at top of scroll area so content softly disappears under the header -->
        <div class="sticky top-0 left-0 right-0 h-8 bg-gradient-to-b from-surface-800 to-transparent z-10 pointer-events-none -mb-8"></div>
        <div class="px-4 sm:p-6 space-y-6">

        <!-- Director -->
        ${directors.length > 0 ? `
          <div>
            ${directors.map(renderDirector).join("")}
          </div>
        ` : ""}

        <!-- Seasons (TV only) — horizontal season pills + episode carousel -->
        ${mediaType === "tv" && title.seasons && title.seasons.length > 0
          ? renderSeasonsSection(title.seasons, tmdbId, title.title)
          : ""}

        <!-- Cast -->
        ${cast.length > 0 ? `
          <div>
            <h3 class="text-sm font-semibold text-white/80 mb-3">Cast</h3>
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              ${cast.map(renderCastCard).join("")}
            </div>
          </div>
        ` : ""}

        </div>
      </div>
    </div>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
