/**
 * ReelScore calculation engine.
 * Computes the Base ReelScore from normalized audience scores using a
 * weighted average with per-source base weights, vote-count confidence
 * factors, and a small reliability adjustment.
 *
 * Architecture:
 * - Base ReelScore is objective — same for all users (anonymous included).
 * - Personalized ReelScore = Base ReelScore + personalization swing (±9 max).
 *   Personalization is handled separately in personalization.ts.
 *
 * See CLAUDE.md Score Engine for the full specification.
 */

import type { NormalizedScore, AudienceSource, CachedScoreData, ScoreBreakdown } from "./mdblist";

// --- Constants ---

/** Minimum number of sources required to calculate a ReelScore */
export const MIN_SOURCES = 2;

/** Score range boundaries for color coding — see CLAUDE.md Score Display Colors */
export const SCORE_RANGES = {
  RED: { min: 0, max: 59 },
  GOLD: { min: 60, max: 69 },
  GREEN: { min: 70, max: 100 },
} as const;

/**
 * Source-specific base weights for the weighted average.
 * Reflects signal quality and audience coverage per source.
 * tomatoesaudience is highest (strongest verified audience signal);
 * metacriticuser is lowest (thinnest coverage).
 * See CLAUDE.md Score Engine > Base ReelScore Calculation.
 */
export const SOURCE_BASE_WEIGHTS: Record<AudienceSource, number> = {
  tomatoesaudience: 1.40, // Strongest verified audience signal
  imdb:             0.95, // Large sample, some known skew
  letterboxd:       1.05, // High-quality cinephile signal
  trakt:            0.85, // Engaged active watchers
  tmdb:             0.80, // Good coverage, broad audience
  metacriticuser:   0.75, // Thinnest coverage
};

/**
 * Vote count threshold at which a source reaches maximum vote_factor (1.10).
 * Sources with fewer votes are down-weighted on a log scale.
 */
const VOTE_FACTOR_MAX_VOTES = 50_000;

// --- Types ---

/** Color classification for a ReelScore value */
export type ScoreColor = "red" | "gold" | "green";

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
  /**
   * Full mathematical breakdown for the dev tooltip.
   * Only present when hasEnoughSources is true.
   * See CLAUDE.md Score Transparency (Dev Mode).
   */
  breakdown?: ScoreBreakdown;
}

// --- Vote Factor ---

/**
 * Calculates a vote-count confidence multiplier for a single source.
 * Log-scaled and bounded to 0.85–1.10 — sources with very few votes
 * are down-weighted; well-reviewed titles get a small boost.
 *
 * Formula: clamp(0.85 + 0.25 × min(1, log₂(votes+1) / log₂(50000)), 0.85, 1.10)
 * - 0 votes → 0.85 (floor)
 * - 50,000 votes → 1.10 (ceiling)
 * - 1,000 votes → ~1.01
 *
 * @param votes - Number of audience votes for this source
 * @returns Vote factor in range [0.85, 1.10]
 */
export function calculateVoteFactor(votes: number): number {
  // log₂(votes+1) / log₂(50000) gives a 0→1 ratio as votes grow
  const logMax = Math.log2(VOTE_FACTOR_MAX_VOTES);
  const factor = 0.85 + 0.25 * Math.min(1, Math.log2(votes + 1) / logMax);
  return Math.min(1.10, Math.max(0.85, factor));
}

// --- Reliability Adjustment ---

/**
 * Calculates a small reliability adjustment (-3 to +3) applied after the
 * weighted average. Rewards titles with strong source coverage and vote
 * support; penalizes thin-data situations.
 *
 * Three contribution axes:
 * 1. Source count: +1 for 5–6 sources, 0 for 3–4, -1 for exactly 2.
 * 2. Vote support: +1 if avgVoteFactor ≥ 1.05, -1 if avgVoteFactor ≤ 0.90.
 * 3. Freshness/depth: +1 if any source has votes ≥ 50,000.
 *
 * @param sourceCount - Number of valid sources
 * @param avgVoteFactor - Average vote factor across all contributing sources
 * @param maxVotes - Highest vote count among contributing sources
 * @returns Reliability adjustment clamped to [-3, +3]
 */
export function calculateReliabilityAdjustment(
  sourceCount: number,
  avgVoteFactor: number,
  maxVotes: number
): number {
  let adj = 0;

  // Source count axis
  if (sourceCount >= 5) adj += 1;
  else if (sourceCount === 2) adj -= 1;

  // Vote support axis
  if (avgVoteFactor >= 1.05) adj += 1;
  else if (avgVoteFactor <= 0.90) adj -= 1;

  // Freshness/depth axis — at least one source has substantial vote coverage
  if (maxVotes >= VOTE_FACTOR_MAX_VOTES) adj += 1;

  return Math.max(-3, Math.min(3, adj));
}

// --- Score Calculation ---

/**
 * Calculates the Base ReelScore from an array of normalized scores.
 *
 * Algorithm (see CLAUDE.md Score Engine):
 * 1. Filter to valid scores only.
 * 2. Require minimum 2 sources.
 * 3. For each source: effective_weight = base_weight × vote_factor(votes).
 * 4. Weighted average = Σ(normalized × effective_weight) / Σ(effective_weights).
 * 5. Compute reliability adjustment.
 * 6. Base ReelScore = clamp(round(weighted_avg + reliability_adj), 0-100).
 * 7. Return result with full breakdown for dev tooltip.
 *
 * @param scores - Array of normalized scores from MDbList (via parseRatings)
 * @returns ReelScore result with score, source count, color, and breakdown
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

  // --- Weighted Average ---

  // Compute per-source contribution (weight × score)
  let weightedSum = 0;
  let weightSum = 0;
  let totalVoteFactor = 0;
  let maxVotes = 0;

  const breakdownSources: ScoreBreakdown["sources"] = [];

  for (const s of validScores) {
    // Use base weight for known sources; fall back to 1.0 for any unknown source
    const baseWeight = SOURCE_BASE_WEIGHTS[s.source] ?? 1.0;
    const voteFactor = calculateVoteFactor(s.votes);
    const effectiveWeight = baseWeight * voteFactor;

    weightedSum += s.normalizedScore * effectiveWeight;
    weightSum += effectiveWeight;
    totalVoteFactor += voteFactor;

    if (s.votes > maxVotes) maxVotes = s.votes;

    breakdownSources.push({
      source: s.source,
      normalizedScore: s.normalizedScore,
      baseWeight,
      voteFactor: Math.round(voteFactor * 10000) / 10000, // 4 decimal places
      effectiveWeight: Math.round(effectiveWeight * 10000) / 10000,
      votes: s.votes,
    });
  }

  const weightedAverage = weightedSum / weightSum;
  const avgVoteFactor = totalVoteFactor / sourceCount;

  // --- Reliability Adjustment ---

  const reliabilityAdjustment = calculateReliabilityAdjustment(
    sourceCount,
    avgVoteFactor,
    maxVotes
  );

  // --- Final Score ---

  const rawScore = weightedAverage + reliabilityAdjustment;
  const score = clampScore(Math.round(rawScore));

  const breakdown: ScoreBreakdown = {
    sources: breakdownSources,
    weightedAverage: Math.round(weightedAverage * 100) / 100,
    reliabilityAdjustment,
    baseReelScore: score,
  };

  return {
    score,
    sourceCount,
    hasEnoughSources: true,
    sources: validScores,
    color: getScoreColor(score),
    breakdown,
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
  if (score >= SCORE_RANGES.GREEN.min) return "green";
  if (score >= SCORE_RANGES.GOLD.min) return "gold";
  return "red";
}

/**
 * Clamps a score value to the 0-100 range.
 * Used after the weighted average + reliability adjustment,
 * and again after applying personalization adjustments.
 *
 * @param score - Raw score value
 * @returns Clamped score between 0 and 100
 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/**
 * Returns a human-readable label for a source.
 * Maps internal MDbList source IDs to display names.
 */
export function getSourceLabel(source: AudienceSource): string {
  const labels: Record<AudienceSource, string> = {
    imdb:             "IMDb",
    tomatoesaudience: "Rotten Tomatoes Audience",
    metacriticuser:   "Metacritic",
    letterboxd:       "Letterboxd",
    trakt:            "Trakt",
    tmdb:             "TMDB",
  };
  return labels[source] ?? source;
}
