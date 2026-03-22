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
- **No build tooling beyond Astro.** No Webpack, no custom bundler config. Astro (built on Vite) handles the build pipeline. Only add Vite plugins when required by the stack (e.g., `@tailwindcss/vite` for Tailwind v4).
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
│   │       ├── season/[id].ts  # Season episodes carousel (HTMX partial)
│   │       ├── scores/[id].ts  # Score data / refresh
│   │       ├── watchlist.ts    # Watchlist CRUD
│   │       ├── preferences.ts  # User preference updates
│   │       └── auth/[...all].ts # Better Auth catch-all handler
│   ├── components/             # Astro components
│   │   ├── TitleCard.astro     # Media card (poster + score pill + actions)
│   │   ├── TitleModal.astro    # Detail modal (rating, cast, trailer, etc.)
│   │   ├── ScoreBadge.astro    # ReelScore pill with color coding
│   │   ├── CuratedRow.astro    # Horizontal scrollable row (New Releases)
│   │   ├── StickyHeader.astro  # Search, filters, media type toggle, sort
│   │   ├── FeedSection.astro   # Feed section (grid with infinite scroll)
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
│   ├── tmdb.test.ts
│   ├── setup.test.ts
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
| 60–69    | Gold/Amber              |
| 70–100   | Green                   |

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

1. **Onboarding (required)** — user selects liked/disliked genres, actors, directors (binary like/dislike). Also rates 20 genre-aware popular titles (thumbs up/down). All 4 steps must be completed to activate the Scored for You feed. See Onboarding section for details.
2. **Ongoing title ratings** — thumbs up/down on any title extracts its genres, top-billed actors, and director as implicit preference signals.
3. **Profile editing** — users can add/remove individual genre, actor, and director preferences from the Profile page at any time. Manually added preferences start at weight 1.0. This is not a guided flow — it's direct preference management.

All three sources feed the same preference profile. Onboarding cannot be re-run after completion, but preferences remain editable via Profile and ongoing ratings.

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

- **Logged-in users with `onboarding_completed = true` only.** Users who haven't completed onboarding see a CTA prompt instead.
- **Candidate sourcing via TMDB Discover API** — generates a per-user candidate pool from the preference profile using three query dimensions, all fetched in parallel:
  1. **Genre query:** `/discover/movie` + `/discover/tv` with `with_genres` (pipe-separated, OR logic). Uses user's top 5 liked genres by confidence weight. 1 page per type = 40 candidates.
  2. **Actor query:** `/discover/movie` + `/discover/tv` with `with_people`. Uses user's top 3 liked actors by confidence weight. 1 page per type = 40 candidates.
  3. **Director query:** `/discover/movie` + `/discover/tv` with `with_people`. Uses user's top 3 liked directors by confidence weight. 1 page per type = 40 candidates.
- **Merge strategy:** Union all candidates from all dimensions, deduplicate by TMDB ID, remove titles the user has already rated or hidden.
- **Scoring:** Fetch scores for all candidates via `getScoresBatched` (inline MDbList fetch for cache misses — same rate-limited batching as the main feed). Calculate personalized ReelScore for each.
- **Filter:** Only keep titles with personalized ReelScore ≥ 70.
- **Sort:** By personalization delta descending (biggest positive swing first), then by Base ReelScore descending.
- **Display:** Horizontal scrollable row at the top of the home page (above curated rows), 20 titles max. Same `flex overflow-x-auto scrollbar-hide` pattern as episode/cast carousels. Same TitleCard components with scores.
- **Endpoint:** `GET /api/feed?section=scored-for-you` — returns HTMX partial (auth required). Can be lazy-loaded via HTMX on page load to avoid blocking SSR.
- **Caching:** Discover results cached in KV per user with 1-hour TTL (cache key: `scored-for-you:{user_id}`). Individual title scores use existing KV cache.

---

## Features

### Discovery Feed (Home Page)

**Hybrid layout** — one curated horizontal row at the top, blended infinite scroll grid below.

#### Scored for You Row (logged-in only)
- Appears at the very top of the page for logged-in users with `onboarding_completed = true`. See "Scored for You" Feed in Personalization System for full spec.
- Users without completed onboarding see a CTA prompt instead.

#### New Releases Row
- **1 curated row** below Scored for You (or at the top for anonymous users):
  - **New Releases** — `getNewReleaseMovies()` + `getNewReleaseTV()` blended by popularity. Movies use TMDB Discover with `region=US` + `release_date` (45-day lookback, 7-day lookahead). TV uses Discover with `watch_region=US` + `first_air_date` (6-month lookback, 7-day lookahead — only genuinely new shows, not long-running series with recent episodes). Both use `vote_count.gte=10` to filter zero-audience content and `sort_by=popularity.desc`.
- **20 titles**, horizontally scrollable (`flex overflow-x-auto scrollbar-hide`).
- Scored via `getScoresBatched` (combined with grid items into a single batch call).
- Uses TitleCard components (same as grid cards).
- **SSR only** (rendered on page 1) — no HTMX pagination for rows.

#### Blended Infinite Scroll Grid (Trending + Discover)
- Below the curated row. Grid page 1 is **seeded with trending/week** items first (cultural moments — big premieres, viral hits, final seasons), then filled with TMDB Discover results sorted by popularity. Page 2+ is pure Discover. This ensures the top of the grid feels culturally relevant while Discover provides deep pagination for infinite scroll.
- **Trending:** `getTrending()` fetches `/trending/all/week` (2 pages, ~40 items). Items appear in TMDB's trending order (not re-sorted). Filtered to movies/TV only (excludes "person" results). Anime is post-filtered: titles with `original_language === "ja"` AND Animation genre (16) are excluded — trending is a global signal and anime has disproportionate TMDB engagement worldwide, crowding out US-relevant content. Western animation (Pixar, Disney) and non-anime Japanese content pass through.
- **Discover:** Uses TMDB Discover endpoints (`/discover/movie` + `/discover/tv`) with `watch_region=US` and `sort_by=popularity.desc`. No language filter — non-English titles with US distribution (Squid Game, Parasite, etc.) appear naturally. `vote_count.gte=10` filters zero-audience content. TV excludes News (10763) and Talk (10767) genres — daily programs that inflate popularity but aren't discovery-worthy.
- **Cross-deduplicated:** All TMDB IDs from the New Releases row + grid page 1 (trending + discover) are filtered out of page 2+. Page 2+ grid requests accept an `exclude` param (comma-separated TMDB IDs).
- **60 items per page** — the LCM of all grid column counts (2,3,4,5,6) so every row is always full at every responsive breakpoint. For "all" type: 2 TMDB pages per type (80 blended → top 60). For single type: 3 TMDB pages (60 items). All TMDB fetches run in parallel.
- Capped at **10 pages** (600 titles) to prevent DOM bloat. Scroll sentinels use HTMX `intersect` trigger (IntersectionObserver-based) — NOT `revealed`, which fires on DOM insertion and causes runaway loading.

#### SSR Page 1 Data Flow
- Fetch New Releases row + trending (2 pages) + grid page 1 **all in parallel** (10 TMDB calls total).
- Score all items via a single `getScoresBatched` call (curated + grid combined).
- Render: Scored for You row (if applicable) → New Releases row → grid with sentinel.

#### General
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

Opened inline from any title card. Two-section layout:

**Backdrop header overlay** — backdrop image (`aspect-video`) with gradient, contains:
- **Close button** (top-left) and **ReelScore pill** (top-right, `size-20 text-xl`).
- **Title logo:** TMDB logo art (English, white via `brightness-0 invert`) replaces the text title when available. Falls back to plain `<h2>` text if no logo exists. Logos cached in KV (7-day TTL).
- Metadata row: plain text with bullet separators — "TV Show • 2003 • TV-14" or "Movie • 1999 • 2h 19m • R". Runtime only shown for movies. Content rating uses a bordered badge (`border-white/60 font-bold`).
- Genre badges (frosted glass style: `badge-secondary bg-white/10 backdrop-blur`).
- Overview clamped to 2 lines. Clicking the clamped text opens a full overview modal.
- Trailer button (opens YouTube embed modal) + streaming provider logos (inline, left-aligned).
- **Streaming providers:** Deduplicated by base service name (strips channel suffixes like "Amazon Channel", "Apple TV Channel", "Roku Premium Channel", tier names like "Premium"/"Essential", and normalizes "Plus" → "+"). Capped at 6 max.
- Title info content constrained to `max-w-md`.

**Scrollable body** — contains:
- **Seasons** (TV shows): Horizontal season pill selector. Clicking a pill lazy-loads that season's episodes via HTMX into a horizontal carousel below. Previously loaded seasons are cached in Alpine state to avoid re-fetching.
- **Episode detail modal:** Clicking any episode card opens a detail modal with the episode still image as background (faded with gradient), show title, season/episode number, episode title, air date, runtime, and full description.
- Cast row with actor images and character names.
- Director (with like/dislike over image).
- All card actions (thumbs, watchlist, share, hide, refresh).
- Clicking an actor or director closes modal and updates discovery feed to show their filmography.
- Modal is URL-param driven (e.g., `?title=12345`) so it can be shared/bookmarked and opens on page load.

### Onboarding

- Shown after sign-up. **All 4 steps are required** — cannot skip steps.
- Steps must be completed in order:
  1. **Genre selection** — top genres, like/dislike. Minimum 3 selections required.
  2. **Actor selection** — popular actors, like/dislike. Minimum 3 selections required.
  3. **Director selection** — popular directors, like/dislike. Minimum 3 selections required.
  4. **Title rating** — 20 genre-aware titles (thumbs up/down, can skip individual titles). Minimum 5 ratings required. Title pool is influenced by genres selected in Step 1: uses TMDB Discover with `with_genres` + `sort_by=vote_average.desc` + `vote_count.gte=500` to present titles matching the user's genre preferences (mix of movies + TV).
- `onboarding_completed` is set to `true` only after all 4 steps are finished.
- **Not re-runnable** — onboarding cannot be restarted after completion.
- **Preferences editable from Profile** — individual genres, actors, and directors can be added, removed, or changed from the Profile page at any time (not as a guided flow). Manually added preferences start at weight 1.0.
- **"Scored for You" feed activates only when `onboarding_completed = true`.** Users who haven't completed onboarding see a CTA prompt where Scored for You would appear.

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

## Monetization

### Ad System

- **Placement:** Every 9th item in the discovery feed grid, occupying a regular grid cell.
- **Appearance:** Native-style — same card dimensions as title cards, blends into grid layout. Should feel like a natural part of the feed, not a disruptive banner.
- **Labeling:** Clear "Sponsored" badge (small, subtle but visible) on ad cards for FTC compliance and user transparency.
- **Provider:** Undecided — implementation should be provider-agnostic. Ad slots render a container div that any provider's SDK can fill (Google AdSense, Carbon Ads, etc.).
- **Feed integration:** Ad slots are inserted server-side during HTML rendering in the feed API (`/api/feed`), not via client-side injection. This keeps the grid layout consistent and avoids layout shifts.
- **Loading:** Ads lazy-load like title cards — no upfront heavy SDK download.

### Premium Tier (Future)

- Ad-free experience for premium/paid users.
- Free and anonymous users see ads in the feed.
- Premium check happens server-side when rendering feed — ad slots simply aren't inserted for premium users.
- Pricing, payment provider, and additional premium features TBD.

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
- `GET /api/feed?type=movie|tv|all&page=X&exclude=id1,id2,...` — Blended grid feed (HTMX partial). Uses TMDB Discover endpoints (`watch_region=US`, no language filter) for deep pagination. Optional `exclude` param filters out TMDB IDs already shown in the New Releases row (cross-deduplication). Scores cached in KV (parallel read), uncached titles fetched from MDbList in rate-limited batches.
- `GET /api/search?q=X&type=X&genre=X&page=X` — Search results (HTMX partial)
- `GET /api/title/{tmdb_id}?type=movie|tv` — Title modal content (HTMX partial)
- `GET /api/season/{tv_id}?season=N&show=ShowTitle` — Season episodes carousel (HTMX partial)
- `GET /api/scores/{tmdb_id}?type=movie|tv` — Score breakdown JSON

### Auth Required
- `POST /api/scores/{tmdb_id}/refresh` — Force-refresh score (bypasses cache). Throttled: 1 per title per user per 15 min via KV key. Returns 429 + `retry_after` seconds if cooldown active.
- `GET /api/feed?section=scored-for-you` — Personalized feed (HTMX partial). Requires `onboarding_completed = true`. Uses TMDB Discover to source candidates from user's preference profile (genres, actors, directors). Inline MDbList fetch for cache misses. Discover results cached in KV per user (1-hour TTL).
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

Even though everything is v1, build in this sequence so each layer has its foundation.

**Progress:** Steps 1–5 are complete. Steps 6–16 are not started.

1. ~~**Project scaffold**~~ — Astro + Cloudflare adapter + Tailwind + Basecoat + Drizzle + D1/KV bindings. Deployed to Workers. **Done.**
2. ~~**Score engine**~~ — MDbList API integration, score normalization, ReelScore calculation, KV caching, score refresh. `scoring.ts` and `mdblist.ts` with tests. **Done.**
3. ~~**TMDB integration**~~ — Metadata fetching (title details, cast, genres, images, streaming availability), KV caching. `tmdb.ts` with full endpoint coverage. **Done.**
4. ~~**Discovery feeds**~~ — Hybrid home page: New Releases curated row (Discover movies + TV, US-filtered, quality-filtered) at top, blended Discover grid below. Cross-deduplication between row and grid. Title cards. HTMX partials. URL-param filter state. **Done.**
5. ~~**Title modal**~~ — Detail view with score, metadata, cast, genres, trailer, seasons/episodes. URL-param driven (`?title=X`). Alpine store state. **Done.**
6. **Sticky header + Search** — StickyHeader.astro with search input, media type toggle, genre filter, sort options, streaming platform filter. Build `search.astro` page and `/api/search` endpoint. Wire all filter state to URL params.
7. **Auth** — Build `db.ts` (Drizzle client factory) and `auth.ts` (Better Auth instance factory). Create database schema tables (users, preferences, ratings, watchlist, hidden titles, notifications). Login/signup pages, OAuth callback, `/api/auth/*` catch-all. Confirm auth works end-to-end before building personalization.
8. **Personalization engine** — Preference data model, confidence weights, score adjustment logic. Build `personalization.ts`.
9. **Onboarding** — All 4 steps required (genres, actors, directors, title ratings). Title rating step uses genre-aware selection via TMDB Discover (titles matching user's chosen genres). Minimums enforced per step. `onboarding_completed` gates Scored for You access. Not re-runnable; preferences editable from Profile.
10. **Thumbs up/down on titles** — Rating UI on cards and modal, preference profile updates.
11. **Scored for You feed** — TMDB Discover-based per-user candidate pool (genre, actor, director dimensions). Union + deduplicate + personalized score sort. Horizontal row at top of home page. Requires `onboarding_completed`. Discover results cached in KV per user (1-hour TTL).
12. **Watchlist** — Save/remove titles, watchlist page.
13. **In-app notifications** — Score change detection, streaming availability changes, notification badge.
14. **Profile page** — Manage preferences, hidden titles, streaming platforms, notification settings.
15. **Polish** — Score transparency hover (dev mode), share functionality, edge cases, performance.
16. **Monetization** — Native ad slots in feed grid (every 9th item), provider-agnostic container, premium ad-free tier.

---

## Design Direction

- Sleek, modern, confident. Think premium streaming app, not generic dashboard.
- Dark mode primary (media content looks best on dark backgrounds).
- Score colors are the primary accent palette (red/gold/green).
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
- **Rate limits:** Depend on supporter tier. Check via `GET /user`. Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Exceeding returns 429. Batched fetching uses 2 concurrent requests with 500ms delay between batches, plus automatic retry-once on 429 with backoff.
- **Risk:** Single point of failure for score data. No fallback currently. If MDbList goes down, scores can't refresh (cached scores still display). Consider diversification strategy in v2.

### TMDB API
- Free tier with API key.
- Used for: title metadata, images, cast/crew, genres, streaming availability (watch providers), search, onboarding title lists (genre-aware via Discover), and Scored for You candidate sourcing (Discover with `with_genres` and `with_people`).
- **NOT used for scores** — all scores come from MDbList.
- Streaming availability data comes from TMDB's watch/providers endpoint — quality varies by region but is acceptable for U.S. content.
- **Trending API** used for: seeding the top of the Discover grid with `/trending/all/week` (cultural moments, big premieres, viral hits). Shallow endpoint (~40 titles) — not for deep pagination.
- **Discover API** used for: New Releases curated row (movies with `region=US` + `release_date`, TV with `watch_region=US` + `first_air_date`), Discover grid deep pagination (movies + TV with `watch_region=US`, `vote_count.gte=10`, TV excludes News/Talk genres), Scored for You candidate pool (genre/actor/director queries), and onboarding title rating step (genre-aware selection). No language filter on any Discover call — non-English titles with US distribution appear naturally.
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
