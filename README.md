# ReelScore

> Watch what you like, not what the critics like.

ReelScore aggregates audience scores from IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt, and TMDB into a single unified score for movies and TV shows. No critic scores, ever. Personalized to your taste over time.

**Live:** [getreelscore.com](https://getreelscore.com)

---

## What It Does

ReelScore pulls up to 6 audience scores per title and averages them into one ReelScore on a 0–100 scale. A minimum of 2 sources are required for a score to display. U.S. releases only.

Logged-in users get personalized scores based on their genre, actor, and director preferences. The more you rate, the smarter it gets.

### Key Features

- **Unified audience score** — one number from 6 sources, no critic noise
- **Personalized scores** — genre, actor, and director preferences adjust your ReelScore up to +/-9 points
- **Discovery feeds** — hybrid home page with curated horizontal rows (In Theaters, Trending, New Releases) plus a blended infinite scroll grid. Personalized "Scored for You" row for users who complete onboarding
- **Watchlist** — save titles, get notified when scores shift or titles hit your streaming platforms
- **Search & filters** — filter by media type, genre, streaming platform, and sort by score, date, or popularity
- **No page reloads** — title details open in modals, feeds load via infinite scroll

---

## Tech Stack

| Layer         | Technology                                    |
| ------------- | --------------------------------------------- |
| Framework     | Astro (SSR on Cloudflare Workers)             |
| Styling       | Tailwind CSS v4                               |
| UI Components | Basecoat + HTMX + Alpine.js                   |
| Auth          | Better Auth (email/password, Google, Apple)    |
| Database      | Cloudflare D1 (SQLite) via Drizzle ORM        |
| Caching       | Cloudflare KV                                 |
| Deployment    | Cloudflare Workers                            |
| APIs          | MDbList (all scores), TMDB (metadata + images) |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works for dev, paid plan for production)
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free)
- An [MDbList API key](https://mdblist.com/) (paid plan required for all 6 score sources)

### Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/akmcbroom/reelscore.git
   cd reelscore
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Authenticate with Cloudflare:**
   ```bash
   bunx wrangler login
   ```
   This opens a browser window to log into your Cloudflare account.

4. **Create D1 database:**
   ```bash
   bunx wrangler d1 create reelscore-db
   ```
   Copy the `database_id` from the output and update `wrangler.toml`.

5. **Create KV namespace:**
   ```bash
   bunx wrangler kv namespace create SCORE_CACHE
   ```
   Copy the namespace `id` from the output and update `wrangler.toml`.

6. **Set up environment variables:**

   Create a `.dev.vars` file in the project root for local development:
   ```
   TMDB_API_KEY=your_tmdb_api_key
   MDBLIST_API_KEY=your_mdblist_api_key
   BETTER_AUTH_SECRET=generate_a_random_string_here
   BETTER_AUTH_URL=http://localhost:4321
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
   APPLE_CLIENT_ID=your_apple_client_id
   APPLE_CLIENT_SECRET=your_apple_client_secret
   ```

   For production, set these as Cloudflare Worker secrets:
   ```bash
   bunx wrangler secret put TMDB_API_KEY
   bunx wrangler secret put MDBLIST_API_KEY
   bunx wrangler secret put BETTER_AUTH_SECRET
   # ... etc
   ```

7. **Run database migrations:**
   ```bash
   bun run db:push
   ```

8. **Start local development:**
   ```bash
   bun run dev
   ```
   This starts the Astro dev server with Cloudflare Workers bindings (D1, KV) at `http://localhost:4321`.

### Deploy

```bash
bun run deploy
```

This runs `wrangler deploy` to push to Cloudflare Workers.

---

## Project Structure

```
reelscore/
├── src/
│   ├── pages/              # Astro file-based routing
│   │   ├── index.astro     # Home / discovery feeds
│   │   ├── search.astro    # Search results
│   │   ├── watchlist.astro # User watchlist
│   │   ├── profile.astro   # User preferences & settings
│   │   ├── onboarding.astro
│   │   ├── auth/           # Login, signup, OAuth callback
│   │   └── api/            # HTMX partials + REST endpoints
│   ├── components/         # Astro components (TitleCard, TitleModal, ScoreBadge, etc.)
│   ├── layouts/            # Base HTML layout
│   ├── lib/                # Core business logic
│   │   ├── scoring.ts      # ReelScore calculation engine
│   │   ├── personalization.ts # Preference weights + adjustments
│   │   ├── tmdb.ts         # TMDB API client
│   │   ├── mdblist.ts      # MDbList API client
│   │   ├── auth.ts         # Better Auth instance
│   │   ├── db.ts           # Drizzle client
│   │   └── kv.ts           # KV cache helpers
│   ├── db/                 # Drizzle schema + migrations
│   └── styles/             # Global CSS (Tailwind + Basecoat)
├── tests/                  # Vitest test files
├── wrangler.toml           # Cloudflare Workers config
├── astro.config.mjs        # Astro config
├── drizzle.config.ts       # Drizzle-kit config
├── CLAUDE.md               # Full project specification (source of truth)
└── README.md               # This file
```

---

## How Scoring Works

1. MDbList API provides up to 6 normalized audience scores per title.
2. Scores are averaged into a **Base ReelScore** (minimum 2 sources required).
3. For logged-in users, genre/actor/director preferences adjust the score:
   - Up to 3 genre matches: +/-1 each (max +/-3)
   - Up to 3 actor/director matches: +/-2 each (max +/-6)
   - **Total max swing: +/-9 points**
4. Final score is clamped to 0–100.

### Score Colors

| Range    | Color      | Meaning          |
| -------- | ---------- | ---------------- |
| 0–59     | Red        | Skip it          |
| 60–69    | Gold/Amber | Maybe            |
| 70–100   | Green      | Watch it         |

---

## Monetization

ReelScore uses native-style ads that blend into the discovery feed grid, appearing every 9th item. Ad cards match the title card dimensions and include a subtle "Sponsored" label for transparency. The ad system is provider-agnostic. A future premium tier will offer an ad-free experience.

---

## Contributing

This is a solo project. If you're reading this and want to contribute, open an issue first to discuss.

### PR Requirements

PRs that change the data model, scoring logic, API contracts, or auth flow must include updates to both `CLAUDE.md` and `README.md` in the same PR. Documentation stays in sync with code — always.

---

## License

TBD
