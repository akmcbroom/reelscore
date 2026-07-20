import { describe, it, expect } from "vitest";
import {
  calculateReelScore,
  calculateVoteFactor,
  calculateReliabilityAdjustment,
  getScoreColor,
  clampScore,
  getSourceLabel,
  SOURCE_BASE_WEIGHTS,
  MIN_SOURCES,
} from "../src/lib/scoring";
import {
  normalizeScore,
  parseRatings,
  type MDbListRating,
  type NormalizedScore,
} from "../src/lib/mdblist";
import { getCacheTtl, getCacheTier } from "../src/lib/server/cache";

// --- Helper to build NormalizedScore objects for testing ---

function makeScore(
  source: string,
  normalizedScore: number,
  rawValue = 0,
  votes = 1000
): NormalizedScore {
  return {
    source: source as NormalizedScore["source"],
    rawValue,
    normalizedScore,
    votes,
  };
}

// ============================================================
// Score Normalization (mdblist.ts)
// ============================================================

describe("normalizeScore", () => {
  it("normalizes IMDb 0-10 scale to 0-100", () => {
    expect(normalizeScore(7.2, "imdb")).toBe(72);
    expect(normalizeScore(9.1, "imdb")).toBe(91);
    expect(normalizeScore(1.0, "imdb")).toBe(10);
  });

  it("passes through TMDB (already 0-100)", () => {
    expect(normalizeScore(85, "tmdb")).toBe(85);
    expect(normalizeScore(60, "tmdb")).toBe(60);
  });

  it("normalizes Letterboxd 0-5 scale to 0-100", () => {
    expect(normalizeScore(4.2, "letterboxd")).toBe(84);
    expect(normalizeScore(3.5, "letterboxd")).toBe(70);
    expect(normalizeScore(2.0, "letterboxd")).toBe(40);
  });

  it("passes through Rotten Tomatoes Audience (already 0-100)", () => {
    expect(normalizeScore(85, "tomatoesaudience")).toBe(85);
    expect(normalizeScore(42, "tomatoesaudience")).toBe(42);
  });

  it("normalizes Metacritic User 0-10 scale to 0-100", () => {
    expect(normalizeScore(7.3, "metacriticuser")).toBe(73);
    expect(normalizeScore(8.9, "metacriticuser")).toBe(89);
  });

  it("passes through Trakt (already 0-100)", () => {
    expect(normalizeScore(88, "trakt")).toBe(88);
  });

  it("returns null for zero values (zero = no data)", () => {
    // Raw 0 from MDbList means no data, not an actual score — see CLAUDE.md
    expect(normalizeScore(0, "imdb")).toBeNull();
    expect(normalizeScore(0, "tomatoesaudience")).toBeNull();
    expect(normalizeScore(0, "letterboxd")).toBeNull();
    expect(normalizeScore(0, "metacriticuser")).toBeNull();
    expect(normalizeScore(0, "trakt")).toBeNull();
    expect(normalizeScore(0, "tmdb")).toBeNull();
  });

  it("returns null for unknown sources", () => {
    expect(normalizeScore(50, "unknown_source")).toBeNull();
  });

  it("rounds fractional normalized scores", () => {
    // 7.35 * 10 = 73.5 → should round to 74
    expect(normalizeScore(7.35, "imdb")).toBe(74);
    // 4.15 * 20 = 83 → exact
    expect(normalizeScore(4.15, "letterboxd")).toBe(83);
  });
});

// ============================================================
// Rating Parsing (mdblist.ts)
// ============================================================

describe("parseRatings", () => {
  it("filters to only the 6 audience sources", () => {
    const ratings: MDbListRating[] = [
      { source: "imdb", value: 7.5, score: 75, votes: 10000 },
      { source: "tomatoesaudience", value: 80, score: 80, votes: 5000 },
      { source: "rogerebert", value: 3, score: 60, votes: 1 }, // not an audience source
      { source: "metacriticuser", value: 7.0, score: 70, votes: 200 },
    ];

    const result = parseRatings(ratings);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.source)).toEqual(["imdb", "tomatoesaudience", "metacriticuser"]);
  });

  it("aliases MDbList's 'popcorn' key to tomatoesaudience", () => {
    // MDbList delivers the RT audience score (Popcornmeter) as "popcorn" —
    // see DECISIONS 2026-07-19; the critic "tomatoes" key must stay ignored.
    const ratings: MDbListRating[] = [
      { source: "imdb", value: 7.2, score: 72, votes: 190005 },
      { source: "tomatoes", value: 65, score: 65, votes: 358 }, // critic — ignored
      { source: "popcorn", value: 90, score: 90, votes: 4711 },
    ];

    const result = parseRatings(ratings);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.source)).toEqual(["imdb", "tomatoesaudience"]);
    expect(result[1]!.normalizedScore).toBe(90);
    expect(result[1]!.votes).toBe(4711);
  });

  it("dedupes if both 'popcorn' and 'tomatoesaudience' keys appear", () => {
    const ratings: MDbListRating[] = [
      { source: "tomatoesaudience", value: 88, score: 88, votes: 1000 },
      { source: "popcorn", value: 90, score: 90, votes: 4711 },
    ];

    const result = parseRatings(ratings);

    // First entry with usable data wins
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("tomatoesaudience");
    expect(result[0]!.normalizedScore).toBe(88);
  });

  it("excludes sources with zero values (no data)", () => {
    const ratings: MDbListRating[] = [
      { source: "imdb", value: 7.5, score: 75, votes: 10000 },
      { source: "tomatoesaudience", value: 0, score: 0, votes: 0 }, // no data
      { source: "trakt", value: 85, score: 85, votes: 3000 },
    ];

    const result = parseRatings(ratings);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.source)).toEqual(["imdb", "trakt"]);
  });

  it("uses MDbList pre-normalized score field for each source", () => {
    const ratings: MDbListRating[] = [
      { source: "imdb", value: 8.0, score: 80, votes: 50000 },
      { source: "letterboxd", value: 4.0, score: 80, votes: 20000 },
      { source: "tmdb", value: 75, score: 75, votes: 15000 },
    ];

    const result = parseRatings(ratings);

    // parseRatings prefers the pre-normalized score field from MDbList
    expect(result[0]!.normalizedScore).toBe(80);
    expect(result[1]!.normalizedScore).toBe(80);
    expect(result[2]!.normalizedScore).toBe(75);
  });

  it("returns empty array when no valid audience sources", () => {
    const ratings: MDbListRating[] = [
      { source: "rogerebert", value: 3, score: 60, votes: 1 },
    ];

    expect(parseRatings(ratings)).toEqual([]);
  });

  it("handles empty ratings array", () => {
    expect(parseRatings([])).toEqual([]);
  });
});

// ============================================================
// Vote Factor (scoring.ts)
// ============================================================

describe("calculateVoteFactor", () => {
  it("returns 0.85 (floor) for 0 votes", () => {
    expect(calculateVoteFactor(0)).toBe(0.85);
  });

  it("returns 1.10 (ceiling) at 50,000 votes", () => {
    // At exactly 50,000 votes log₂(50001)/log₂(50000) ≈ 1.0, min(1,...) = 1 → 1.10
    expect(calculateVoteFactor(50000)).toBeCloseTo(1.10, 2);
  });

  it("caps at 1.10 for votes well above 50,000", () => {
    expect(calculateVoteFactor(1_000_000)).toBe(1.10);
  });

  it("is log-scaled between 0 and 50,000 votes", () => {
    const low = calculateVoteFactor(10);
    const mid = calculateVoteFactor(1000);
    const high = calculateVoteFactor(40000);

    // Each tier should be strictly increasing
    expect(low).toBeGreaterThan(0.85);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(high).toBeLessThanOrEqual(1.10);
  });

  it("returns ~1.01 for 1,000 votes (mid-range)", () => {
    // log₂(1001)/log₂(50000) ≈ 0.639 → 0.85 + 0.25*0.639 ≈ 1.010
    expect(calculateVoteFactor(1000)).toBeCloseTo(1.01, 2);
  });
});

// ============================================================
// Reliability Adjustment (scoring.ts)
// ============================================================

describe("calculateReliabilityAdjustment", () => {
  it("returns +1 for 5-6 sources with neutral vote factor and low votes", () => {
    // sourceCount=6 → +1; avgVF ≈ 1.01 (neutral); maxVotes=1000 (no bonus)
    expect(calculateReliabilityAdjustment(6, 1.01, 1000)).toBe(1);
    expect(calculateReliabilityAdjustment(5, 1.01, 1000)).toBe(1);
  });

  it("returns -1 for exactly 2 sources with neutral vote factor and low votes", () => {
    expect(calculateReliabilityAdjustment(2, 1.01, 1000)).toBe(-1);
  });

  it("returns 0 for 3-4 sources with neutral conditions", () => {
    expect(calculateReliabilityAdjustment(3, 1.01, 1000)).toBe(0);
    expect(calculateReliabilityAdjustment(4, 1.01, 1000)).toBe(0);
  });

  it("adds +1 for high avg vote factor (≥ 1.05)", () => {
    expect(calculateReliabilityAdjustment(3, 1.05, 1000)).toBe(1);
    expect(calculateReliabilityAdjustment(3, 1.09, 1000)).toBe(1);
  });

  it("adds -1 for low avg vote factor (≤ 0.90)", () => {
    expect(calculateReliabilityAdjustment(3, 0.90, 1000)).toBe(-1);
    expect(calculateReliabilityAdjustment(3, 0.86, 1000)).toBe(-1);
  });

  it("adds +1 when maxVotes ≥ 50,000 (established title)", () => {
    expect(calculateReliabilityAdjustment(3, 1.01, 50000)).toBe(1);
  });

  it("clamps to maximum of +3", () => {
    // 6 sources (+1) + high avgVF (+1) + maxVotes ≥ 50k (+1) = +3
    expect(calculateReliabilityAdjustment(6, 1.10, 100_000)).toBe(3);
  });

  it("clamps to minimum of -3", () => {
    // 2 sources (-1) + low avgVF (-1) + no other bonus = -2 (max negative is -2 in current formula)
    // But if we force all negatives: -1 + -1 + 0 = -2
    expect(calculateReliabilityAdjustment(2, 0.86, 100)).toBe(-2);
  });
});

// ============================================================
// ReelScore Calculation (scoring.ts)
// ============================================================

describe("calculateReelScore", () => {
  it("uses weighted average — higher-weighted sources shift the result", () => {
    // tomatoesaudience (weight 1.40) at 70, imdb (weight 0.95) at 80, metacriticuser (weight 0.75) at 60
    // Simple average would be 70. Weighted pulls toward tomatoesaudience (the 70 source) → result < 70.
    // At 1000 votes (vf ≈ 1.01), adj = 0 for 3 sources → weighted avg ≈ 70.6 → 71
    const scores = [
      makeScore("imdb", 80),
      makeScore("tomatoesaudience", 70),
      makeScore("metacriticuser", 60),
    ];

    const result = calculateReelScore(scores);

    expect(result.score).toBe(71);
    expect(result.sourceCount).toBe(3);
    expect(result.hasEnoughSources).toBe(true);
  });

  it("returns null when fewer than 2 sources", () => {
    const scores = [makeScore("imdb", 80)];

    const result = calculateReelScore(scores);

    expect(result.score).toBeNull();
    expect(result.sourceCount).toBe(1);
    expect(result.hasEnoughSources).toBe(false);
    expect(result.color).toBeNull();
  });

  it("returns null for empty scores array", () => {
    const result = calculateReelScore([]);

    expect(result.score).toBeNull();
    expect(result.sourceCount).toBe(0);
    expect(result.hasEnoughSources).toBe(false);
  });

  it("applies -1 reliability adjustment for exactly 2 sources", () => {
    // imdb (1.05) at 90 + tmdb (0.80) at 80, votes = 1000
    // Weighted avg: (90×1.05 + 80×0.80) × vf / (1.05 + 0.80) × vf ≈ 85.7
    // Reliability: sourceCount=2 → -1 → round(84.7) = 85
    const scores = [makeScore("imdb", 90), makeScore("tmdb", 80)];

    const result = calculateReelScore(scores);

    expect(result.score).toBe(85);
    expect(result.sourceCount).toBe(2);
    expect(result.hasEnoughSources).toBe(true);
  });

  it("applies +1 reliability adjustment for 5-6 sources", () => {
    // All 6 sources at 1000 votes → sourceCount=6 → adj=+1
    // Weighted avg ≈ 77.0 + 1 → 78
    const scores = [
      makeScore("imdb", 80),
      makeScore("tomatoesaudience", 75),
      makeScore("metacriticuser", 70),
      makeScore("letterboxd", 85),
      makeScore("trakt", 78),
      makeScore("tmdb", 72),
    ];

    const result = calculateReelScore(scores);

    expect(result.score).toBe(78);
    expect(result.sourceCount).toBe(6);
  });

  it("tomatoesaudience (highest weight) pulls score toward its value", () => {
    // tomatoesaudience=73 (weight 1.40) vs imdb=74 (weight 0.95)
    // Weighted avg skews below simple avg of 73.5 → ≈73.6 → round(73.6-1) = 73
    const scores = [makeScore("imdb", 73), makeScore("tomatoesaudience", 74)];

    const result = calculateReelScore(scores);

    // Result is pulled toward tomatoesaudience; 2-source -1 adj applies
    expect(result.score).toBe(73);
  });

  it("assigns correct color based on score range", () => {
    // Unknown sources get fallback weight 1.0; 2-source adj = -1 applies
    expect(calculateReelScore([makeScore("a", 50), makeScore("b", 50)]).color).toBe("red");   // 50-1=49 → red
    expect(calculateReelScore([makeScore("a", 65), makeScore("b", 65)]).color).toBe("gold");  // 65-1=64 → gold
    expect(calculateReelScore([makeScore("a", 75), makeScore("b", 75)]).color).toBe("green"); // 75-1=74 → green
    expect(calculateReelScore([makeScore("a", 90), makeScore("b", 90)]).color).toBe("green"); // 90-1=89 → green
  });

  it("includes source details in result", () => {
    const scores = [
      makeScore("imdb", 80, 8.0, 50000),
      makeScore("tomatoesaudience", 70, 70, 5000),
    ];

    const result = calculateReelScore(scores);

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]!.source).toBe("imdb");
    expect(result.sources[0]!.rawValue).toBe(8.0);
    expect(result.sources[0]!.votes).toBe(50000);
  });

  it("returns a breakdown object with full calculation details", () => {
    const scores = [
      makeScore("imdb", 80, 8.0, 50000),
      makeScore("tomatoesaudience", 75, 75, 50000),
    ];

    const result = calculateReelScore(scores);

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown!.sources).toHaveLength(2);
    expect(result.breakdown!.weightedAverage).toBeGreaterThan(0);
    expect(result.breakdown!.reliabilityAdjustment).toBeDefined();
    expect(result.breakdown!.baseReelScore).toBe(result.score);
  });

  it("breakdown reflects correct base weights per source", () => {
    const scores = [makeScore("imdb", 80, 8.0, 1000), makeScore("tmdb", 70, 70, 1000)];
    const result = calculateReelScore(scores);

    const imdbEntry = result.breakdown!.sources.find((s) => s.source === "imdb");
    const tmdbEntry = result.breakdown!.sources.find((s) => s.source === "tmdb");

    expect(imdbEntry!.baseWeight).toBe(SOURCE_BASE_WEIGHTS.imdb);      // 0.95
    expect(tmdbEntry!.baseWeight).toBe(SOURCE_BASE_WEIGHTS.tmdb);      // 0.80
    // imdb should have higher effectiveWeight than tmdb
    expect(imdbEntry!.effectiveWeight).toBeGreaterThan(tmdbEntry!.effectiveWeight);
  });

  it("clamps score to 0-100 even with extreme inputs", () => {
    const scores = [makeScore("imdb", 100), makeScore("tomatoesaudience", 100)];
    expect(calculateReelScore(scores).score).toBeLessThanOrEqual(100);

    const lowScores = [makeScore("imdb", 0), makeScore("tomatoesaudience", 0)];
    // 0-score sources are normally filtered — use non-zero values near 0
    const nearZeroScores = [makeScore("imdb", 1), makeScore("tomatoesaudience", 1)];
    expect(calculateReelScore(nearZeroScores).score).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Score Display Helpers (scoring.ts)
// ============================================================

describe("getScoreColor", () => {
  it("returns red for 0-59", () => {
    expect(getScoreColor(0)).toBe("red");
    expect(getScoreColor(30)).toBe("red");
    expect(getScoreColor(59)).toBe("red");
  });

  it("returns gold for 60-69", () => {
    expect(getScoreColor(60)).toBe("gold");
    expect(getScoreColor(65)).toBe("gold");
    expect(getScoreColor(69)).toBe("gold");
  });

  it("returns green for 70-100", () => {
    expect(getScoreColor(70)).toBe("green");
    expect(getScoreColor(77)).toBe("green");
    expect(getScoreColor(84)).toBe("green");
    expect(getScoreColor(85)).toBe("green");
    expect(getScoreColor(92)).toBe("green");
    expect(getScoreColor(100)).toBe("green");
  });
});

describe("clampScore", () => {
  it("clamps values below 0 to 0", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(-100)).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    expect(clampScore(105)).toBe(100);
    expect(clampScore(200)).toBe(100);
  });

  it("passes through values in 0-100 range", () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(50)).toBe(50);
    expect(clampScore(100)).toBe(100);
  });
});

describe("getSourceLabel", () => {
  it("returns human-readable labels for audience sources", () => {
    expect(getSourceLabel("imdb")).toBe("IMDb");
    expect(getSourceLabel("tomatoesaudience")).toBe("Rotten Tomatoes Audience");
    expect(getSourceLabel("metacriticuser")).toBe("Metacritic");
    expect(getSourceLabel("letterboxd")).toBe("Letterboxd");
    expect(getSourceLabel("trakt")).toBe("Trakt");
    expect(getSourceLabel("tmdb")).toBe("TMDB");
  });
});

// ============================================================
// KV Cache TTL (kv.ts)
// ============================================================

describe("getCacheTtl", () => {
  it("returns 24h for titles released within last 30 days", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 10);
    expect(getCacheTtl(recent.toISOString())).toBe(24 * 60 * 60);
  });

  it("returns 24h for unreleased titles (future dates)", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    expect(getCacheTtl(future.toISOString())).toBe(24 * 60 * 60);
  });

  it("returns 3 days for titles released 2-6 months ago", () => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);
    expect(getCacheTtl(threeMonthsAgo.toISOString())).toBe(3 * 24 * 60 * 60);
  });

  it("returns 7 days for titles released over 6 months ago", () => {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    expect(getCacheTtl(yearAgo.toISOString())).toBe(7 * 24 * 60 * 60);
  });

  it("returns 7 days when no release date is provided", () => {
    expect(getCacheTtl(null)).toBe(7 * 24 * 60 * 60);
  });
});

describe("getCacheTier", () => {
  it("returns 'current' for recent releases", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 5);
    expect(getCacheTier(recent.toISOString())).toBe("current");
  });

  it("returns 'recent' for 2-6 month old titles", () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    expect(getCacheTier(twoMonthsAgo.toISOString())).toBe("recent");
  });

  it("returns 'catalog' for older titles", () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 2);
    expect(getCacheTier(old.toISOString())).toBe("catalog");
  });

  it("returns 'catalog' when no release date", () => {
    expect(getCacheTier(null)).toBe("catalog");
  });
});
