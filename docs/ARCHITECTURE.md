# ReelScore — Architecture

## Stack (exact-pinned; see package.json)

| Layer | Choice | Notes |
|---|---|---|
| Host | Cloudflare Workers (worker name `reelscore`) | serves getreelscore.com |
| Framework | SvelteKit 2 (Svelte 5 runes) + `@sveltejs/adapter-cloudflare` | SSR; kit config lives in vite.config.ts |
| API | Hono app (`src/lib/server/api.ts`) mounted at `src/routes/api/[...paths]/+server.ts` | JSON only, Zod-validated |
| DB | Cloudflare D1 `reelscore-db` (id `c7810fd5-3d57-477e-8320-5b1676661572`) | binding `DB` |
| Cache | Cloudflare KV (id `f02c7b82…`) | binding `SCORE_CACHE`; TMDB responses + cooldown keys only |
| ORM | Drizzle + drizzle-kit migrations in `./drizzle` | applied via wrangler, never by hand |
| Auth | better-auth, email/password only | auth phase (upcoming) |
| UI | Tailwind v4 + shadcn-svelte (nova preset, bits-ui) | components owned in `src/lib/components/ui/` |
| Icons | @lucide/svelte | vite `ssr.noExternal` required |
| Validation | Zod schemas shared by API + pages | `src/lib/schemas.ts` |
| Tests | Vitest (`npm test`) | scoring engine coverage is mandatory |
| External APIs | MDbList (ALL score data, paid plan), TMDB (metadata/images/providers/discover — never scores) | keys in `.dev.vars` |

## Request flow

```
Request → SvelteKit Worker (adapter-cloudflare)
  /api/*  → src/routes/api/[...paths]/+server.ts → Hono api.fetch(request, platform.env)
  pages   → +page.server.ts load (bindings via platform.env) → SSR
```

Page-level data loading calls lib functions directly from `load`; the Hono API
serves everything the client fetches after hydration (feed batches 2+, title
detail, seasons). Same function (`getFeedPage`) backs both.

## Layout

```
src/
├── app.html               shell; theme class/data-theme placeholders + no-flash script
├── app.css                Tailwind v4 + nova tokens + score tier tokens (Geist font)
├── app.d.ts               App.Platform (env: Env), App.PageState (showTitle)
├── hooks.server.ts        handle: stamps theme cookie value into the shell
├── routes/
│   ├── +layout.svelte     Header + system-theme listener + children
│   ├── +page.server.ts    feed load (reads ONLY type/sort params)
│   ├── +page.svelte       tabs/sort, runes infinite feed, shallow-routed modal
│   └── api/[...paths]/+server.ts   Hono mount (all methods)
└── lib/
    ├── scoring.ts         LOCKED score math (unit-tested)
    ├── mdblist.ts         MDbList types + normalization + raw fetch
    ├── schemas.ts         Zod contracts (feed, title detail, episodes)
    ├── feed.constants.ts  shared client/server constants
    ├── theme.ts           cookie theme helpers
    ├── tmdb/              TMDB client: types, client, discover, details, media, search, index
    ├── components/        score-lip, title-card, feed-grid, title-modal, header, theme-toggle
    │   └── ui/            shadcn-svelte components (owned source, edit freely)
    └── server/            SvelteKit-enforced server-only boundary
        ├── api.ts         the Hono app (all /api/* routes)
        ├── feed.ts        getFeedPage — one Discover query per (type, sort) view
        ├── scores.ts      D1 score cache (batch read → MDbList fetch → chunked upsert)
        ├── title.ts       title-detail + season payload assembly
        ├── cache.ts       KV helpers + TTL tier policy
        ├── tmdb-cached.ts KV-cached TMDB wrappers
        └── db/            schema.ts (ALL tables), index.ts (createDb factory)
drizzle/                   generated SQL migrations (committed)
docs/                      PRD / ARCHITECTURE / ROADMAP / DECISIONS / sessions
```

## Caching architecture

- **Scores → D1** (`scores` table): one row per title; `scores_json` +
  `breakdown` JSON columns; `fetched_at` + code-enforced TTL tiers (24h
  in-theaters / 3d recent / 7d older — `getCacheTtl`). Batch read is a single
  `IN` select; writes are chunked upserts (≤10 rows/statement — D1's
  100-bound-param limit) in one `db.batch()`. Stale rows serve as fallback and
  get upserted in place.
- **KV** (`SCORE_CACHE`): raw TMDB response caching (`tmdb-cached.ts`) and
  per-user refresh-cooldown keys (`refresh:{user}:{tmdb_id}`, 15-min TTL).

## Feed algorithm

One TMDB Discover query per (type, sort) view — see PRD §2 for filters. Each
batch = 2 TMDB pages per active media type; "all" interleaves movie/TV
alternately (preserves each lens's own ranking). Client keeps a seen-`Set`
(popularity drift guard), reset on view change. 10-batch cap.

## Conventions

- `src/lib/server/` is the server-only boundary — SvelteKit build-enforces it
  (imports from client code fail the build). No `.server.ts` suffix needed.
- Lib functions are DI-style (take `db`/`kv`/`apiKey` params); loads pass
  `platform.env.*`, Hono handlers pass `c.env.*`.
- Svelte 5 runes everywhere (forced in vite config); no store library — URL
  params are the state model.
- Title modal opens via **shallow routing** (`pushState` + `page.state`, URL
  params for shareability); back button closes it; feed load never re-runs
  for modal changes.
- Theme: dark default; cookie `theme` (light|dark|system) written client-side
  by `setTheme()`; `hooks.server.ts` stamps it into `app.html` placeholders;
  inline script resolves "system" pre-paint.
- Score tier tokens: `--color-score-high/mid/low/none` in app.css.
- Timestamps in D1: ISO strings (`fetched_at`) — D1 has no date type.
- No console.log in production code.

## External API notes

- **MDbList** (sole score source): `GET https://api.mdblist.com/tmdb/{movie|show}/{id}?apikey=KEY`
  (IMDb-id path preferred when known). Batched: 2 concurrent, 500ms between
  batches, retry-once on 429. Cached scores still display if it's down.
- **TMDB** (metadata only): discover, search, details, credits, videos,
  images/logos, watch providers, content ratings. Never used for scores.

## Environment

- Node 22 via nvm (`nvm use 22`); dev server port 5173 (`.claude/launch.json`
  runs `vite dev` with the pinned nvm node binary).
- **npm, never bun** (bun's ws hangs on this machine).
- `.dev.vars` (gitignored): `TMDB_API_KEY`, `MDBLIST_API_KEY`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Template in `.dev.vars.example`.
- `npm run cf-typegen` regenerates `src/worker-configuration.d.ts` (the `Env`
  type) after any wrangler.jsonc change; dev bindings are emulated from
  wrangler.jsonc by the adapter's platform proxy.
- **Deploy caution:** `npm run deploy` replaces the LIVE site at
  getreelscore.com. Do not deploy until parity (owner-gated roadmap item).
- History anchors: Astro app at `1e21729`; React Router app at `3d55b25`.
