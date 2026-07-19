import { Hono } from "hono";

import { getFeedPage } from "./feed";
import { getSeasonPayload, getTitleDetailPayload } from "./title";
import { feedQuerySchema } from "$lib/schemas";

/**
 * The Hono API app — every JSON endpoint the client fetches lives here,
 * Zod-validated. Mounted into SvelteKit at src/routes/api/[...paths]/+server.ts,
 * which delegates matching requests to `api.fetch(request, platform.env)`.
 * Page-level data loading calls the lib functions directly from `load` instead.
 */
const api = new Hono<{ Bindings: Env }>();

api.get("/api/health", (c) => c.json({ ok: true }));

/**
 * Feed batches 2+ for the infinite scroll (batch 1 is SSR'd by the home
 * page's load through the same getFeedPage).
 */
api.get("/api/feed", async (c) => {
  const parsed = feedQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams)
  );
  if (!parsed.success) {
    return c.json({ error: "Invalid feed query", issues: parsed.error.issues }, 400);
  }

  const feed = await getFeedPage(
    c.env.DB,
    c.env.TMDB_API_KEY,
    c.env.MDBLIST_API_KEY,
    parsed.data
  );
  return c.json(feed);
});

/** Title modal aggregate: details, credits, scores, rating, trailer, logo, providers. */
api.get("/api/title/:id", async (c) => {
  const tmdbId = Number.parseInt(c.req.param("id"), 10);
  const mediaType = c.req.query("type") === "tv" ? "tv" : "movie";
  if (Number.isNaN(tmdbId)) {
    return c.json({ error: "Invalid title id" }, 400);
  }

  const detail = await getTitleDetailPayload(
    c.env.DB,
    c.env.SCORE_CACHE,
    c.env.TMDB_API_KEY,
    c.env.MDBLIST_API_KEY,
    tmdbId,
    mediaType
  );
  if (!detail) return c.json({ error: "Title not found" }, 404);
  return c.json(detail);
});

/** Season episode list for the TV seasons carousel. */
api.get("/api/season/:id", async (c) => {
  const tvId = Number.parseInt(c.req.param("id"), 10);
  const seasonNumber = Number.parseInt(c.req.query("season") ?? "1", 10);
  if (Number.isNaN(tvId) || Number.isNaN(seasonNumber)) {
    return c.json({ error: "Invalid season request" }, 400);
  }

  const season = await getSeasonPayload(
    c.env.SCORE_CACHE,
    c.env.TMDB_API_KEY,
    tvId,
    seasonNumber
  );
  if (!season) return c.json({ error: "Season not found" }, 404);
  return c.json(season);
});

export default api;
