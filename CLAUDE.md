# CLAUDE.md — ReelScore

> Watch what you like, not what the critics like.

ReelScore aggregates **audience-only** scores from 6 sources into a single 0–100 score for movies and TV shows. U.S. releases only. Personalized to your taste over time.

**Live:** getreelscore.com
**Repo:** github.com/akmcbroom/reelscore

---

## Advisor Rules

- Act as a high-level advisor. Challenge thinking, question assumptions, expose blind spots.
- Never default to agreement. If reasoning is weak, break it down and explain why.
- Always ask clarifying questions before making code changes and wait for confirmation.
- Use as many native Basecoat components as possible. Only go custom if Basecoat doesn't cover it, and confirm first.
- Prefer surgical, targeted changes over full rewrites.
- Deliver code and documentation as a single synchronized deliverable.

---

## Tech Stack

| Layer         | Technology                                         |
| ------------- | -------------------------------------------------- |
| Framework     | Astro (SSR via `@astrojs/cloudflare` adapter)      |
| Styling       | Tailwind CSS v4                                    |
| UI Components | Basecoat (basecoat-css) + HTMX + Alpine.js         |
| Icons         | Lucide (inline SVGs from lucide.dev — NOT `lucide-astro`) |
| Auth          | Better Auth (native D1 support, `better-auth-cloudflare`) |
| Database      | Cloudflare D1 (SQLite) via Drizzle ORM             |
| Caching       | Cloudflare KV (TMDB/MDbList response caching)      |
| Deployment    | Cloudflare Workers                                 |
| External APIs | MDbList API (scores), TMDB API (metadata, images, streaming availability) |

### Stack Principles

- **Astro v6 Cloudflare bindings.** Access D1, KV, and secrets via `import { env } from "cloudflare:workers"` — NOT `Astro.locals.runtime.env` (removed in Astro v6). The `cloudflare:workers` module is declared in `src/env.d.ts`.
- **No build tooling beyond Astro.** No Webpack, no Vite plugins, no bundler config. Astro handles everything.
- **File-based routing.** Astro's `src/pages/` directory defines all routes. HTMX partials are served from `src/pages/api/` as Astro endpoints returning HTML fragments.
- **Minimal Alpine.js.** Alpine handles client-side state only where HTMX can't (modals, dropdown toggles, local UI state). Don't reach for Alpine when HTMX `hx-swap` can do the job.
- **Basecoat first.** Use Basecoat's class-based components (btn, card, badge, input, select, dialog, tabs, toast, skeleton, avatar, dropdown-menu, popover, etc.) before writing custom CSS. Reference: https://basecoatui.com
- **Drizzle ORM everywhere.** All D1 queries go through Drizzle. No raw SQL. This gives us typed schemas, migration tooling (`drizzle-kit`), and shared schema definitions with Better Auth.
- **Lucide icons everywhere.** Use inline Lucide SVGs copied from lucide.dev. The `lucide-astro` package has SSR compatibility issues with Cloudflare Workers, so use raw `<svg>` elements instead. No other icon libraries.
- **REST-like API structure from day one.** Clean, predictable endpoint naming.

### Basecoat Components Available

CSS-only (no JS required): Accordion, Alert, Alert Dialog, Avatar, Badge, Breadcrumb, Button, Button Group, Card, Checkbox, Combobox, Dialog, Empty, Field, Form, Input, Input Group, Item, Kbd, Label, Pagination, Progress, Radio Group, Skeleton, Slider, Spinner, Switch, Table, Textarea, Tooltip.

JS-required (need `basecoat.min.js` + component script): Command, Dropdown Menu, Popover, Select, Sidebar, Tabs, Toast.

Install via bun (`basecoat-css` package) and import in Astro's global CSS:
```css
@import "tailwindcss";
@import "basecoat-css";
```

JS components: import via ESM in Astro:
```js
import 'basecoat-css/all'; // or cherry-pick: import 'basecoat-css/tabs';
```

### Better Auth Configuration Notes

- D1 is natively supported as of Better Auth 1.5 — pass the D1 binding directly, auto-detected.
- Use `better-auth-cloudflare` wrapper for KV session caching and geolocation.
- **Known gotchas:**
  - Background tasks require `waitUntil` or they fail silently on Workers.
  - KV has a 60-second minimum TTL — use `Math.max(ttl, 60)` in `secondaryStorage.set`.
  - Rate limiter needs `rateLimit.customStorage` with hardcoded 60s minimum.
  - `cookieCache` + `secondaryStorage` is currently broken — disable `cookieCache`.
- Auth methods: Email/password + Google OAuth + Apple OAuth.
- Auth instance must be re-created per request with the D1 binding from Astro's Worker env.

---

## Project Structure

```
reelscore/
├── src/
│   ├── pages/                  # Astro file-based routing
│   │   ├── index.astro         # Home / discovery feed
│   │   ├── search.astro        # Search results
│   │   ├── watchlist.astro     # User watchlist (auth required)
│   │   ├── profile.astro       # User profile / preferences
│   │   ├── onboarding.astro    # Onboarding flow
│   │   ├── auth/
│   │   │   ├── login.astro
│   │   │   ├── signup.astro
│   │   │   └── callback.astro  # OAuth callback
│   │   └── api/                # HTMX partial endpoints + REST API
│   │       ├── feed.ts         # Discovery feed HTML fragments
│   │       ├── search.ts       # Search results fragments
│   │       ├── title/[id].ts   # Title modal content
│   │       ├── scores/[id].ts  # Score data / refresh
│   │       ├── watchlist.ts    # Watchlist CRUD
│   │       ├── preferences.ts  # User preference updates
│   │       └── auth/[...all].ts # Better Auth catch-all handler
│   ├── components/             # Astro components
│   │   ├── TitleCard.astro     # Media card (poster + score pill + actions)
│   │   ├── TitleModal.astro    # Detail modal (rating, cast, trailer, etc.)
│   │   ├── ScoreBadge.astro    # ReelScore pill with color coding
│   │   ├── StickyHeader.astro  # Search, filters, media type toggle, sort
│   │   ├── FeedSection.astro   # Feed section (trending, new, etc.)
│   │   └── OnboardingStep.astro
│   ├── layouts/
│   │   └── Layout.astro        # Base HTML shell, head, global styles
│   ├── lib/
│   │   ├── auth.ts             # Better Auth instance factory
│   │   ├── db.ts               # Drizzle client factory (D1)
│   │   ├── kv.ts               # KV cache helpers
│   │   ├── scoring.ts          # ReelScore calculation engine
│   │   ├── personalization.ts  # Preference weights + score adjustments
│   │   ├── tmdb.ts             # TMDB API client
│   │   └── mdblist.ts          # MDbList API client
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (all tables)
│   │   └── migrations/         # Drizzle-kit generated migrations
│   └── styles/
│       └── global.css          # Tailwind + Basecoat imports, custom theme
├── drizzle.config.ts           # Drizzle-kit config for D1
├── astro.config.mjs            # Astro config with Cloudflare adapter
├── vitest.config.ts            # Vitest configuration
├── wrangler.toml               # Cloudflare Workers config (D1 + KV bindings)
├── tests/                      # Test files mirror src/lib/ structure
│   ├── scoring.test.ts
│   ├── personalization.test.ts
│   └── api/                    # API endpoint integration tests
├── package.json
├── README.md                   # User-facing project readme (keep in sync)
└── CLAUDE.md                   # This file (source of truth, keep in sync)
```

---

## Score Engine

### Sources

All 6 audience scores sourced via **MDbList API** (paid plan):

| # | Source                         | MDbList key      | `value` scale |
| - | ------------------------------ | ---------------- | ------------- |
| 1 | IMDb User Rating               | `imdb`           | 0–10          |
| 2 | Rotten Tomatoes Audience Score  | `popcorn`        | 0–100         |
| 3 | Metacritic User Score           | `metacriticuser` | 0–10          |
| 4 | Letterboxd                     | `letterboxd`     | 0–5           |
| 5 | Trakt                          | `trakt`          | 0–100         |
| 6 | TMDB Audience Score             | `tmdb`           | 0–100         |

**Important:** MDbList also returns `tomatoes` (critics Tomatometer) and `metacritic` (critics score) — we explicitly filter these OUT. We only use the audience/user variants listed above.

### Calculation

1. Use MDbList's pre-normalized `score` field (0–100) for each source. Fall back to manual normalization of `value` only if `score` is missing.
2. Require **minimum 2 sources** to display a ReelScore. Titles with 0–1 sources are not shown.
3. Average all available normalized scores = **Base ReelScore**.
4. Apply personalization adjustments (see below) = **Personalized ReelScore** (logged-in users only).
5. Clamp final score to 0–100.

### Score Display Colors

| Range    | Color                   |
| -------- | ----------------------- |
| 0–59     | Red                     |
| 60–69    | Yellow                  |
| 70–84    | Green                   |
| 85–100   | Green with star/sparkle |

### Score Caching (KV)

- Cache MDbList API responses in Cloudflare KV.
- TTL strategy varies by title age:
  - **In theaters / airing now:** 24 hours
  - **Released within last 6 months:** 3 days
  - **Older titles:** 7 days
- Users can manually refresh any title's score from the card "..." menu (bypasses cache, writes fresh). **Auth required.** Throttled to one refresh per title per user per 15 minutes — enforced server-side via KV key (`refresh:{user_id}:{tmdb_id}` with 15-minute TTL). Returns 429 if cooldown hasn't elapsed. Anonymous users see cached scores only.

---

## Personalization System

### Overview

Personalization adjusts the Base ReelScore up or down based on the user's preference profile. The system is deterministic and transparent — adjustments come only from genre, actor, and director preferences.

### Preference Sources

1. **Onboarding** — user selects liked/disliked genres, actors, directors (binary like/dislike). Also rates 10–20 popular titles (thumbs up/down).
2. **Ongoing title ratings** — thumbs up/down on any title extracts its genres, top-billed actors, and director as implicit preference signals.

Both sources feed the same preference profile. Onboarding is skippable but recommended. Can be revisited from profile page.

### Confidence Weights

Each genre/actor/director preference has a **confidence weight**:

- Starts at **1.0** on first signal (onboarding selection or first title rating).
- Grows with confirming signals: `weight = 1.0 + (log2(confirming_ratings + 1) × 0.25)`
- **Capped at 1.5** — diminishing returns prevent runaway weights.
- Contradicting ratings (e.g., thumbs-down on a title in a liked genre) **decrease** the weight, allowing the system to self-correct.

Example progression:
- Onboarding like only: weight = 1.0
- 1 confirming title rating: weight ≈ 1.25
- 3 confirming ratings: weight ≈ 1.5 (cap)
- 20 confirming ratings: weight = 1.5 (cap holds)

### Score Adjustments

**Genre adjustments:**
- Up to **3 matched genres** per title.
- Each match: **+/-1 point** (liked genre = +1, disliked = -1).
- When a title matches more than 3 user-preferred genres, the **top 3 by confidence weight** get the slots.
- **Genre max: +/-3 points.**

**Actor/Director adjustments:**
- Up to **3 matched people** per title (any combination of actors and directors).
- Each match: **+/-2 points** (liked = +2, disliked = -2).
- When a title matches more than 3 user-preferred people, the **top 3 by confidence weight** get the slots.
- **People max: +/-6 points.**

**Total max personalization swing: +/-9 points**, clamped to 0–100.

### What Thumbs Up/Down on Titles Does

When a user rates a title, the system:
1. Extracts the title's genres, top-billed actors, and director from TMDB metadata (already cached).
2. For each extracted attribute that exists in the user's preference profile, adjusts the confidence weight (up for confirming, down for contradicting).
3. For each extracted attribute NOT in the user's preference profile, adds it as a new preference at weight 1.0.
4. Does **NOT** propagate score changes to "similar" titles via TMDB's similar endpoint.

The thumbs on titles feed the **preference profile**, not individual title scores. Over time, ratings make the personalization smarter by differentiating which genres/actors/directors the user truly cares about.

### "Scored for You" Feed

- Logged-in users only.
- Surfaces titles with highest **positive** personalization adjustments (i.e., titles that benefit most from the user's preference profile).
- Only shows titles with a personalized ReelScore of 70+.
- Ordered by personalization delta descending (biggest positive swing first), then by Base ReelScore descending.

---

## Features

### Discovery Feed (Home Page)

- **Single unified feed** — page 1 blends Trending + Now Playing + On The Air + Upcoming from TMDB, deduplicates by TMDB ID, sorts by popularity. Pages 2+ use TMDB's Popular endpoints (`movie/popular` + `tv/popular`) for deep pagination with a much larger content pool.
- No separate sections or tabs — one continuous, infinitely-scrolling feed.
- Scored for You feed (logged-in only) is a future addition (Build Order Step 11).
- All feeds are **URL-param driven**: active filters update URL, fully shareable/bookmarkable.
- Clicking a title card opens its detail modal inline (no page navigation, preserves scroll position).

### Sticky Header

Lives across all pages. Contains:
- Search input
- Media type toggle (All / Movies / TV Shows)
- Genre filter dropdown
- Sort options (ReelScore, Release Date, Popularity)
- Streaming platform filter (popular platforms default, customizable for logged-in users)

All filter state syncs to URL params and applies site-wide.

### Title Card

- **Score badge:** Perfectly round circle, centered, overlapping the top of the poster. Displays ReelScore (color-coded), clock icon (unreleased), or "—" (insufficient sources). Translucent `bg-black/40` background for no-score/unreleased titles. Thumbs up/down buttons are on the modal view, not the card.
- **Unreleased titles:** If a title's release date is in the future, show a **clock icon** (Lucide `Clock` inline SVG) in the score badge instead of a score.
- **Below poster:** Title (single line, truncated with ellipsis).
- **Below title:** Type badge (`badge-secondary` for both Movie and TV) + year.
- **Poster overlay, bottom-right:** "..." menu button. Opens options overlaid along the right side of the poster, expanding upward: Refresh Score (auth only), Share, Hide.
- **Refresh Score button behavior:** On click, icon swaps to spinner while fetching. On completion, icon swaps to a **lock icon** for the duration of the 15-minute cooldown. Lock conveys "recently refreshed, try later." After cooldown expires, reverts to refresh icon. If not logged in, clicking prompts sign-up/login.
- **Watchlist button:** Visible to all users. If not logged in, clicking prompts sign-up/login.
- All card actions carry over to the modal view.

### Title Modal

Opened inline from any title card. Contains:
- Full title, rating, runtime, ReelScore (with score pill), genres (with like/dislike buttons on genre badges), director (with like/dislike over image), cast (with like/dislike over images).
- Seasons list (TV shows).
- Trailer button (opens video modal).
- All card actions (thumbs, watchlist, share, hide, refresh).
- Clicking an actor or director closes modal and updates discovery feed to show their filmography.
- Modal is URL-param driven (e.g., `?title=12345`) so it can be shared/bookmarked and opens on page load.

### Onboarding

- Shown after sign-up, skippable.
- Steps:
  1. Genre selection (top genres, like/dislike as many as desired).
  2. Actor selection (popular actors, like/dislike).
  3. Director selection (popular directors, like/dislike).
  4. Title rating (10–20 popular movies and TV shows from top 100, thumbs up/down).
- Can be revisited and modified from Profile page.
- "Scored for You" feed activates once preferences exist.

### Watchlist

- Save any title from any view.
- Not-logged-in users see the watchlist icon but clicking prompts sign-up/login.
- **In-app notifications (v1):** Badge/indicator on watchlist icon when:
  - A watchlisted title's score changes by **5+ absolute points**.
  - A watchlisted title is added to one of the user's selected streaming platforms.
- Notification types can be toggled on/off in Profile.
- Push notifications deferred to v1.1.

### Notification Detection Strategy

Notifications are detected **lazily**, not via background cron jobs:

- On any **authenticated page load**, run a lightweight watchlist check for that user:
  1. Read the user's watchlisted `tmdb_id`s and their `last_known_score` from D1.
  2. For each, read the current `base_reelscore` from the score cache metadata table in D1.
  3. If the delta is ≥5 absolute points, generate a notification row and update `last_known_score`.
  4. For streaming availability: compare the title's current providers (from TMDB cache in KV) against the user's selected platforms. New match = notification.
- This approach means **zero background compute** when nobody's active. Notifications appear the moment the user visits, which is fine since there's no push delivery mechanism in v1.
- Performance: bounded by watchlist size per user (unlikely to exceed 50–100 titles). All comparisons are integer ops against D1/KV — fast.

### Score Transparency (Dev Mode)

- **Dev only** (`import.meta.env.DEV`) — not exposed to production users. The ReelScore is a single number; users don't need to see the formula.
- Hover any ReelScore badge to see a tooltip breakdown of all source scores (e.g., "IMDb: 88 | RT: 80 | Metacritic: 67 | Letterboxd: 86 | Trakt: 87 | TMDB: 84").
- If logged in, also shows personalization adjustment metrics (future).

### Hidden Titles

- Any title can be hidden from the "..." menu.
- Hidden titles don't appear in feeds.
- Manage (unhide) from Profile page.

---

## Data Model (Drizzle Schema Outline)

### Users (managed by Better Auth + extended)
- `id`, `email`, `name`, `avatar_url`, `created_at`, `updated_at`
- Better Auth manages core auth fields. We extend with:
  - `onboarding_completed` (boolean)
  - `streaming_platforms` (JSON array of platform IDs)
  - `notification_prefs` (JSON: `{ score_change: boolean, streaming_added: boolean }`)

### User Preferences
- `id`, `user_id`, `type` (genre | actor | director), `tmdb_id`, `name`, `sentiment` (like | dislike), `weight` (float, 1.0–1.5), `confirming_count` (int), `created_at`, `updated_at`

### User Title Ratings
- `id`, `user_id`, `tmdb_id`, `media_type` (movie | tv), `rating` (up | down), `created_at`

### User Watchlist
- `id`, `user_id`, `tmdb_id`, `media_type`, `last_known_score` (int), `created_at`

### User Hidden Titles
- `id`, `user_id`, `tmdb_id`, `media_type`, `created_at`

### Notifications (in-app)
- `id`, `user_id`, `tmdb_id`, `type` (score_change | streaming_added), `message`, `read` (boolean), `created_at`

### Score Cache Metadata (D1, supplements KV)
- `tmdb_id`, `media_type`, `base_reelscore` (int), `source_count` (int), `last_fetched_at`, `release_date`
- Actual score breakdown data lives in KV (keyed by `scores:{tmdb_id}`). This table enables queries like "titles with score > X" without reading KV.

---

## API Endpoints

### Public (no auth)
- `GET /api/feed?type=movie|tv|all&page=X` — Unified discovery feed (HTMX partial). Uses TMDB Popular endpoints for deep pagination. Scores cached in KV (parallel read), uncached titles fetched from MDbList in rate-limited batches.
- `GET /api/search?q=X&type=X&genre=X&page=X` — Search results (HTMX partial)
- `GET /api/title/{tmdb_id}?type=movie|tv` — Title modal content (HTMX partial)
- `GET /api/scores/{tmdb_id}?type=movie|tv` — Score breakdown JSON

### Auth Required
- `POST /api/scores/{tmdb_id}/refresh` — Force-refresh score (bypasses cache). Throttled: 1 per title per user per 15 min via KV key. Returns 429 + `retry_after` seconds if cooldown active.
- `GET /api/feed?section=scored-for-you` — Personalized feed (HTMX partial)
- `POST /api/watchlist` — Add to watchlist `{ tmdb_id, media_type }`
- `DELETE /api/watchlist/{tmdb_id}` — Remove from watchlist
- `POST /api/ratings` — Rate a title `{ tmdb_id, media_type, rating: "up"|"down" }`
- `DELETE /api/ratings/{tmdb_id}` — Remove rating
- `POST /api/preferences` — Update preference `{ type, tmdb_id, name, sentiment }`
- `DELETE /api/preferences/{id}` — Remove preference
- `POST /api/titles/{tmdb_id}/hide` — Hide a title
- `DELETE /api/titles/{tmdb_id}/hide` — Unhide
- `GET /api/notifications` — Get unread notifications
- `POST /api/notifications/read` — Mark notifications as read
- `ALL /api/auth/*` — Better Auth catch-all handler

---

## Build Order

Even though everything is v1, build in this sequence so each layer has its foundation:

1. **Project scaffold** — Astro + Cloudflare adapter + Tailwind + Basecoat + Drizzle + D1/KV bindings. Get a blank page deployed to Workers.
2. **Score engine** — MDbList API integration, score normalization, ReelScore calculation, KV caching, score refresh. Build `scoring.ts` and `mdblist.ts`. Get real scores displaying on a page before anything else.
3. **TMDB integration** — Metadata fetching (title details, cast, genres, images, streaming availability), KV caching. Build `tmdb.ts`.
4. **Discovery feeds** — Home page with Trending, New Releases, In Theaters sections. Title cards. Infinite scroll. HTMX partials. URL-param filter state.
5. **Title modal** — Detail view with score, metadata, cast, genres, trailer. URL-param driven (`?title=X`).
6. **Sticky header** — Search, filters, sort, media type toggle. Wire to URL params and feed endpoints.
7. **Auth** — Better Auth with email/password + Google + Apple OAuth. Login, signup, session management. Confirm auth works end-to-end before building personalization.
8. **Personalization engine** — Preference data model, confidence weights, score adjustment logic. Build `personalization.ts`.
9. **Onboarding** — Genre/actor/director selection + title rating flow. Onboarding titles pulled from TMDB top-rated (20 movies + 20 TV shows, cached in KV with 7-day TTL).
10. **Thumbs up/down on titles** — Rating UI on cards and modal, preference profile updates.
11. **Scored for You feed** — Personalized recommendations section.
12. **Watchlist** — Save/remove titles, watchlist page.
13. **In-app notifications** — Score change detection, streaming availability changes, notification badge.
14. **Profile page** — Manage preferences, hidden titles, streaming platforms, notification settings.
15. **Polish** — Score transparency hover (dev mode), share functionality, edge cases, performance.

---

## Design Direction

- Sleek, modern, confident. Think premium streaming app, not generic dashboard.
- Dark mode primary (media content looks best on dark backgrounds).
- Score colors are the primary accent palette (red/yellow/green/gold).
- Poster-forward design — large images, minimal chrome around them.
- The ReelScore pill is the signature UI element. It should feel distinctive and instantly recognizable.
- Mobile-first responsive design.
- Basecoat components provide the foundation. Custom styling only where the brand needs to differentiate (score pill, title card layout, feed sections).

---

## External API Notes

### MDbList API
- **Paid plan** — provides **all 6 audience scores** per title, including the TMDB audience score.
- MDbList is the **sole source for all score data**. We do NOT hit TMDB for scores.
- **Base URL:** `https://api.mdblist.com` — uses path-based routing, NOT query parameters.
- **Lookup format:** `GET /tmdb/movie/{tmdb_id}?apikey=KEY` or `GET /imdb/show/{imdb_id}?apikey=KEY`
  - Media type in path: `movie` or `show` (not `tv`).
  - The old query-parameter format (`?tm=123&m=movie`) is deprecated and returns the API homepage.
- **Response:** Each title returns a `ratings` array. Each rating has `source`, `value` (raw scale), `score` (pre-normalized 0–100), and `votes`.
- **Rate limits:** Depend on supporter tier. Check via `GET /user`. Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Exceeding returns 429. Batched fetching (4 concurrent, 250ms delay) works reliably.
- **Risk:** Single point of failure for score data. No fallback currently. If MDbList goes down, scores can't refresh (cached scores still display). Consider diversification strategy in v2.

### TMDB API
- Free tier with API key.
- Used for: title metadata, images, cast/crew, genres, streaming availability (watch providers), search, and onboarding title lists (top-rated movies + TV).
- **NOT used for scores** — all scores come from MDbList.
- Streaming availability data comes from TMDB's watch/providers endpoint — quality varies by region but is acceptable for U.S. content.
- **Not used for:** similar/related title recommendations (deferred).

---

## Code Style

- TypeScript everywhere (Astro components, API endpoints, lib files).
- Explicit, readable code over clever abstractions.
- Inline markup solutions preferred over code-behind helpers where practical.
- No console.log in production code — use structured logging if needed.

### Code Comments

Code should be thoroughly commented so **any developer** can understand what's happening:

- **Every function** gets a JSDoc comment: what it does, params, return value, and any non-obvious behavior.
- **Business logic** gets inline comments explaining **why**, not what. E.g., `// Cap at 1.5 to prevent runaway personalization — see CLAUDE.md Personalization System` not `// set max to 1.5`.
- **Section headers** in longer files to break up logical blocks (e.g., `// --- Score Normalization ---`).
- **Non-obvious decisions** get a comment explaining the reasoning or linking to the relevant CLAUDE.md section.
- **Do not** comment the obvious. `counter++; // increment counter` is noise.

### Testing

- **Test framework:** Vitest.
- **What to test:**
  - All business logic in `src/lib/` — scoring engine, personalization calculations, confidence weight formulas, slot prioritization, score clamping. These are pure functions and the core product logic. If they break, every score is wrong.
  - API endpoint contracts — correct response shapes, HTTP status codes, auth/unauth behavior.
- **What NOT to test in v1:**
  - E2E browser tests (Playwright, Cypress) — too brittle while UI is actively iterating.
  - HTMX partial rendering or Alpine UI state — too coupled to markup.
  - Third-party API integrations (MDbList, TMDB) — mock them in unit tests.
- **Tests must pass before any PR is merged.**
- **Write tests alongside code**, not as a follow-up step. When building `scoring.ts`, write `scoring.test.ts` in the same session.

---

## Developer Experience

### The owner of this project is a beginner developer.

Claude Code should:
- **Explain terminal commands before running them.** Don't just say "run `npx drizzle-kit push`" — explain what it does, what it expects, and what the output means.
- **Provide step-by-step setup instructions** for any new tooling (Wrangler, Drizzle CLI, Better Auth CLI, etc.).
- **Don't assume familiarity** with Cloudflare dashboard, D1 management, KV namespace creation, or Workers deployment. Walk through it.
- **When errors occur**, explain what the error means and why it happened before suggesting a fix.
- **Confirm before running destructive commands** (database migrations, deployments, deleting resources).

### Development Environment

- **macOS** — using Claude Code Desktop app and/or VS Code with Claude Code extension.
- **Package manager:** bun.
- **Local dev:** `wrangler dev` for local Workers development with D1/KV bindings.

---

## PR & Documentation Workflow

### When to create a PR:

A Pull Request is required for any change that affects:
- **Data model** (new tables, schema changes, migrations)
- **Scoring or personalization logic** (calculation changes, weight formula, cap adjustments)
- **API contracts** (new endpoints, changed request/response shapes)
- **Auth flow** (provider changes, session handling)
- **Architecture** (new dependencies, infrastructure changes)

Feature additions that follow existing patterns (new feed section, new filter option, UI tweaks) can go direct to main with a clear commit message.

### Documentation sync — MANDATORY:

**Every PR must include updates to CLAUDE.md and README.md** that reflect the changes being made. These are not follow-up tasks — they ship in the same PR as the code. If the scoring formula changes, CLAUDE.md's Personalization System section updates in that PR. If a new API endpoint is added, it appears in the API Endpoints section in that PR.

The goal: **CLAUDE.md is always the source of truth.** If someone reads this file, they understand how the app works right now, not how it worked three PRs ago.
