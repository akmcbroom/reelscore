/**
 * Cache helpers.
 *
 * KV (binding SCORE_CACHE) holds raw TMDB API responses and per-user refresh
 * cooldown keys. Score payloads live in D1 (see ./scores.ts) — the TTL
 * tier functions here are shared policy used by both stores.
 * See docs/ARCHITECTURE.md "Caching architecture".
 */

/** Cache TTL tiers based on title recency — see docs/ARCHITECTURE.md */
export type CacheTier = "current" | "recent" | "catalog";

/**
 * Determines the cache TTL (in seconds) based on how recently a title was released.
 *
 * - In theaters / airing now: 24 hours
 * - Released within last 6 months: 3 days
 * - Older titles: 7 days
 *
 * @param releaseDate - ISO date string (e.g., "2025-03-19") or null
 * @returns TTL in seconds
 */
export function getCacheTtl(releaseDate: string | null): number {
  if (!releaseDate) {
    // No release date known — use the longest TTL as a safe default
    return 7 * 24 * 60 * 60; // 7 days
  }

  const release = new Date(releaseDate);
  const now = new Date();
  const daysSinceRelease = Math.floor(
    (now.getTime() - release.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceRelease < 0 || daysSinceRelease <= 30) {
    // Not yet released, or released within the last 30 days (in theaters / airing now)
    return 24 * 60 * 60; // 24 hours
  }

  if (daysSinceRelease <= 180) {
    // Released within the last 6 months
    return 3 * 24 * 60 * 60; // 3 days
  }

  // Older titles
  return 7 * 24 * 60 * 60; // 7 days
}

/**
 * Determines the cache tier label for a given release date.
 * Useful for logging and debugging which TTL tier a title falls into.
 */
export function getCacheTier(releaseDate: string | null): CacheTier {
  if (!releaseDate) return "catalog";

  const release = new Date(releaseDate);
  const now = new Date();
  const daysSinceRelease = Math.floor(
    (now.getTime() - release.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceRelease < 0 || daysSinceRelease <= 30) return "current";
  if (daysSinceRelease <= 180) return "recent";
  return "catalog";
}

/**
 * Builds a KV key for tracking per-user score refresh cooldowns.
 * Format: `refresh:{user_id}:{tmdb_id}`
 * TTL: 15 minutes (enforced when writing the key)
 */
export function refreshCooldownKey(userId: string, tmdbId: number): string {
  return `refresh:${userId}:${tmdbId}`;
}

/** Refresh cooldown duration in seconds (15 minutes) */
export const REFRESH_COOLDOWN_SECONDS = 15 * 60;

/**
 * Reads a cached value from KV and parses it as JSON.
 * Returns null if the key doesn't exist or the value can't be parsed.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param key - Cache key to look up
 * @returns Parsed value or null
 */
export async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Writes a value to KV as JSON with an optional TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param key - Cache key
 * @param value - Value to serialize and store
 * @param ttlSeconds - Time-to-live in seconds (optional, KV minimum is 60s)
 */
export async function kvPut<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const options: KVNamespacePutOptions = {};
  if (ttlSeconds !== undefined) {
    // KV has a 60-second minimum TTL — enforce it to avoid silent failures
    options.expirationTtl = Math.max(ttlSeconds, 60);
  }
  await kv.put(key, JSON.stringify(value), options);
}

/**
 * Checks whether a refresh cooldown is active for a given user + title.
 * Returns true if the user must wait before refreshing again.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param userId - Authenticated user ID
 * @param tmdbId - TMDB title ID
 * @returns true if cooldown is active (user cannot refresh yet)
 */
export async function isRefreshOnCooldown(
  kv: KVNamespace,
  userId: string,
  tmdbId: number
): Promise<boolean> {
  const key = refreshCooldownKey(userId, tmdbId);
  const value = await kv.get(key);
  return value !== null;
}

/**
 * Sets the refresh cooldown for a user + title pair.
 * The key auto-expires after 15 minutes via KV TTL.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param userId - Authenticated user ID
 * @param tmdbId - TMDB title ID
 */
export async function setRefreshCooldown(
  kv: KVNamespace,
  userId: string,
  tmdbId: number
): Promise<void> {
  const key = refreshCooldownKey(userId, tmdbId);
  await kvPut(kv, key, { refreshedAt: new Date().toISOString() }, REFRESH_COOLDOWN_SECONDS);
}
