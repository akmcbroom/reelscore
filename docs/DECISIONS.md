# Decision log (append-only)

- **2026-07-19** Ground-up rebuild on the tidbits stack: React Router v8
  (framework mode, SSR) + Hono `/api/*` in one Worker, shadcn/ui, Better Auth,
  Drizzle + D1, Zod, Vitest — replacing Astro + HTMX + Basecoat + vanilla JS.
  Same repo, fresh start on main; Astro history preserved at `1e21729`.
- **2026-07-19** Docs system adopted from tidbits (PRD/ARCHITECTURE/ROADMAP/
  DECISIONS/sessions + slim CLAUDE.md index), replacing the monolithic
  CLAUDE.md that had to restate everything every session.
- **2026-07-19** npm with exact-pinned versions, never bun (bun's ws hangs on
  this machine; tidbits anti-churn policy).
- **2026-07-19** Feed simplified: ONE TMDB Discover query per view (media tabs
  × sort lens Popular/Top Rated/New Releases/Upcoming) replaces the 6-source
  blendAndDedup + lockstep pagination + unbounded `exclude` URL param. Owner
  judged the old logic overcomplicated. Tuned content filters kept. Client-side
  seen-ID Set guards popularity-drift duplicates.
- **2026-07-19** Scores cached in D1 (`scores` table, JSON breakdown column,
  TTL-in-code) instead of KV. The old KV+D1-mirror design was dual-write; the
  mirror table was never even written. D1 wins on queryability, consistency,
  and single-batch reads. KV retained for TMDB response caching + cooldown keys.
- **2026-07-19** Score engine math LOCKED as ported (weighted average, vote
  factor 0.85–1.10, reliability adjustment ±3, `tomatoesaudience` key) — last
  changed in Astro commit `f7f3846`.
- **2026-07-19** Native shadcn (nova preset, radix base) visuals everywhere;
  dark default with cookie light/dark/system toggle. The ONE custom visual kept
  is the SVG score lip (owner decision). Custom branding deferred post-MVP.
- **2026-07-19** Theme cookie written client-side via `document.cookie` (not an
  API route) — preference is not sensitive, saves a round-trip and a route.
- **2026-07-19** Auth is Better Auth email/password only; Google/Apple OAuth
  deferred (setup cost, Apple $99/yr).
- **2026-07-19** MVP line = end of Phase 6 (feed, scores, modal, auth, search,
  watchlist, ratings). Personalization is Phase 7; notifications/ads deferred.
- **2026-07-19** NO deploys until parity — `npm run deploy` would replace the
  live Astro site at getreelscore.com. Parity deploy is roadmap item 6.4 with
  explicit owner go-ahead.
- **2026-07-19** Deps added: hono (API router), zod (validation), drizzle-orm/
  drizzle-kit (typed D1 + migrations), lucide-react (icons), vitest (tests);
  shadcn stack (radix-ui, cva, clsx, tailwind-merge, tw-animate-css, geist)
  via shadcn CLI.
