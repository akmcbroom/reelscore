/**
 * Feed constants shared by server (feed.server.ts) and client
 * (use-infinite-feed) — kept dependency-free so the client bundle stays clean.
 */

/** Feed batches are capped at 10 to prevent DOM bloat — see docs/PRD.md §2. */
export const MAX_FEED_PAGES = 10;
