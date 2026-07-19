import { Hono } from "hono";
import { createRequestHandler } from "react-router";

import { getFeedPage } from "~/lib/feed.server";
import { feedQuerySchema } from "~/lib/schemas";

/**
 * Worker entry point.
 *
 * Hono owns `/api/*` (JSON endpoints, Zod-validated). Any request that no API
 * route matches falls through to the React Router SSR handler. This mirrors the
 * tidbits pattern: one Worker, clean JSON API surface, SSR for everything else.
 */
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const app = new Hono<{ Bindings: Env }>();

// --- API routes ---

app.get("/api/health", (c) => c.json({ ok: true }));

/**
 * Feed batches 2+ for the infinite scroll (batch 1 is SSR'd by the home
 * loader through the same getFeedPage).
 */
app.get("/api/feed", async (c) => {
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

// Everything else → React Router SSR
app.all("*", (c) => requestHandler(c.req.raw));

export default app;
