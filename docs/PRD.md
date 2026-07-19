# ReelScore — Product Requirements

> Watch what you like, not what the critics like.

ReelScore aggregates **audience-only** scores from 6 sources into a single 0–100
score for movies and TV shows. U.S. releases only. Personalized to your taste
over time (post-MVP). Live at getreelscore.com.

Visual baseline: **native shadcn/ui (nova preset), dark theme by default**. The
one sanctioned custom visual is the SVG score lip (see Title Card). Custom
branding/identity is a post-MVP polish task.

## 1. Score engine

### Philosophy (locked in)

ReelScore is **mostly objective**. Anonymous users see the public **Base
ReelScore**. Logged-in users (post-MVP) see **Personalized ReelScore = Base +
personalization swing** (max ±9). Personalization never rewrites the public
score.

### Sources

All 6 audience-only scores come via the **MDbList API** (paid plan). Exact keys:

| # | Source                         | MDbList key        | Raw scale |
|---|--------------------------------|--------------------|-----------|
| 1 | IMDb User Rating               | `imdb`             | 0–10      |
| 2 | Rotten Tomatoes Audience Score | `tomatoesaudience` | 0–100     |
| 3 | Metacritic User Score          | `metacriticuser`   | 0–10      |
| 4 | Letterboxd                     | `letterboxd`       | 0–5       |
| 5 | Trakt                          | `trakt`            | 0–100     |
| 6 | TMDB Audience Score            | `tmdb`             | 0–100     |

Critic scores (`tomatoes`, `metacritic`, …) are explicitly ignored.

### Base ReelScore calculation (objective, same for everyone)

1. Require **minimum 2 valid sources**.
2. Normalize each source to 0–100 (0–10 scales ×10, 0–5 scale ×20 — implemented
   in `app/lib/scoring.ts`).
3. Apply **source-specific base weights** × **vote_factor** (log-scaled,
   bounded 0.85–1.10):

   | Source             | Base weight | Rationale |
   |--------------------|-------------|-----------|
   | `tomatoesaudience` | 1.40        | Strongest verified audience signal |
   | `letterboxd`       | 1.05        | High-quality cinephile signal |
   | `imdb`             | 0.95        | Large sample, known skew |
   | `trakt`            | 0.85        | Engaged watchers |
   | `tmdb`             | 0.80        | Good coverage |
   | `metacriticuser`   | 0.75        | Thinnest coverage |

4. Weighted average = `Σ(normalized × effective_weight) / Σ(effective_weights)`.
5. Apply **reliability adjustment** (−3 to +3) based on source count, vote
   support, and freshness → **Base ReelScore** (clamped 0–100).

**The math in `app/lib/scoring.ts` is LOCKED.** It ports byte-identical from the
Astro app and must never change without an explicit owner request. Vitest
coverage is mandatory.

### Score display

- **Tiers:** green 70+, amber 60–69, red 0–59, neutral for no score/unreleased.
- **Caching:** score payloads (including the full breakdown object) live in
  **D1** (`scores` table). TTL enforced in code by title age:
  in theaters/airing = 24h; released < 6 months = 3 days; older = 7 days.
- **Manual refresh** (auth required, post-parity): one refresh per title per
  user per 15 minutes, enforced via KV cooldown key; 429 on cooldown.
- **Dev-mode transparency:** in dev builds, the score badge shows the full
  breakdown (per-source normalized scores, weights, vote factors, reliability
  adjustment). Never exposed in production.

## 2. Discovery feed (home page)

**Single grid, one TMDB Discover query per view** (rebuilt design — the old
6-source blend was retired as overcomplicated; see DECISIONS 2026-07-19).

- **Controls, URL-param driven (shareable/bookmarkable):**
  - Media tabs: All / Movies / TV Shows (`?type=`)
  - Sort lens: Popular / Top Rated / New Releases / Upcoming (`?sort=`)
- Each (type, sort) pair maps to exactly one Discover query. "All" runs the
  movie + TV queries and interleaves by popularity (Upcoming/New Releases lens:
  movie-oriented; TV uses air-date equivalents).
- **Tuned content filters (all queries):** `certification_country=US` (+
  `certification.lte=R` for movies), `include_adult=false`, monetization
  `flatrate|free|ads` where watch_region is used, vote-count floors, TV
  excludes News (10763) and Talk (10767), 2-year first-air lookback for popular
  TV. **Anime filter:** `original_language === "ja"` AND Animation genre (16)
  excluded globally. No language filter — international titles with US
  distribution appear naturally.
- **Pagination:** native TMDB pages; each scroll batch fetches 3 TMDB pages
  (~60 items — LCM of grid column counts, keeps rows full at all breakpoints).
  Infinite scroll via IntersectionObserver sentinel, capped at 10 batches.
  A client-side `Set` of seen IDs drops duplicates caused by popularity shifts
  between fetches (reset when type/sort changes).
- Clicking a card opens the title modal inline — no navigation, scroll
  position preserved.

## 3. Title card

- Poster with **score lip**: small gradient tab, top-right, concave SVG curves,
  showing the score, a clock icon (unreleased), or "—" (insufficient sources).
  Vertical tier gradient (green/amber/red/neutral 500→800) with matching
  poster top border. SVG gradient IDs namespaced per card.
- Below poster: title (single line, ellipsis), then "Movie • 2026" /
  "TV Show • 2025" metadata line.
- Card actions (watchlist, share, refresh, hide) return post-parity; thumbs
  live on the modal.

## 4. Title modal

Opened inline from any card; URL-param driven (`?title=12345&type=movie`) so it
can be shared and opens on page load.

- **Backdrop header:** backdrop image with gradient; larger score lip; close
  button; TMDB title logo (first English logo, original colors, `<h2>` text
  fallback); metadata row ("Movie • 1999 • 2h 19m • R" — runtime movies only);
  genre badges; overview clamped to 2 lines (click to expand); trailer button
  (YouTube embed); streaming provider logos (deduped by base service name,
  "Channel"/tier suffixes stripped, max 6).
- **Body:** seasons pill selector for TV (per-season episode fetch, first
  season auto-loads); episode detail view; cast row with photos; director.
- Actions: watchlist + thumbs (auth-gated), share.

## 5. Search (MVP)

Header search input, debounced. TMDB search + batched scores, results rendered
as title cards. `?q=` URL param.

## 6. Auth (MVP)

Better Auth, **email/password only** (owner decision; OAuth is a possible
later addition). Public read everywhere — anonymous users browse and see Base
ReelScores; auth gates watchlist, ratings, refresh, and (post-MVP)
personalization.

## 7. Watchlist & ratings (MVP)

- Save/remove any title from card or modal; `/watchlist` page lists saved
  titles with current scores. Logged-out clicks prompt login.
- Thumbs up/down on titles (modal). Ratings feed the post-MVP preference
  profile; they do not alter the public score.

---

## Post-MVP spec (preserved — build after the MVP line)

### Personalization

- Preference profile of genres/actors/directors with **confidence weights**:
  start 1.0, grow `1.0 + log2(confirming_ratings + 1) × 0.25`, capped 1.5,
  contradictions decrease weight (self-correcting).
- Sources: onboarding, ongoing thumbs (extract genres/top cast/director from
  TMDB metadata), manual profile edits (start at 1.0).
- **Swing:** genres ±1 each (max 3 matches → ±3); people ±2 each (max 3 → ±6);
  total ±9 added to Base for logged-in users. Deterministic and transparent.

### Onboarding

4 required ordered steps: genres (min 3) → actors (min 3) → directors (min 3)
→ rate 20 genre-aware titles (min 5, individual skips allowed; sourced via
Discover `with_genres` + `vote_average.desc` + `vote_count.gte=500`).
`onboarding_completed` gates Scored for You. Not re-runnable; preferences
editable from Profile.

### Scored for You feed

Horizontal row atop home for onboarded users. Candidates from TMDB Discover
(top-5 genres, top-3 actors, top-3 directors by confidence weight, movie+TV
each), deduped, minus rated/hidden. Score all, keep personalized ≥ 70, sort by
personalization delta then Base. 20 max. Per-user KV cache, 1h TTL.

### Deferred (unscheduled)

In-app notifications (score change ≥5, streaming availability), hidden titles,
native ad slots (every 9th grid cell, "Sponsored" badge, provider-agnostic),
premium ad-free tier, custom visual identity pass, blended-feed experiment
(only if the sort-lens feed proves worse), deferred score hydration (SSR cards
instantly, stream scores in).
