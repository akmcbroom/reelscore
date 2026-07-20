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
- **2026-07-19** SECOND migration same day (owner decision): React Router v8 →
  **SvelteKit 2 + adapter-cloudflare**, reversing the "match tidbits" stack
  choice — tidbits will move to SvelteKit later too, so cross-project parity
  is preserved on the new stack. Rationale: minimal boilerplate, form actions
  + use:enhance for the auth/watchlist roadmap, no hook-rules bug class.
  Domain code (scoring/tmdb/mdblist/D1 cache/Hono handlers/74 tests) ported
  intact; only the ~10-file UI layer was rewritten. React app preserved at
  `3d55b25`.
- **2026-07-19** `src/lib/server/` replaces the `.server.ts` suffix convention
  — SvelteKit build-enforces the server-only boundary (stronger guarantee).
- **2026-07-19** Hono kept as the API layer, mounted at a
  `src/routes/api/[...paths]/+server.ts` catch-all delegating to
  `api.fetch(request, platform.env)`; loads call lib functions directly.
- **2026-07-19** Title modal uses SvelteKit **shallow routing** (pushState +
  page.state; URL params kept for shareable links) — no feed-load re-run on
  open/close, back button closes the modal. Replaces the RR shouldRevalidate
  workaround.
- **2026-07-19** shadcn-svelte initialized with the same **nova** design
  system (preset code `b0`); Geist swapped in for the preset's Inter to keep
  visual parity. Dep swaps: svelte/kit/adapter-cloudflare/shadcn-svelte/
  bits-ui/@lucide/svelte/tailwind-variants/mode-watcher/svelte-sonner IN;
  react/react-dom/react-router/radix-ui/lucide-react/next-themes/isbot OUT.
- **2026-07-19** `wrangler types` output moved to `src/worker-configuration.d.ts`
  so svelte-check sees the Env/binding globals.
- **2026-07-19** Base-score math stays PRIVATE in production (owner decision —
  weights/vote factors/reliability are the secret sauce). Public "Why this
  score?" (Phase 7) explains only the personalization swing in general terms
  ("because you like Horror and John Carpenter"). Dev-only hover breakdown on
  the score lip retained, via HTML title attr (SVG <title> was unreliable).
- **2026-07-19** Feed performance promoted into the MVP as roadmap 5.0:
  deferred score hydration (feed never blocks on MDbList), sort-key merge for
  "All" (the 1:1 zipper ranked items regardless of relative popularity; PRD
  had promised a popularity interleave that was never implemented — resolution
  is a merge by each lens's own sort key), sentinel prefetch margin, and
  MDbList rate-limit tuning. Root cause: cold batches serialize ~40-76 MDbList
  fetches at 2-concurrent/500ms ≈ 10-19s blocking both SSR and scroll batches.
- **2026-07-19** PRD §2 corrected to match code: 2 Discover pages per active
  media type per batch (not 3 pages/~60 items — the LCM-of-grid-columns
  rationale was void anyway since the anime filter and dedup make batch sizes
  inexact). Code wins; 3 pages would worsen the cold-score fanout by 50%.
- **2026-07-19** Launch-readiness block added as roadmap 6.4 (title permalink
  pages for SEO, empty/error states, legal pages + account deletion, password
  reset/email-provider decision); parity deploy renumbered 6.4 → 6.5.
- **2026-07-19** Expected-features backlog logged as Phase 8 (provider
  filtering, search filters, genre browse, More Like This, person pages,
  watched history, /settings); old Phase 8 deferred list is now Phase 9.
