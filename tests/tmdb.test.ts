import { describe, it, expect } from "vitest";
import {
  getImageUrl,
  getDisplayTitle,
  getReleaseDate,
  getDirectors,
  getTopCast,
  IMAGE_SIZES,
  type TmdbCredits,
  type TmdbSearchResult,
  type TmdbTrendingItem,
} from "../src/lib/tmdb";

// ============================================================
// Image URL Helpers
// ============================================================

describe("getImageUrl", () => {
  it("builds a poster URL with default medium size", () => {
    const url = getImageUrl("/abc123.jpg");
    expect(url).toBe("https://image.tmdb.org/t/p/w342/abc123.jpg");
  });

  it("builds a poster URL with specified size", () => {
    expect(getImageUrl("/abc.jpg", "poster", "small")).toBe(
      "https://image.tmdb.org/t/p/w185/abc.jpg"
    );
    expect(getImageUrl("/abc.jpg", "poster", "large")).toBe(
      "https://image.tmdb.org/t/p/w500/abc.jpg"
    );
    expect(getImageUrl("/abc.jpg", "poster", "original")).toBe(
      "https://image.tmdb.org/t/p/original/abc.jpg"
    );
  });

  it("builds backdrop URLs", () => {
    expect(getImageUrl("/bg.jpg", "backdrop", "medium")).toBe(
      "https://image.tmdb.org/t/p/w780/bg.jpg"
    );
    expect(getImageUrl("/bg.jpg", "backdrop", "large")).toBe(
      "https://image.tmdb.org/t/p/w1280/bg.jpg"
    );
  });

  it("builds profile URLs", () => {
    expect(getImageUrl("/face.jpg", "profile", "small")).toBe(
      "https://image.tmdb.org/t/p/w45/face.jpg"
    );
    expect(getImageUrl("/face.jpg", "profile", "medium")).toBe(
      "https://image.tmdb.org/t/p/w185/face.jpg"
    );
  });

  it("builds logo URLs", () => {
    expect(getImageUrl("/logo.png", "logo", "medium")).toBe(
      "https://image.tmdb.org/t/p/w92/logo.png"
    );
  });

  it("returns null when path is null", () => {
    expect(getImageUrl(null)).toBeNull();
    expect(getImageUrl(null, "backdrop", "large")).toBeNull();
  });
});

// ============================================================
// Display Title Helper
// ============================================================

describe("getDisplayTitle", () => {
  it("returns title for movies", () => {
    const movie = { title: "Inception", media_type: "movie" } as TmdbSearchResult;
    expect(getDisplayTitle(movie)).toBe("Inception");
  });

  it("returns name for TV shows", () => {
    const tv = { name: "Breaking Bad", media_type: "tv" } as TmdbSearchResult;
    expect(getDisplayTitle(tv)).toBe("Breaking Bad");
  });

  it("falls back to 'Unknown Title' when neither exists", () => {
    const item = { media_type: "movie" } as TmdbSearchResult;
    expect(getDisplayTitle(item)).toBe("Unknown Title");
  });

  it("prefers title over name when both exist", () => {
    const item = {
      title: "Movie Title",
      name: "TV Name",
      media_type: "movie",
    } as TmdbTrendingItem;
    expect(getDisplayTitle(item)).toBe("Movie Title");
  });
});

// ============================================================
// Release Date Helper
// ============================================================

describe("getReleaseDate", () => {
  it("returns release_date for movies", () => {
    const movie = {
      release_date: "2024-07-15",
      media_type: "movie",
    } as TmdbSearchResult;
    expect(getReleaseDate(movie)).toBe("2024-07-15");
  });

  it("returns first_air_date for TV shows", () => {
    const tv = {
      first_air_date: "2023-01-10",
      media_type: "tv",
    } as TmdbSearchResult;
    expect(getReleaseDate(tv)).toBe("2023-01-10");
  });

  it("returns undefined when no date exists", () => {
    const item = { media_type: "movie" } as TmdbSearchResult;
    expect(getReleaseDate(item)).toBeUndefined();
  });
});

// ============================================================
// Credits Helpers
// ============================================================

describe("getDirectors", () => {
  const credits: TmdbCredits = {
    cast: [],
    crew: [
      { id: 1, name: "Christopher Nolan", job: "Director", department: "Directing", profile_path: null },
      { id: 2, name: "Emma Thomas", job: "Producer", department: "Production", profile_path: null },
      { id: 3, name: "Hoyte van Hoytema", job: "Director of Photography", department: "Camera", profile_path: null },
    ],
  };

  it("filters crew to only directors", () => {
    const directors = getDirectors(credits);
    expect(directors).toHaveLength(1);
    expect(directors[0]!.name).toBe("Christopher Nolan");
  });

  it("returns empty array when no director exists", () => {
    const noDirector: TmdbCredits = {
      cast: [],
      crew: [
        { id: 2, name: "Emma Thomas", job: "Producer", department: "Production", profile_path: null },
      ],
    };
    expect(getDirectors(noDirector)).toEqual([]);
  });

  it("returns multiple directors when present", () => {
    const multiDirector: TmdbCredits = {
      cast: [],
      crew: [
        { id: 1, name: "Lana Wachowski", job: "Director", department: "Directing", profile_path: null },
        { id: 2, name: "Lilly Wachowski", job: "Director", department: "Directing", profile_path: null },
      ],
    };
    expect(getDirectors(multiDirector)).toHaveLength(2);
  });
});

describe("getTopCast", () => {
  const credits: TmdbCredits = {
    cast: [
      { id: 3, name: "Actor C", character: "Role C", profile_path: null, order: 2 },
      { id: 1, name: "Actor A", character: "Role A", profile_path: null, order: 0 },
      { id: 2, name: "Actor B", character: "Role B", profile_path: null, order: 1 },
      { id: 4, name: "Actor D", character: "Role D", profile_path: null, order: 3 },
      { id: 5, name: "Actor E", character: "Role E", profile_path: null, order: 4 },
    ],
    crew: [],
  };

  it("returns cast sorted by billing order", () => {
    const top = getTopCast(credits, 3);
    expect(top).toHaveLength(3);
    expect(top[0]!.name).toBe("Actor A"); // order 0
    expect(top[1]!.name).toBe("Actor B"); // order 1
    expect(top[2]!.name).toBe("Actor C"); // order 2
  });

  it("defaults to 10 results", () => {
    const top = getTopCast(credits);
    expect(top).toHaveLength(5); // only 5 in test data
  });

  it("handles empty cast", () => {
    const empty: TmdbCredits = { cast: [], crew: [] };
    expect(getTopCast(empty)).toEqual([]);
  });
});

// ============================================================
// Image Size Constants
// ============================================================

describe("IMAGE_SIZES", () => {
  it("has all required size presets", () => {
    expect(IMAGE_SIZES.poster).toHaveProperty("small");
    expect(IMAGE_SIZES.poster).toHaveProperty("medium");
    expect(IMAGE_SIZES.poster).toHaveProperty("large");
    expect(IMAGE_SIZES.poster).toHaveProperty("original");
    expect(IMAGE_SIZES.backdrop).toHaveProperty("small");
    expect(IMAGE_SIZES.profile).toHaveProperty("small");
    expect(IMAGE_SIZES.logo).toHaveProperty("small");
  });
});
