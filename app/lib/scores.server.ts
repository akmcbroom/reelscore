/**
 * D1-backed score cache.
 *
 * Replaces the old KV score cache: one `scores` row per title, batch-read with
 * a single IN select, TTL enforced in code via the release-recency tiers, and
 * misses/stale rows refetched from MDbList in rate-limited batches then
 * upserted in place. See docs/ARCHITECTURE.md "Caching architecture".
 */

import { inArray, sql } from "drizzle-orm";

import { createDb } from "~/db";
import { scores } from "~/db/schema";
import { getCacheTtl } from "./cache.server";
import {
  fetchMDbListScores,
  parseRatings,
  type CachedScoreData,
  type NormalizedScore,
  type ScoreBreakdown,
} from "./mdblist";
import { calculateReelScore } from "./scoring";

/** Input descriptor for a score lookup. */
export interface ScoreRequest {
  tmdbId: number;
  mediaType: "movie" | "tv";
  /** ISO date string — drives the cache TTL tier */
  releaseDate: string | null;
  /** IMDb ID if known — preferred for MDbList lookup accuracy */
  imdbId?: string | null;
}

/** A scores table row shaped back into the app-level CachedScoreData. */
function rowToCachedData(row: typeof scores.$inferSelect): CachedScoreData {
  return {
    tmdbId: row.tmdbId,
    imdbId: row.imdbId,
    scores: JSON.parse(row.scoresJson) as NormalizedScore[],
    sourceCount: row.sourceCount,
    fetchedAt: row.fetchedAt,
    breakdown: row.breakdown
      ? (JSON.parse(row.breakdown) as ScoreBreakdown)
      : undefined,
  };
}

/** True when a cached row is still within its TTL tier. */
function isFresh(row: typeof scores.$inferSelect, now: number): boolean {
  const ttlSeconds = getCacheTtl(row.releaseDate);
  const age = (now - new Date(row.fetchedAt).getTime()) / 1000;
  return age < ttlSeconds;
}

/**
 * Fetches a single title from MDbList and shapes it into a row + cached data.
 * Returns null when MDbList fails or returns no usable ratings payload.
 */
async function fetchFreshScore(
  apiKey: string,
  request: ScoreRequest
): Promise<{ row: typeof scores.$inferInsert; data: CachedScoreData } | null> {
  const response = await fetchMDbListScores(
    apiKey,
    request.tmdbId,
    request.imdbId,
    request.mediaType
  );
  if (!response) return null;

  // Guard: MDbList may return responses without a ratings array
  // (error objects, titles not found, unexpected shapes)
  if (!response.ratings || !Array.isArray(response.ratings)) return null;

  const normalized = parseRatings(response.ratings);
  const result = calculateReelScore(normalized);

  const data: CachedScoreData = {
    tmdbId: request.tmdbId,
    imdbId: request.imdbId || response.ids?.imdb || null,
    scores: normalized,
    sourceCount: normalized.length,
    fetchedAt: new Date().toISOString(),
    breakdown: result.breakdown,
  };

  return {
    data,
    row: {
      tmdbId: data.tmdbId,
      mediaType: request.mediaType,
      imdbId: data.imdbId,
      baseReelscore: result.score,
      sourceCount: data.sourceCount,
      scoresJson: JSON.stringify(data.scores),
      breakdown: result.breakdown ? JSON.stringify(result.breakdown) : null,
      releaseDate: request.releaseDate,
      fetchedAt: data.fetchedAt,
    },
  };
}

/**
 * Gets scores for multiple titles: one D1 IN-select, then MDbList fetches for
 * misses/stale rows in rate-limited batches, then one multi-row upsert.
 *
 * @param d1 - D1 binding
 * @param apiKey - MDbList API key
 * @param titles - Titles to look up
 * @param batchSize - Concurrent MDbList requests per batch (default 2 —
 *   kept low to avoid 429s, see docs/ARCHITECTURE.md External API notes)
 * @param delayMs - Delay between MDbList batches (default 500)
 * @returns Score data in the same order as the input (null where unavailable)
 */
export async function getScoresBatched(
  d1: D1Database,
  apiKey: string,
  titles: ScoreRequest[],
  batchSize = 2,
  delayMs = 500
): Promise<(CachedScoreData | null)[]> {
  if (titles.length === 0) return [];

  const db = createDb(d1);
  const now = Date.now();

  // Step 1: one batched read for every requested id
  const rows = await db
    .select()
    .from(scores)
    .where(inArray(scores.tmdbId, titles.map((t) => t.tmdbId)));
  const rowsById = new Map(rows.map((r) => [r.tmdbId, r]));

  // Step 2: serve fresh rows; queue misses and stale rows for refetch
  const results: (CachedScoreData | null)[] = new Array(titles.length).fill(null);
  const refetchIndices: number[] = [];

  titles.forEach((t, i) => {
    const row = rowsById.get(t.tmdbId);
    if (row && isFresh(row, now)) {
      results[i] = rowToCachedData(row);
    } else {
      refetchIndices.push(i);
      // Serve stale data as a placeholder in case the refetch fails —
      // a stale score beats no score.
      if (row) results[i] = rowToCachedData(row);
    }
  });

  // Step 3: refetch in rate-limited batches
  const freshRows: (typeof scores.$inferInsert)[] = [];
  for (let i = 0; i < refetchIndices.length; i += batchSize) {
    const batch = refetchIndices.slice(i, i + batchSize);
    const fetched = await Promise.all(
      batch.map((idx) => fetchFreshScore(apiKey, titles[idx]!))
    );

    fetched.forEach((f, j) => {
      if (f) {
        results[batch[j]!] = f.data;
        freshRows.push(f.row);
      }
    });

    // Delay between MDbList batches (skip after the last one)
    if (i + batchSize < refetchIndices.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Step 4: one multi-row upsert for everything fetched
  if (freshRows.length > 0) {
    await db
      .insert(scores)
      .values(freshRows)
      .onConflictDoUpdate({
        target: scores.tmdbId,
        set: {
          mediaType: sql`excluded.media_type`,
          imdbId: sql`excluded.imdb_id`,
          baseReelscore: sql`excluded.base_reelscore`,
          sourceCount: sql`excluded.source_count`,
          scoresJson: sql`excluded.scores_json`,
          breakdown: sql`excluded.breakdown`,
          releaseDate: sql`excluded.release_date`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  return results;
}

/**
 * Single-title convenience wrapper (title modal, refresh flows).
 * `bypassCache` forces a fresh MDbList fetch + upsert regardless of TTL.
 */
export async function getScoresForTitle(
  d1: D1Database,
  apiKey: string,
  request: ScoreRequest,
  bypassCache = false
): Promise<CachedScoreData | null> {
  if (!bypassCache) {
    const [result] = await getScoresBatched(d1, apiKey, [request]);
    return result ?? null;
  }

  const fresh = await fetchFreshScore(apiKey, request);
  if (!fresh) return null;

  const db = createDb(d1);
  await db
    .insert(scores)
    .values(fresh.row)
    .onConflictDoUpdate({
      target: scores.tmdbId,
      set: {
        mediaType: sql`excluded.media_type`,
        imdbId: sql`excluded.imdb_id`,
        baseReelscore: sql`excluded.base_reelscore`,
        sourceCount: sql`excluded.source_count`,
        scoresJson: sql`excluded.scores_json`,
        breakdown: sql`excluded.breakdown`,
        releaseDate: sql`excluded.release_date`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });

  return fresh.data;
}
