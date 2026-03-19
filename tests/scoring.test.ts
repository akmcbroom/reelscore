import { describe, it, expect } from "vitest";
import {
  calculateReelScore,
  getScoreColor,
  clampScore,
  getSourceLabel,
  MIN_SOURCES,
} from "../src/lib/scoring.ts";
import {
  normalizeScore,
  parseRatings,
  type MDbListRating,
  type NormalizedScore,
} from "../src/lib/mdblist.ts";
import { getCacheTtl, getCacheTier } from "../src/lib/kv.ts";

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

  it("normalizes TMDB 0-10 scale to 0-100", () => {
    expect(normalizeScore(8.5, "tmdb")).toBe(85);
    expect(normalizeScore(6.0, "tmdb")).toBe(60);
  });

  it("normalizes Letterboxd 0-5 scale to 0-100", () => {
    expect(normalizeScore(4.2, "letterboxd")).toBe(84);
    expect(normalizeScore(3.5, "letterboxd")).toBe(70);
    expect(normalizeScore(2.0, "letterboxd")).toBe(40);
  });

  it("passes through Rotten Tomatoes (already 0-100)", () => {
    expect(normalizeScore(85, "tomatoes")).toBe(85);
    expect(normalizeScore(42, "tomatoes")).toBe(42);
  });

  it("passes through Metacritic (already 0-100)", () => {
    expect(normalizeScore(73, "metacritic")).toBe(73);
  });

  it("passes through Trakt (already 0-100)", () => {
    expect(normalizeScore(88, "trakt")).toBe(88);
  });

  it("returns null for zero values (zero = no data)", () => {
    // Raw 0 from MDbList means no data, not an actual score — see CLAUDE.md
    expect(normalizeScore(0, "imdb")).toBeNull();
    expect(normalizeScore(0, "tomatoes")).toBeNull();
    expect(normalizeScore(0, "letterboxd")).toBeNull();
    expect(normalizeScore(0, "metacritic")).toBeNull();
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
      { source: "tomatoes", value: 80, score: 80, votes: 5000 },
      { source: "rogerebert", value: 3, score: 60, votes: 1 }, // not an audience source
      { source: "metacritic", value: 70, score: 70, votes: 200 },
    ];

    const result = parseRatings(ratings);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.source)).toEqual(["imdb", "tomatoes", "metacritic"]);
  });

  it("excludes sources with zero values (no data)", () => {
    const ratings: MDbListRating[] = [
      { source: "imdb", value: 7.5, score: 75, votes: 10000 },
      { source: "tomatoes", value: 0, score: 0, votes: 0 }, // no data
      { source: "trakt", value: 85, score: 85, votes: 3000 },
    ];

    const result = parseRatings(ratings);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.source)).toEqual(["imdb", "trakt"]);
  });

  it("normalizes values correctly for each source", () => {
    const ratings: MDbListRating[] = [
      { source: "imdb", value: 8.0, score: 80, votes: 50000 },
      { source: "letterboxd", value: 4.0, score: 80, votes: 20000 },
      { source: "tmdb", value: 7.5, score: 75, votes: 15000 },
    ];

    const result = parseRatings(ratings);

    expect(result[0]!.normalizedScore).toBe(80); // 8.0 * 10
    expect(result[1]!.normalizedScore).toBe(80); // 4.0 * 20
    expect(result[2]!.normalizedScore).toBe(75); // 7.5 * 10
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
// ReelScore Calculation (scoring.ts)
// ============================================================

describe("calculateReelScore", () => {
  it("averages scores from multiple sources", () => {
    const scores = [
      makeScore("imdb", 80),
      makeScore("tomatoes", 70),
      makeScore("metacritic", 60),
    ];

    const result = calculateReelScore(scores);

    expect(result.score).toBe(70); // (80 + 70 + 60) / 3 = 70
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

  it("works with exactly 2 sources (minimum)", () => {
    const scores = [makeScore("imdb", 90), makeScore("tmdb", 80)];

    const result = calculateReelScore(scores);

    expect(result.score).toBe(85); // (90 + 80) / 2
    expect(result.sourceCount).toBe(2);
    expect(result.hasEnoughSources).toBe(true);
  });

  it("works with all 6 sources", () => {
    const scores = [
      makeScore("imdb", 80),
      makeScore("tomatoes", 75),
      makeScore("metacritic", 70),
      makeScore("letterboxd", 85),
      makeScore("trakt", 78),
      makeScore("tmdb", 72),
    ];

    const result = calculateReelScore(scores);

    // (80 + 75 + 70 + 85 + 78 + 72) / 6 = 76.666... → 77
    expect(result.score).toBe(77);
    expect(result.sourceCount).toBe(6);
  });

  it("rounds the average to nearest integer", () => {
    const scores = [makeScore("imdb", 73), makeScore("tomatoes", 74)];

    const result = calculateReelScore(scores);

    // (73 + 74) / 2 = 73.5 → 74
    expect(result.score).toBe(74);
  });

  it("assigns correct color based on score range", () => {
    expect(calculateReelScore([makeScore("a", 50), makeScore("b", 50)]).color).toBe("red");
    expect(calculateReelScore([makeScore("a", 65), makeScore("b", 65)]).color).toBe("yellow");
    expect(calculateReelScore([makeScore("a", 75), makeScore("b", 75)]).color).toBe("green");
    expect(calculateReelScore([makeScore("a", 90), makeScore("b", 90)]).color).toBe("gold");
  });

  it("includes source details in result", () => {
    const scores = [
      makeScore("imdb", 80, 8.0, 50000),
      makeScore("tomatoes", 70, 70, 5000),
    ];

    const result = calculateReelScore(scores);

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]!.source).toBe("imdb");
    expect(result.sources[0]!.rawValue).toBe(8.0);
    expect(result.sources[0]!.votes).toBe(50000);
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

  it("returns yellow for 60-69", () => {
    expect(getScoreColor(60)).toBe("yellow");
    expect(getScoreColor(65)).toBe("yellow");
    expect(getScoreColor(69)).toBe("yellow");
  });

  it("returns green for 70-84", () => {
    expect(getScoreColor(70)).toBe("green");
    expect(getScoreColor(77)).toBe("green");
    expect(getScoreColor(84)).toBe("green");
  });

  it("returns gold for 85-100", () => {
    expect(getScoreColor(85)).toBe("gold");
    expect(getScoreColor(92)).toBe("gold");
    expect(getScoreColor(100)).toBe("gold");
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
  it("returns human-readable labels", () => {
    expect(getSourceLabel("imdb")).toBe("IMDb");
    expect(getSourceLabel("tomatoes")).toBe("Rotten Tomatoes");
    expect(getSourceLabel("metacritic")).toBe("Metacritic");
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
