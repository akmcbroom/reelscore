/**
 * Season episodes API endpoint — serves HTMX HTML partial for episode carousel.
 *
 * Route: GET /api/season/:tvId?season=N&show=ShowTitle
 *
 * Lazy-loaded when a user selects a season pill in the title modal.
 * Returns a horizontal scroll carousel of episode cards with still images.
 * Clicking an episode card opens a detail modal with the full description.
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
 * The entire card is clickable — opens the episode detail modal
 * via the titleModal.openEpisode() method (data-action="open-episode" delegation).
 *
 * @param episode - Episode data from TMDB
 * @param showTitle - Parent show title for display in the episode modal
 */
function renderEpisodeCard(episode: TmdbEpisode, showTitle: string): string {
  const stillUrl = getImageUrl(episode.still_path, "backdrop", "small");
  // Larger still for the modal background
  const stillUrlLarge = getImageUrl(episode.still_path, "backdrop", "large");
  const hasOverview = episode.overview && episode.overview.trim().length > 0;

  const stillHtml = stillUrl
    ? `<img src="${stillUrl}" alt="${episode.name.replace(/"/g, "&quot;")}" class="h-full w-full object-cover" loading="lazy" />`
    : `<div class="flex h-full w-full items-center justify-center bg-surface-700 text-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </div>`;

  // Newspaper icon — visual indicator that a description is available
  const iconHtml = hasOverview ? `
    <div class="absolute top-1.5 left-1.5 z-10 rounded bg-black/60 p-1 text-white/70">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
    </div>` : "";

  // Format air date as readable string
  const airDate = episode.air_date
    ? new Date(episode.air_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  // Format runtime
  const runtime = episode.runtime ? `${episode.runtime}m` : "";

  // Escape strings for HTML output
  const escapedName = episode.name.replace(/"/g, "&quot;").replace(/</g, "&lt;");

  // Build episode data object — serialized into data-episode attribute.
  // Double quotes become &quot; to survive inside the HTML attribute value.
  // The delegated click listener in Layout.astro reads dataset.episode and calls
  // titleModal.openEpisode(JSON.parse(...)) — HTML entity decoding is automatic.
  const episodeData = JSON.stringify({
    stillUrl: stillUrlLarge || stillUrl || "",
    showTitle,
    title: episode.name,
    seasonEp: `Season ${episode.season_number}, Episode ${episode.episode_number}`,
    airDate,
    runtime,
    overview: episode.overview || "No description available.",
  }).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  return `
    <div class="flex-shrink-0 w-40 cursor-pointer group/ep" data-action="open-episode" data-episode="${episodeData}">
      <div class="relative">
        <div class="aspect-video rounded-md overflow-hidden bg-surface-700 transition-transform duration-200 group-hover/ep:scale-105">
          ${stillHtml}
        </div>
        ${iconHtml}
      </div>
      <p class="mt-1.5 text-[11px] text-white/50">Episode ${episode.episode_number}</p>
      <p class="text-xs font-medium text-white truncate">${escapedName}</p>
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

  // Show title passed from the title modal for display in episode detail modal
  const showTitle = url.searchParams.get("show") ?? "";

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
      ${season.episodes.map((ep) => renderEpisodeCard(ep, showTitle)).join("")}
    </div>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
