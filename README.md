# ReelScore

> Watch what you like, not what the critics like.

ReelScore aggregates **audience-only** ratings from six sources — IMDb, Rotten
Tomatoes Audience, Metacritic User, Letterboxd, Trakt, and TMDB — into a single
weighted 0–100 score for movies and TV shows. No critic scores, ever.

Live at [getreelscore.com](https://getreelscore.com).

## Stack

- **SvelteKit 2** (Svelte 5 runes, SSR) on **Cloudflare Workers**
  via `@sveltejs/adapter-cloudflare`
- **Hono** JSON API at `/api/*` (same Worker), validated with **Zod**
- **Cloudflare D1** (SQLite) via **Drizzle ORM**; **KV** for TMDB response caching
- **shadcn-svelte** (nova) + **Tailwind v4**, dark-first with light/dark/system toggle
- **Better Auth** (email/password)
- Scores from the **MDbList API**; metadata/images from **TMDB**

## Development

Requires Node 22 (`nvm use 22`) and npm (not bun).

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in TMDB + MDbList API keys
npm run dev                       # http://localhost:5173
npm test                          # vitest (score engine coverage)
npm run typecheck
```

Database changes: edit `app/db/schema.ts`, then `npm run db:generate` and
`npm run db:migrate` (local) / `npm run db:migrate:remote` (production).

## Project docs

The build is documented in `docs/`: [PRD](docs/PRD.md) (what),
[ARCHITECTURE](docs/ARCHITECTURE.md) (how), [ROADMAP](docs/ROADMAP.md) (next),
[DECISIONS](docs/DECISIONS.md) (why), plus per-session notes in
`docs/sessions/`.
