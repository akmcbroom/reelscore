import { Hono } from "hono";
import { createRequestHandler } from "react-router";

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

// Everything else → React Router SSR
app.all("*", (c) => requestHandler(c.req.raw));

export default app;
