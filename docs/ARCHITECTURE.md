# ReelScore — Architecture

## Stack (exact-pinned; see package.json)

| Layer | Choice | Notes |
|---|---|---|
| Host | Cloudflare Workers (worker name `reelscore`) | serves getreelscore.com |
| Framework | React Router v8 (framework mode, SSR) | scaffolded via create-cloudflare |
| API | Hono at `/api/*` (same Worker, `workers/app.ts`) | JSON only, Zod-validated |
| DB | Cloudflare D1 `reelscore-db` (id `c7810fd5-3d57-477e-8320-5b1676661572`) | binding `DB` |
| Cache | Cloudflare KV (id `f02c7b82…`) | binding `SCORE_CACHE`; TMDB responses + cooldown keys only |
| ORM | Drizzle + drizzle-kit migrations in `./drizzle` | applied via wrangler, never by hand |
| Auth | better-auth, email/password only | Phase 4 |
| UI | Tailwind v4 + shadcn/ui (nova preset, radix base) | components owned in `app/components/ui/` |
| Icons | lucide-react | ships with shadcn |
| Validation | Zod schemas shared by API + forms | `app/lib/schemas.ts` |
| Tests | Vitest (`npm test`) | scoring engine coverage is mandatory |
| External APIs | MDbList (ALL score data, paid plan), TMDB (metadata/images/providers/discover — never scores) | keys in `.dev.vars` |

## Request flow

```
Request → workers/app.ts (Hono)
  /api/*  → JSON handlers (Zod-validated), bindings via c.env
  else    → React Router SSR (loaders access env via `cloudflare:workers` import)
```

## Layout

```
app/
├── routes/            home (feed), login/signup (P4), watchlist (P6)
├── components/ui/     shadcn components (owned source, edit freely)
├── components/        title-card, score-badge, feed-grid, title-modal, header, theme-toggle
├── hooks/             use-infinite-feed (IO sentinel + Set dedup)
├── db/                schema.ts (ALL tables), index.ts (drizzle factory)
└── lib/
    ├── scoring.ts     LOCKED score math (ported from Astro app, unit-tested)
    ├── mdblist.ts     MDbList client + rate-limited batching
    ├── tmdb/          split TMDB client: types, client, discover, details,
    │                  media, search, cached (KV wrappers), index (barrel)
    ├── feed.server.ts getFeedPage() — shared by home loader AND /api/feed
    ├── scores.server.ts  D1 score cache (batch read → MDbList fetch → upsert)
    ├── cache.server.ts   KV helpers (TMDB responses, cooldowns)
    ├── schemas.ts     Zod contracts
    ├── theme.ts       cookie theme helpers
    └── utils.ts       shadcn cn()
workers/app.ts         Worker entry: Hono /api/* + RR SSR fallthrough
drizzle/               generated SQL migrations (committed)
docs/                  PRD / ARCHITECTURE / ROADMAP / DECISIONS / sessions
```

## Caching architecture

- **Scores → D1** (`scores` table): one row per title; `breakdown` JSON column
  holds the full per-source math for dev tooltips; `fetched_at` + code-enforced
  TTL tiers (24h in-theaters / 3d recent / 7d older — `getCacheTtl`). Batch
  read is a single `IN` select; writes via `db.batch()` upserts. Stale rows are
  refetch triggers and get upserted in place.
- **KV** (`SCORE_CACHE` binding): raw TMDB response caching (details, credits,
  providers, logos… via `tmdb/cached.ts`) and per-user refresh-cooldown keys
  (`refresh:{user_id}:{tmdb_id}`, 15-min TTL). KV minimum TTL is 60s.
- Why D1 for scores: queryability (watchlist joins, notifications, score
  filters), strong consistency, single batched read. KV for opaque
  hot-path HTTP payloads.

## Feed algorithm

One TMDB Discover query per (type, sort) view — see PRD §2 for filters. Home
loader SSRs batch 1 (3 TMDB pages ≈ 60 items); `GET /api/feed` serves later
batches as JSON. Client keeps a `Set` of seen IDs (popularity drift guard),
reset on type/sort change. 10-batch cap.

## Conventions

- `.server.ts` suffix for anything touching bindings — never leaks client-side.
- Lib functions are DI-style (take `db`/`kv`/`apiKey` params); routes pass
  `env.*` from `cloudflare:workers`, Hono handlers pass `c.env.*`.
- Path alias `~/*` → `app/*` (in BOTH tsconfig.json and
  tsconfig.cloudflare.json — keep in sync; root one is required by shadcn CLI).
- Theme: dark default; cookie `theme` (light|dark|system) written client-side
  by `setTheme()`; root loader reads it for SSR; inline no-flash script
  resolves "system".
- Score tier tokens: `--color-score-high/mid/low/none` in app.css.
- Timestamps in D1: ISO strings for `fetched_at` (D1 has no date type).
- No console.log in production code.

## External API notes

- **MDbList** (sole score source): base `https://api.mdblist.com`, path-based:
  `GET /tmdb/{movie|show}/{tmdb_id}?apikey=KEY`. Each title returns a `ratings`
  array (`source`, `value`, `score`, `votes`). Batched fetching: 2 concurrent,
  500ms between batches, retry-once on 429. Single point of failure — cached
  scores still display if it's down.
- **TMDB** (metadata only, free tier): discover, search, details, credits,
  videos, images/logos, watch providers, content ratings. Never used for
  scores.

## Environment

- Node 22 via nvm (`nvm use 22`); dev server port 5173 (`.claude/launch.json`
  pins the nvm node binary). RR8 wants ≥22.22 — 22.18 warning is harmless.
- **npm, never bun** (bun's ws hangs on this machine).
- `.dev.vars` (gitignored): `TMDB_API_KEY`, `MDBLIST_API_KEY`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Template in `.dev.vars.example`.
- `npm run cf-typegen` after any wrangler.jsonc change.
- **Deploy caution:** `npm run deploy` replaces the LIVE site at
  getreelscore.com. Do not deploy until the rebuild reaches parity (owner
  decision 2026-07-19).
- Old Astro app: last commit `1e21729` (`git show 1e21729:src/lib/tmdb.ts`).
