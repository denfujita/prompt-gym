import { describe, expect, it } from "vitest";

import { benchmarkTier, compareBenchmarkScores } from "./benchmark-score";

describe("benchmark scoring", () => {
  it("gates tiers on correctness and published speed bands", () => {
    expect(benchmarkTier(false, 9)).toBe("invalid");
    expect(benchmarkTier(true, 0.99)).toBe("bronze");
    expect(benchmarkTier(true, 1)).toBe("silver");
    expect(benchmarkTier(true, 2)).toBe("gold");
  });

  it("ranks performance tier first and tokens within the tier", () => {
    const scores = [
      { correct: true, speedup: 1.8, competitionTokens: 1_000 },
      { correct: true, speedup: 2.05, competitionTokens: 4_000 },
      { correct: true, speedup: 2.4, competitionTokens: 2_000 },
      { correct: false, speedup: 8, competitionTokens: 100 },
    ].sort(compareBenchmarkScores);

    expect(scores).toEqual([
      { correct: true, speedup: 2.4, competitionTokens: 2_000 },
      { correct: true, speedup: 2.05, competitionTokens: 4_000 },
      { correct: true, speedup: 1.8, competitionTokens: 1_000 },
      { correct: false, speedup: 8, competitionTokens: 100 },
    ]);
  });

  it("does not use exact speedup as a hidden tie-breaker inside a band", () => {
    expect(
      compareBenchmarkScores(
        { correct: true, speedup: 2.01, competitionTokens: 2_000 },
        { correct: true, speedup: 9, competitionTokens: 2_000 },
      ),
    ).toBe(0);
    expect(
      compareBenchmarkScores(
        { correct: true, speedup: 2.01, competitionTokens: 1_999 },
        { correct: true, speedup: 9, competitionTokens: 2_000 },
      ),
    ).toBeLessThan(0);
  });

  it("fails invalid numeric measurements closed", () => {
    expect(benchmarkTier(true, Number.NaN)).toBe("invalid");
    expect(benchmarkTier(true, Number.POSITIVE_INFINITY)).toBe("invalid");
    expect(benchmarkTier(true, -0.01)).toBe("invalid");
    expect(benchmarkTier(true, 0)).toBe("bronze");
    expect(benchmarkTier(true, 0.999_999)).toBe("bronze");
    expect(benchmarkTier(true, 1)).toBe("silver");
    expect(benchmarkTier(true, 1.999_999)).toBe("silver");
    expect(benchmarkTier(true, 2)).toBe("gold");
    expect(
      compareBenchmarkScores(
        { correct: true, speedup: 2, competitionTokens: 10 },
        { correct: true, speedup: 2, competitionTokens: Number.NaN },
      ),
    ).toBeLessThan(0);
  });
});
