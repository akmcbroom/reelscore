# ReelScore — Roadmap

Work top-to-bottom, one task per session. Tick boxes as tasks complete.
MVP line is the end of Phase 6. **Do not deploy before parity** (live site!).

## Phase 0 — Transition & Foundation

- [x] 0.1 Scaffold React Router v8 via create-cloudflare; verified on Node 22
- [x] 0.2 Repo swap: Astro removed (history at `1e21729`), scaffold in,
      wrangler.jsonc with existing D1/KV ids, exact-pinned deps, npm
- [x] 0.3 Foundation: shadcn/ui (nova preset), Hono worker entry with
      /api/health + RR fallthrough, dark-first cookie theme system, score tier
      tokens; wrangler account/D1 wiring verified read-only (deploy deferred)
- [x] 0.4 Docs system: slim CLAUDE.md, PRD, ARCHITECTURE, ROADMAP, DECISIONS,
      sessions/; README rewritten; sync-docs skill updated

## Phase 1 — Core libraries (no UI)

- [x] 1.1 Port scoring.ts + mdblist.ts verbatim + scoring tests green — HARD GATE (54 tests)
- [x] 1.2 Split tmdb.ts into app/lib/tmdb/* (one Discover builder per sort
      lens, no blendAndDedup); tmdb tests green (74 total)
- [x] 1.3 Drizzle `scores` schema + migration 0000 (drops old
      score_cache_metadata); scores.server.ts (D1 batch cache, TTL tiers);
      cache.server.ts (KV helpers)
- [x] 1.4 Zod contracts in app/lib/schemas.ts (FeedQuery/FeedItem/FeedPage;
      TitleDetail lands with Phase 3)

## Phase 2 — Feed

- [x] 2.1 feed.server.ts getFeedPage({type, sort, page}) + Hono GET /api/feed
- [x] 2.2 ScoreBadge (ported SVG score lip) + TitleCard (stock shadcn Card)
- [x] 2.3 home.tsx: SSR batch 1, grid, media tabs + sort selector via URL params
- [x] 2.4 useInfiniteFeed: sentinel, Set dedup (reset on tab/sort change),
      skeletons, 10-batch cap — browser-verified (79/79 unique after batch 2)

## Phase 3 — Title modal

- [ ] 3.1 Hono GET /api/title/:id — JSON aggregate (details, credits, scores,
      rating, trailer, logo, providers)
- [ ] 3.2 TitleModal (shadcn Dialog): backdrop hero, logo, score lip, meta,
      trailer, overview; URL-param driven, scroll preserved
- [ ] 3.3 Cast strip, providers, dev-gated score-breakdown popover
- [ ] 3.4 TV seasons: GET /api/season/:id + episode UI

## Phase 4 — Auth

- [ ] 4.1 Better Auth email/password: auth.server.ts, schema via
      @better-auth/cli generate, additive migration, mounted at /api/auth/*
- [ ] 4.2 /login + /signup routes, session in root loader, account menu, sign-out

## Phase 5 — Search

- [ ] 5.1 GET /api/search (TMDB search + batched scores) + debounced header
      search UI

## Phase 6 — Watchlist & ratings  ← MVP line

- [ ] 6.1 Schema + migration: user_watchlist, user_title_ratings
- [ ] 6.2 Watchlist: POST/DELETE /api/watchlist, toggle on card+modal,
      /watchlist route
- [ ] 6.3 Ratings: thumbs up/down in modal, POST/DELETE /api/ratings
- [ ] 6.4 Parity deploy: smoke test then `npm run deploy` (replaces live site —
      owner go-ahead required)

## Phase 7 — Personalization (post-MVP)

- [ ] 7.1 user_preferences schema + confidence-weight engine (tested)
- [ ] 7.2 Onboarding flow (4 steps, minimums, genre-aware title rating)
- [ ] 7.3 Personalized swing (±9) + Scored for You row
- [ ] 7.4 Profile page: preference management

## Phase 8 — Deferred (not scheduled)

- In-app notifications (score change ≥5, streaming availability)
- Hidden titles; manual score refresh w/ 15-min cooldown
- Ads (every 9th cell, provider-agnostic) + premium ad-free tier
- Custom visual identity pass (beyond the score lip)
- Blended-feed experiment (only if sort-lens feed proves worse)
- Deferred score hydration (SSR cards instantly, stream scores in)
- Google/Apple OAuth
