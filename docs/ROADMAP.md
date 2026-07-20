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

- [x] 3.1 Hono GET /api/title/:id — JSON aggregate (details, credits, scores,
      rating, trailer, logo, providers)
- [x] 3.2 TitleModal (shadcn Dialog): backdrop hero, logo, score lip, meta,
      trailer, overview; URL-param driven, scroll preserved
- [x] 3.3 Cast strip, providers, dev-mode score-breakdown tooltip
- [x] 3.4 TV seasons: GET /api/season/:id + episode UI
      (final React state at `3d55b25`)

## Phase 3.5 — SvelteKit migration (owner decision 2026-07-19)

- [x] S0 Scaffold SvelteKit 2 + adapter-cloudflare; repo swap keeping
      docs/drizzle/tests/bindings; exact pins
- [x] S1 Domain code → src/lib + src/lib/server; 74 tests green — HARD GATE
- [x] S2 Hono mounted at /api/[...paths] catch-all; /api/feed verified w/ live bindings
- [x] S3 shadcn-svelte (same nova preset), Geist, cookie theme via handle
      hook + no-flash script, Header/ThemeToggle
- [x] S4 Feed: +page.server.ts load, tabs/sort via goto, runes infinite
      scroll (79/79 unique), SSR HTML contains scored cards
- [x] S5 Title modal via shallow routing (pushState + page.state; back
      button closes; shareable ?title URLs)
- [x] S6 Docs rewrite (ARCHITECTURE, DECISIONS, CLAUDE.md, README, ROADMAP),
      session note, build + read-only wiring check

## Phase 4 — Auth (SvelteKit-native)

- [ ] 4.1 Better Auth email/password: src/lib/server/auth.ts, schema via
      @better-auth/cli generate, additive migration, mounted at /api/auth/*;
      session read in hooks.server.ts handle → locals.user → layout load
- [ ] 4.2 /login + /signup as SvelteKit form actions with use:enhance
      (progressive enhancement), account menu in header, sign-out

## Phase 5 — Feed performance & search

- [ ] 5.0 Feed performance (promoted from Phase 8 — PRD §2): deferred score
      hydration (feed never blocks on MDbList; cards render with cached
      scores, misses fill in after), sort-key merge for "All" (replaces 1:1
      interleave), sentinel prefetch margin (~1.5 viewports), MDbList
      rate-limit tuning (verify paid-plan limits; 2-concurrent/500ms is a
      guess)
- [ ] 5.1 GET /api/search (TMDB search + batched scores) + debounced header
      search UI

## Phase 6 — Watchlist, ratings & launch  ← MVP line

- [ ] 6.1 Schema + migration: user_watchlist, user_title_ratings
- [ ] 6.2 Watchlist: POST/DELETE /api/watchlist, toggle on card+modal,
      /watchlist route
- [ ] 6.3 Ratings: thumbs up/down in modal, POST/DELETE /api/ratings
- [ ] 6.4 Launch readiness (PRD §8): SSR /title/[id] permalink pages,
      empty/error states, privacy + terms + account deletion,
      password-reset/email-provider decision (owner)
- [ ] 6.5 Parity deploy (owner go-ahead required — replaces live site):
      verify how getreelscore.com is attached (old Astro: Worker vs Pages);
      `wrangler d1 export` backup, then `db:migrate:remote` (migration 0000
      drops the old score_cache_metadata table); production secrets via
      `wrangler secret put` (TMDB/MDBLIST/BETTER_AUTH_*); smoke-test a
      `wrangler versions upload` preview URL (all tabs×lenses, modal, auth
      round trip, search, cold-view TTFB, theme, no dev breakdown in prod);
      then deploy + domain verification

## Phase 7 — Personalization (post-MVP)

- [ ] 7.1 user_preferences schema + confidence-weight engine (tested)
- [ ] 7.2 Onboarding flow (4 steps, minimums, genre-aware title rating)
- [ ] 7.3 Personalized swing (±9) + Scored for You row + public "Why this
      score?" explainer (general terms only — base math stays private)
- [ ] 7.4 Profile page: preference management
- [ ] 7.5 Weight calibration study (DECISIONS 2026-07-19): measure per-source
      deviation from consensus + thumbs predictiveness on live data; any
      weight change requires explicit owner unlock of scoring.ts

## Phase 8 — Expected-features backlog (post-MVP, see PRD)

- Provider filtering ("what's on my services"), search filters, genre
  browsing, "More like this", person pages, watched history, /settings page

## Phase 9 — Deferred (not scheduled)

- In-app notifications (score change ≥5, streaming availability)
- Hidden titles; manual score refresh w/ 15-min cooldown
- Ads (every 9th cell, provider-agnostic) + premium ad-free tier
- Custom visual identity pass (beyond the score lip)
- Blended-feed experiment (only if sort-lens feed proves worse)
- Google/Apple OAuth
