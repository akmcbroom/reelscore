/**
 * ReelScore calculation engine.
 * Computes the Base ReelScore from normalized audience scores.
 *
 * The Base ReelScore is the average of all available normalized scores
 * from the 6 audience sources. A minimum of 2 sources is required
 * to display a score — see CLAUDE.md Score Engine.
 *
 * Personalization adjustments are handled separately in personalization.ts
 * (Build Order Step 8).
 */

import type { NormalizedScore, AudienceSource, CachedScoreData } from "./mdblist.ts";

// --- Constants ---

/** Minimum number of sources required to calculate a ReelScore */
export const MIN_SOURCES = 2;

/** Score range boundaries for color coding — see CLAUDE.md Score Display Colors */
export const SCORE_RANGES = {
  RED: { min: 0, max: 59 },
  YELLOW: { min: 60, max: 69 },
  GREEN: { min: 70, max: 84 },
  GOLD: { min: 85, max: 100 },
} as const;

// --- Types ---

/** Color classification for a ReelScore value */
export type ScoreColor = "red" | "yellow" | "green" | "gold";

/** Result of a ReelScore calculation */
export interface ReelScoreResult {
  /** The calculated Base ReelScore (0-100), or null if insufficient sources */
  score: number | null;
  /** Number of sources that contributed to the score */
  sourceCount: number;
  /** Whether the minimum source threshold was met */
  hasEnoughSources: boolean;
  /** Individual source scores used in the calculation */
  sources: NormalizedScore[];
  /** Display color based on score range */
  color: ScoreColor | null;
}

// --- Score Calculation ---

/**
 * Calculates the Base ReelScore from an array of normalized scores.
 *
 * Algorithm:
 * 1. Filter to only scores with valid data
 * 2. Require minimum 2 sources to produce a score
 * 3. Average all available normalized scores
 * 4. Clamp the result to 0-100
 *
 * @param scores - Array of normalized scores from MDbList
 * @returns ReelScore result with score, source count, and color
 */
export function calculateReelScore(scores: NormalizedScore[]): ReelScoreResult {
  // Filter to only valid scores (normalizedScore must be a real number)
  const validScores = scores.filter(
    (s) => s.normalizedScore !== null && !isNaN(s.normalizedScore)
  );

  const sourceCount = validScores.length;
  const hasEnoughSources = sourceCount >= MIN_SOURCES;

  // Not enough sources — can't produce a meaningful score
  if (!hasEnoughSources) {
    return {
      score: null,
      sourceCount,
      hasEnoughSources: false,
      sources: validScores,
      color: null,
    };
  }

  // Average all normalized scores
  const sum = validScores.reduce((acc, s) => acc + s.normalizedScore, 0);
  const average = sum / sourceCount;

  // Clamp to 0-100 range
  const score = clampScore(Math.round(average));

  return {
    score,
    sourceCount,
    hasEnoughSources: true,
    sources: validScores,
    color: getScoreColor(score),
  };
}

/**
 * Convenience function to calculate a ReelScore directly from cached score data.
 *
 * @param data - Cached score data from KV (returned by getScores)
 * @returns ReelScore result
 */
export function calculateReelScoreFromCache(
  data: CachedScoreData
): ReelScoreResult {
  return calculateReelScore(data.scores);
}

// --- Score Display Helpers ---

/**
 * Determines the display color for a given score value.
 * See CLAUDE.md Score Display Colors for the ranges.
 *
 * @param score - ReelScore value (0-100)
 * @returns Color classification
 */
export function getScoreColor(score: number): ScoreColor {
  if (score >= SCORE_RANGES.GOLD.min) return "gold";
  if (score >= SCORE_RANGES.GREEN.min) return "green";
  if (score >= SCORE_RANGES.YELLOW.min) return "yellow";
  return "red";
}

/**
 * Clamps a score value to the 0-100 range.
 * Used after averaging and after applying personalization adjustments.
 *
 * @param score - Raw score value
 * @returns Clamped score between 0 and 100
 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/**
 * Returns a human-readable label for a source.
 * Maps internal source IDs to display names.
 */
export function getSourceLabel(source: AudienceSource): string {
  const labels: Record<AudienceSource, string> = {
    imdb: "IMDb",
    popcorn: "Rotten Tomatoes",
    metacriticuser: "Metacritic",
    letterboxd: "Letterboxd",
    trakt: "Trakt",
    tmdb: "TMDB",
  };
  return labels[source] ?? source;
}
