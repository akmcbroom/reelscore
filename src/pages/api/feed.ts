/**
 * Feed API endpoint — serves HTMX HTML partials for the unified discovery feed.
 *
 * Query params:
 *   type: "movie" | "tv" | "all" (default: "all")
 *   page: page number (default: 1)
 *
 * Page 1 is rendered server-side by index.astro (blends 4 TMDB sources).
 * Pages 2+ use TMDB Popular endpoints (movies + TV), which have 500+ pages
 * of results — much deeper than trending's ~40 titles. Both popular endpoints
 * are fetched in parallel, blended, deduplicated, and sorted by popularity.
 *
 * Returns HTML fragments (TitleCard markup) for HTMX to swap into the page.
 * See CLAUDE.md Discovery Feeds.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getPopularMovies,
  getPopularTV,
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
  const typeBadgeText = item.mediaType === "tv" ? "TV" : "Movie";

  // Score pill — clock icon for unreleased, score for released
  let scoreColorClass = "bg-black/40 text-white/60";
  let scoreDisplay: string;
  let scoreTitle: string;

  if (item.isUnreleased) {
    // Lucide Clock icon SVG (16x16 to fit the pill)
    scoreDisplay = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    scoreTitle = "Not yet released";
  } else if (item.score !== null) {
    scoreDisplay = String(item.score);
    // Color tiers: green (70+), gold/amber (60-69), red (0-59)
    if (item.score >= 70) scoreColorClass = "bg-score-green text-black";
    else if (item.score >= 60) scoreColorClass = "bg-score-gold text-black";
    else scoreColorClass = "bg-score-red text-white";
    scoreTitle = `ReelScore: ${item.score}`;
  } else {
    scoreDisplay = "—";
    scoreTitle = "Not enough ratings";
  }

  // Dev-only tooltip with source breakdown — mirrors ScoreBadge.astro behavior.
  // import.meta.env.DEV is available in Astro API routes at build/dev time.
  if (import.meta.env.DEV && item.sources.length > 0) {
    const breakdown = item.sources
      .map((s) => `${getSourceLabel(s.source as AudienceSource)}: ${s.normalizedScore}`)
      .join(" | ");
    scoreTitle = item.score !== null
      ? `ReelScore: ${item.score} (${item.sources.length} sources)\n${breakdown}`
      : `Insufficient sources (${item.sources.length}/2)\n${breakdown}`;
  }

  // Lucide Video icon SVG for poster placeholder
  const posterHtml = posterUrl
    ? `<img src="${posterUrl}" alt="${item.title.replace(/"/g, "&quot;")}" loading="lazy" width="342" height="513" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />`
    : `<div class="flex h-full w-full items-center justify-center text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </div>`;

  return `
    <div class="group relative flex flex-col cursor-pointer" data-tmdb-id="${item.tmdbId}" data-media-type="${item.mediaType}" @click="$store.titleModal.openTitle(${item.tmdbId}, '${item.mediaType}')">
      <div class="relative overflow-hidden rounded-lg bg-surface-700 aspect-[2/3]">
        ${posterHtml}
        <div class="absolute -top-0 left-1/2 -translate-x-1/2 translate-y-2 z-10">
          <span class="inline-flex items-center justify-center rounded-full font-bold tabular-nums text-sm w-9 h-9 ${scoreColorClass}"
                title="${scoreTitle}">
            ${scoreDisplay}
          </span>
        </div>
      </div>
      <h3 class="mt-2 text-sm font-medium text-white truncate leading-tight">${item.title.replace(/</g, "&lt;")}</h3>
      <div class="mt-1 flex items-center gap-2 text-xs text-white/50">
        <span class="badge-secondary text-[10px] px-1.5 py-0">${typeBadgeText}</span>
        ${year ? `<span>${year}</span>` : ""}
      </div>
    </div>`;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "all";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);

  const apiKey = env.TMDB_API_KEY;
  const mdblistKey = env.MDBLIST_API_KEY;
  const kv = env.SCORE_CACHE;

  // Use TMDB Popular endpoints for pagination — they have 500+ pages of results,
  // unlike trending which tops out at ~40 titles. When type is "all", we fetch
  // both movies and TV in parallel, blend them, and sort by popularity.
  let items: TmdbTrendingItem[] = [];

  if (type === "movie") {
    const data = await getPopularMovies(apiKey, page);
    items = data?.results ?? [];
  } else if (type === "tv") {
    const data = await getPopularTV(apiKey, page);
    items = data?.results ?? [];
  } else {
    // "all" — fetch both popular movies and TV in parallel, then blend
    const [moviesData, tvData] = await Promise.all([
      getPopularMovies(apiKey, page),
      getPopularTV(apiKey, page),
    ]);

    // Combine and deduplicate by TMDB ID (unlikely but defensive)
    const seen = new Set<number>();
    for (const result of [
      ...(moviesData?.results ?? []),
      ...(tvData?.results ?? []),
    ]) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        items.push(result);
      }
    }

    // Sort blended results by popularity descending so the feed feels cohesive
    items.sort((a, b) => b.popularity - a.popularity);
  }

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
  // Invisible sentinel — triggers next page fetch when scrolled into view.
  // No visible spinner so cards flow seamlessly between pages.
  // Sentinel uses "display:contents" so it doesn't create a grid item or row.
  // This keeps it in the DOM for HTMX's "revealed" trigger while being
  // invisible to CSS grid layout — no gaps between pages.
  const loadMoreSentinel = items.length > 0
    ? `<div
        style="display:contents"
        hx-get="/api/feed?page=${nextPage}${typeParam}"
        hx-trigger="revealed"
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
