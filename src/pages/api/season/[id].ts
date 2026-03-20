/**
 * Season episodes API endpoint — serves HTMX HTML partial for episode carousel.
 *
 * Route: GET /api/season/:tvId?season=N
 *
 * Lazy-loaded when a user expands a season accordion in the title modal.
 * Returns a horizontal scroll carousel of episode cards with still images.
 * See CLAUDE.md Title Modal — Seasons list.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getCachedSeasonDetails,
  getImageUrl,
  type TmdbEpisode,
} from "../../../lib/tmdb.ts";

/**
 * Renders a single episode card for the horizontal carousel.
 * Uses landscape still images (16:9 aspect ratio).
 */
function renderEpisodeCard(episode: TmdbEpisode): string {
  const stillUrl = getImageUrl(episode.still_path, "backdrop", "small");

  const stillHtml = stillUrl
    ? `<img src="${stillUrl}" alt="${episode.name.replace(/"/g, "&quot;")}" class="h-full w-full object-cover" loading="lazy" />`
    : `<div class="flex h-full w-full items-center justify-center bg-surface-700 text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </div>`;

  return `
    <div class="flex-shrink-0 w-40">
      <div class="aspect-video rounded-md overflow-hidden bg-surface-700">
        ${stillHtml}
      </div>
      <p class="mt-1.5 text-[11px] text-white/50">Episode ${episode.episode_number}</p>
      <p class="text-xs font-medium text-white truncate">${episode.name.replace(/</g, "&lt;")}</p>
    </div>`;
}

export const GET: APIRoute = async ({ params, request }) => {
  const tvId = parseInt(params.id ?? "", 10);
  if (isNaN(tvId)) {
    return new Response("Invalid TV show ID", { status: 400 });
  }

  const url = new URL(request.url);
  const seasonNumber = parseInt(url.searchParams.get("season") ?? "", 10);
  if (isNaN(seasonNumber)) {
    return new Response("Missing season number", { status: 400 });
  }

  const apiKey = env.TMDB_API_KEY;
  const kv = env.SCORE_CACHE;

  const season = await getCachedSeasonDetails(kv, apiKey, tvId, seasonNumber);

  if (!season || !season.episodes || season.episodes.length === 0) {
    return new Response(
      `<p class="text-xs text-white/40 py-2">No episode data available.</p>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const html = `
    <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      ${season.episodes.map(renderEpisodeCard).join("")}
    </div>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
