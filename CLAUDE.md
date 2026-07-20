# ReelScore

Audience-only score aggregator: 6 audience scores (via MDbList) blended into one
weighted 0–100 ReelScore for movies & TV, with TMDB metadata, a discovery feed,
and (post-MVP) per-user personalization. Live at getreelscore.com.

## Session protocol (do this every session)

1. **Start:** read `docs/ROADMAP.md` (find the current unchecked task) and the
   most recent note in `docs/sessions/`. Work ONE roadmap task at a time.
2. **During:** record significant technical/product choices as one-liners in
   `docs/DECISIONS.md`. Scope changes go into `docs/PRD.md` FIRST, then code.
3. **End:** tick completed ROADMAP checkboxes, write
   `docs/sessions/YYYY-MM-DD.md` (what was done, in flight, gotchas), commit.

## Source of truth

- `docs/PRD.md` — WHAT to build (product spec, score engine rules)
- `docs/ARCHITECTURE.md` — HOW it's built (stack, data model, conventions, file map)
- `docs/ROADMAP.md` — what's NEXT (phases and checklists; single progress truth)
- `docs/DECISIONS.md` — WHY (append-only decision log)

## Hard rules

- **Score math in `src/lib/scoring.ts` is LOCKED** — never modify without an
  explicit owner request. Vitest coverage mandatory; `npm test` +
  `npm run typecheck` must pass before any commit.
- All API endpoints are Hono routes in `src/lib/server/api.ts` under `/api/*`,
  Zod-validated. Server-only code lives in `src/lib/server/` (build-enforced).
- MDbList is the ONLY score source; TMDB is metadata-only.
- Native shadcn-svelte components first; the SVG score lip is the one custom
  visual. Svelte 5 runes; URL params are the state model (no store library).
- Dependencies exact-pinned (no `^`); each new dependency gets a one-line
  justification in `docs/DECISIONS.md`.
- D1 migrations only via `npm run db:generate` → `npm run db:migrate` (never
  hand-edit the database or generated SQL).
- **npm, never bun** (bun's ws hangs). Node 22 via nvm (`nvm use 22`).
- **NO deploys before parity** — `npm run deploy` replaces the live site at
  getreelscore.com. Parity deploy is ROADMAP item 6.5, owner go-ahead required.
- The owner is a beginner developer: explain terminal commands before running
  them, explain errors before fixing them, confirm destructive actions.
- Keep this file an index — details belong in `docs/`, not here.

## Commands

- `npm run dev` — dev server (localhost:5173; local D1/KV simulated)
- `npm run typecheck` / `npm test` — must pass before any commit
- `npm run db:generate` / `db:migrate` / `db:migrate:remote` — schema changes
- `npm run deploy` — build + deploy (see hard rule above)
