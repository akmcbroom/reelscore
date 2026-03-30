/**
 * Feed API endpoint — serves HTMX HTML partials for the unified discovery feed.
 *
 * Query params:
 *   type: "movie" | "tv" | "all" (default: "all")
 *   page: page number (default: 1)
 *   exclude: comma-separated TMDB IDs to filter out (accumulated across all previous pages)
 *
 * Uses the same 6-source blended approach as index.astro (page 1).
 * Pagination is lockstep for "all" type: feed page N = TMDB source page N.
 * For "movie" type: 4 movie sources, 1 page each.
 * For "tv" type: 2 TV sources, 3 pages each (to reach ~120 items).
 * Each feed page serves exactly 60 items — the LCM of all grid column
 * counts (2,3,4,5,6) — so every row is always full at every breakpoint.
 * The exclude param filters out page 1 TMDB IDs for cross-dedup.
 *
 * Returns HTML fragments (TitleCard markup) for HTMX to swap into the page.
 * See CLAUDE.md Discovery Feed.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getPopularMovies,
  getNowPlayingMovies,
  getTopRatedMovies,
  getUpcomingMovies,
  getPopularTV,
  getTopRatedTV,
  blendAndDedup,
  getDisplayTitle,
  getReleaseDate,
  getImageUrl,
  type TmdbTrendingItem,
} from "../../lib/tmdb.ts";
import { getScoresBatched } from "../../lib/mdblist.ts";
import { calculateReelScore, getSourceLabel } from "../../lib/scoring.ts";
import type { AudienceSource } from "../../lib/mdblist.ts";

/**
 * Renders a single TitleCard as an HTML string.
 * Used by the feed endpoint to return HTMX partials without
 * needing to import Astro components (API routes return raw HTML).
 */
function renderTitleCard(item: {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  mediaType: "movie" | "tv";
  releaseDate: string | null;
  score: number | null;
  isUnreleased: boolean;
  sources: Array<{ source: string; normalizedScore: number }>;
}): string {
  const posterUrl = getImageUrl(item.posterPath, "poster", "medium");
  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : null;
  const typeBadgeText = item.mediaType === "tv" ? "TV Show" : "Movie";

  // Score lip gradient tiers — light (top) and dark (bottom) hex for SVG gradients,
  // plus Tailwind classes for the tab and poster border-top.
  type Tier = { from: string; to: string; fromClass: string; toClass: string; borderClass: string; textColor: string };
  const tiers: Record<string, Tier> = {
    green: { from: "#22c55e", to: "#166534", fromClass: "from-green-500", toClass: "to-green-800", borderClass: "border-green-800", textColor: "text-white/90" },
    gold:  { from: "#f59e0b", to: "#92400e", fromClass: "from-amber-500", toClass: "to-amber-800", borderClass: "border-amber-800", textColor: "text-white/90" },
    red:   { from: "#ef4444", to: "#991b1b", fromClass: "from-red-500",   toClass: "to-red-800",   borderClass: "border-red-800",   textColor: "text-white/90" },
    none:  { from: "#525252", to: "#262626", fromClass: "from-neutral-600", toClass: "to-neutral-800", borderClass: "border-neutral-800", textColor: "text-white/60" },
  };

  let tier: Tier;
  if (item.isUnreleased || item.score === null) tier = tiers.none;
  else if (item.score >= 70) tier = tiers.green;
  else if (item.score >= 60) tier = tiers.gold;
  else tier = tiers.red;

  // Score display — number, clock icon (unreleased), or dash (no data)
  let scoreDisplay: string;
  if (item.isUnreleased) {
    scoreDisplay = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  } else if (item.score !== null) {
    scoreDisplay = String(item.score);
  } else {
    scoreDisplay = "—";
  }

  // Dev tooltip with source breakdown
  let scoreTitle = item.isUnreleased
    ? "Not yet released"
    : item.score !== null
      ? `ReelScore: ${item.score}`
      : "Not enough ratings";
  if (import.meta.env.DEV && item.sources.length > 0) {
    const breakdown = item.sources
      .map((s) => `${getSourceLabel(s.source as AudienceSource)}: ${s.normalizedScore}`)
      .join(" | ");
    scoreTitle = item.score !== null
      ? `ReelScore: ${item.score} (${item.sources.length} sources)\n${breakdown}`
      : `Insufficient sources (${item.sources.length}/2)\n${breakdown}`;
  }

  // Unique SVG gradient IDs per card — prevents conflicts across 60+ cards
  const gradL = `grad-l-${item.tmdbId}`;
  const gradR = `grad-r-${item.tmdbId}`;

  // Poster HTML — image or placeholder
  const posterHtml = posterUrl
    ? `<img src="${posterUrl}" alt="${item.title.replace(/"/g, "&quot;")}" loading="lazy" width="342" height="513" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />`
    : `<div class="flex h-full w-full items-center justify-center text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </div>`;

  return `
    <div class="group relative flex flex-col cursor-pointer" data-tmdb-id="${item.tmdbId}" data-media-type="${item.mediaType}">
      <div class="flex flex-col relative">
        <div class="flex items-end self-end mr-2">
          <svg class="overflow-visible h-3" viewBox="0 0 14 14">
            <defs><linearGradient id="${gradL}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${tier.from}"/><stop offset="100%" stop-color="${tier.to}"/></linearGradient></defs>
            <path d="M14,0 Q14,14 0,14 L14,14 Z" fill="url(#${gradL})"/>
          </svg>
          <div class="flex items-center justify-center z-10 rounded-t-lg w-12 h-5 bg-gradient-to-b ${tier.fromClass} ${tier.toClass}" title="${scoreTitle}">
            <span class="font-mono font-bold text-sm tabular-nums ${tier.textColor}">${scoreDisplay}</span>
          </div>
          <svg class="overflow-visible h-3" viewBox="0 0 14 14">
            <defs><linearGradient id="${gradR}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${tier.from}"/><stop offset="100%" stop-color="${tier.to}"/></linearGradient></defs>
            <path d="M0,0 Q0,14 14,14 L0,14 Z" fill="url(#${gradR})"/>
          </svg>
        </div>
        <div class="relative overflow-hidden bg-surface-700 aspect-[2/3] rounded-lg shadow-lg border-t-2 ${tier.borderClass}">
          ${posterHtml}
        </div>
      </div>
      <h3 class="mt-2 text-sm font-medium text-white truncate leading-tight">${item.title.replace(/</g, "&lt;")}</h3>
      <div class="mt-1 flex items-center gap-1 text-xs text-white/50">
        <span>${typeBadgeText}</span>
        ${year ? `<span>•</span><span>${year}</span>` : ""}
      </div>
    </div>`;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "all";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);

  // Cross-dedup: accumulated TMDB IDs from all previous pages.
  // Grows each page — page 1 IDs from index.astro, plus each
  // subsequent page's IDs appended by the sentinel URL.
  const excludeParam = url.searchParams.get("exclude") ?? "";
  const excludeIds = new Set(
    excludeParam
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n))
  );

  const apiKey = env.TMDB_API_KEY;
  const mdblistKey = env.MDBLIST_API_KEY;
  const kv = env.SCORE_CACHE;

  // 60 items per page = LCM(2,3,4,5,6) — fills complete rows at every
  // responsive breakpoint so there are never gaps in the grid.
  // Uses the same 6-source blend as index.astro. blendAndDedup handles
  // dedup, anime filtering, cross-dedup, and popularity sorting.
  // allBlended holds every deduplicated item from this page's sources.
  // We show 60 but exclude ALL blended IDs — items beyond the cutoff
  // could reappear from different sources on later TMDB pages.
  let allBlended: TmdbTrendingItem[] = [];

  if (type === "movie") {
    // 4 movie sources, 1 page each (80 items → dedup → take 60)
    // Lockstep: feed page N = TMDB source page N
    const tmdbPage = page;
    const [pm, np, tr, up] = await Promise.all([
      getPopularMovies(apiKey, tmdbPage),
      getNowPlayingMovies(apiKey, tmdbPage),
      getTopRatedMovies(apiKey, tmdbPage),
      getUpcomingMovies(apiKey, tmdbPage),
    ]);
    allBlended = blendAndDedup(
      [
        pm?.results ?? [],
        np?.results ?? [],
        tr?.results ?? [],
        up?.results ?? [],
      ],
      excludeIds
    );
  } else if (type === "tv") {
    // 2 TV sources — need 3 pages each to reach ~120 items → take 60
    const tvStart = (page - 1) * 3 + 1;
    const [pt1, pt2, pt3, tr1, tr2, tr3] = await Promise.all([
      getPopularTV(apiKey, tvStart),
      getPopularTV(apiKey, tvStart + 1),
      getPopularTV(apiKey, tvStart + 2),
      getTopRatedTV(apiKey, tvStart),
      getTopRatedTV(apiKey, tvStart + 1),
      getTopRatedTV(apiKey, tvStart + 2),
    ]);
    allBlended = blendAndDedup(
      [
        pt1?.results ?? [],
        pt2?.results ?? [],
        pt3?.results ?? [],
        tr1?.results ?? [],
        tr2?.results ?? [],
        tr3?.results ?? [],
      ],
      excludeIds
    );
  } else {
    // "all" — 6 sources, 1 page each (120 items → dedup → take 60)
    // Lockstep: feed page N = TMDB source page N.
    // index.astro uses page 1, so feed.ts page 2 = source page 2.
    const tmdbPage = page;
    const [pm, np, tr, up, pt, trt] = await Promise.all([
      getPopularMovies(apiKey, tmdbPage),
      getNowPlayingMovies(apiKey, tmdbPage),
      getTopRatedMovies(apiKey, tmdbPage),
      getUpcomingMovies(apiKey, tmdbPage),
      getPopularTV(apiKey, tmdbPage),
      getTopRatedTV(apiKey, tmdbPage),
    ]);
    allBlended = blendAndDedup(
      [
        pm?.results ?? [],
        np?.results ?? [],
        tr?.results ?? [],
        up?.results ?? [],
        pt?.results ?? [],
        trt?.results ?? [],
      ],
      excludeIds
    );
  }

  // Show 60 items but track all blended IDs for cross-page dedup
  const items = allBlended.slice(0, 60);

  // Fetch scores in rate-limited batches
  const scoreInputs = items.map((item) => ({
    tmdbId: item.id,
    mediaType: (item.media_type ?? "movie") as "movie" | "tv",
    releaseDate: getReleaseDate(item) ?? null,
  }));

  const scoreResults = await getScoresBatched(kv, mdblistKey, scoreInputs);

  const now = new Date();
  const scoredItems = items.map((item, i) => {
    const scoreData = scoreResults[i];
    const result = scoreData ? calculateReelScore(scoreData.scores) : null;
    const releaseDateStr = getReleaseDate(item) ?? null;
    const isUnreleased = releaseDateStr ? new Date(releaseDateStr) > now : false;

    return {
      tmdbId: item.id,
      title: getDisplayTitle(item),
      posterPath: item.poster_path,
      mediaType: (item.media_type ?? "movie") as "movie" | "tv",
      releaseDate: releaseDateStr,
      score: result?.score ?? null,
      isUnreleased,
      sources: result?.sources ?? [],
    };
  });

  // Render HTML fragments — title cards plus a "load more" sentinel for the next page.
  // Each HTMX response must include the next page's scroll sentinel to keep
  // infinite scroll chaining. The sentinel targets the grid with beforeend,
  // so the next batch of cards (including the next sentinel) appends to the grid.
  // When no items are returned, we omit the sentinel to stop scrolling.
  const cardsHtml = scoredItems.map(renderTitleCard).join("\n");

  const nextPage = page + 1;
  const typeParam = type !== "all" ? `&type=${type}` : "";
  // Accumulate ALL blended IDs for cross-page dedup (not just the 60 shown).
  // Items beyond the 60 cutoff could reappear from different TMDB sources
  // on later pages — excluding all blended IDs prevents this.
  const currentPageIds = allBlended.map((item) => item.id).join(",");
  const allExcludeIds = excludeParam
    ? `${excludeParam},${currentPageIds}`
    : currentPageIds;
  const excludeQueryParam = `&exclude=${allExcludeIds}`;
  // Max page cap — prevents runaway DOM growth that degrades performance.
  // 10 pages × 60 cards = 600 titles, more than enough for discovery.
  const MAX_PAGES = 10;
  // Scroll sentinel — triggers next page fetch via IntersectionObserver.
  // Uses "intersect threshold:0.1" instead of "revealed" because "revealed"
  // fires immediately on DOM insertion (before layout), causing runaway loading.
  // Spans the full grid width so IO can track a real box.
  const loadMoreSentinel = items.length > 0 && page < MAX_PAGES
    ? `<div
        style="grid-column: 1 / -1; height: 1px;"
        hx-get="/api/feed?page=${nextPage}${typeParam}${excludeQueryParam}"
        hx-trigger="intersect threshold:0.1 once"
        hx-target="#grid-feed"
        hx-swap="beforeend"
      ></div>`
    : "";

  return new Response(cardsHtml + loadMoreSentinel, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};
