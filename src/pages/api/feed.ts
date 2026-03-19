/**
 * Feed API endpoint — serves HTMX HTML partials for discovery feed sections.
 *
 * Query params:
 *   section: "trending" | "new" | "theaters" (required)
 *   type: "movie" | "tv" | "all" (default: "all")
 *   page: page number (default: 1)
 *
 * Returns HTML fragments (TitleCard markup) for HTMX to swap into the page.
 * See CLAUDE.md Discovery Feeds and API Endpoints.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getTrending,
  getNowPlaying,
  getOnTheAir,
  getUpcoming,
  getDisplayTitle,
  getReleaseDate,
  getImageUrl,
  type TmdbTrendingItem,
} from "../../lib/tmdb.ts";
import { getScoresBatched } from "../../lib/mdblist.ts";
import { calculateReelScore } from "../../lib/scoring.ts";

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
  releaseDate: string | undefined;
  score: number | null;
}): string {
  const posterUrl = getImageUrl(item.posterPath, "poster", "medium");
  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : null;
  const typeBadgeText = item.mediaType === "tv" ? "TV" : "Movie";
  const typeBadgeClass =
    item.mediaType === "tv" ? "badge-secondary" : "badge-outline";

  // Score pill color
  let scoreColorClass = "bg-surface-600 text-white/50";
  let scoreDisplay = "—";
  if (item.score !== null) {
    scoreDisplay = String(item.score);
    if (item.score >= 85) scoreColorClass = "bg-score-gold text-black";
    else if (item.score >= 70) scoreColorClass = "bg-score-green text-black";
    else if (item.score >= 60) scoreColorClass = "bg-score-yellow text-black";
    else scoreColorClass = "bg-score-red text-white";
  }

  const posterHtml = posterUrl
    ? `<img src="${posterUrl}" alt="${item.title.replace(/"/g, "&quot;")}" loading="lazy" width="342" height="513" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />`
    : `<div class="flex h-full w-full items-center justify-center text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </div>`;

  return `
    <div class="group relative flex flex-col" data-tmdb-id="${item.tmdbId}" data-media-type="${item.mediaType}">
      <div class="relative overflow-hidden rounded-lg bg-surface-700 aspect-[2/3]">
        ${posterHtml}
        <div class="absolute -top-0 left-1/2 -translate-x-1/2 translate-y-2 z-10">
          <span class="inline-flex items-center justify-center rounded-full font-bold tabular-nums text-sm px-3 py-1 min-w-10 ${scoreColorClass}"
                title="${item.score !== null ? `ReelScore: ${item.score}` : "Not enough ratings"}">
            ${scoreDisplay}
          </span>
        </div>
      </div>
      <h3 class="mt-2 text-sm font-medium text-white line-clamp-2 leading-tight">${item.title.replace(/</g, "&lt;")}</h3>
      <div class="mt-1 flex items-center gap-2 text-xs text-white/50">
        <span class="${typeBadgeClass} text-[10px] px-1.5 py-0">${typeBadgeText}</span>
        ${year ? `<span>${year}</span>` : ""}
      </div>
    </div>`;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const section = url.searchParams.get("section") ?? "trending";
  const type = url.searchParams.get("type") ?? "all";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);

  const apiKey = env.TMDB_API_KEY;
  const mdblistKey = env.MDBLIST_API_KEY;
  const kv = env.SCORE_CACHE;

  // Fetch titles from TMDB based on section
  let items: TmdbTrendingItem[] = [];

  switch (section) {
    case "trending": {
      const data = await getTrending(apiKey, page);
      items = data?.results ?? [];
      break;
    }
    case "theaters": {
      const data = await getNowPlaying(apiKey, page);
      items = data?.results ?? [];
      break;
    }
    case "new": {
      // "New Releases" = blend of now_playing + on_the_air + upcoming
      // Fetch all in parallel, deduplicate by TMDB ID
      const [nowPlaying, onTheAir, upcoming] = await Promise.all([
        getNowPlaying(apiKey, page),
        getOnTheAir(apiKey, page),
        getUpcoming(apiKey, page),
      ]);

      const seen = new Set<number>();
      const combined: TmdbTrendingItem[] = [];

      for (const result of [
        ...(nowPlaying?.results ?? []),
        ...(onTheAir?.results ?? []),
        ...(upcoming?.results ?? []),
      ]) {
        if (!seen.has(result.id)) {
          seen.add(result.id);
          combined.push(result);
        }
      }

      // Sort by popularity descending
      combined.sort((a, b) => b.popularity - a.popularity);
      items = combined;
      break;
    }
  }

  // Filter by media type if specified
  if (type === "movie") {
    items = items.filter((i) => i.media_type === "movie");
  } else if (type === "tv") {
    items = items.filter((i) => i.media_type === "tv");
  }

  // Fetch scores in rate-limited batches to avoid MDbList 429 errors
  const scoreInputs = items.map((item) => ({
    tmdbId: item.id,
    mediaType: (item.media_type ?? "movie") as "movie" | "tv",
    releaseDate: getReleaseDate(item) ?? null,
  }));

  const scoreResults = await getScoresBatched(kv, mdblistKey, scoreInputs);

  const scoredItems = items.map((item, i) => {
    let score: number | null = null;
    const scoreData = scoreResults[i];
    if (scoreData) {
      const result = calculateReelScore(scoreData.scores);
      score = result.score;
    }

    return {
      tmdbId: item.id,
      title: getDisplayTitle(item),
      posterPath: item.poster_path,
      mediaType: (item.media_type ?? "movie") as "movie" | "tv",
      releaseDate: getReleaseDate(item) ?? null,
      score,
    };
  });

  // Render HTML fragments
  const html = scoredItems.map(renderTitleCard).join("\n");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};
