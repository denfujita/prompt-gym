export type BenchmarkTier = "invalid" | "bronze" | "silver" | "gold";

export interface BenchmarkScore {
  correct: boolean;
  speedup: number;
  competitionTokens: number;
}

const tierOrder: Record<BenchmarkTier, number> = {
  invalid: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export function benchmarkTier(correct: boolean, speedup: number): BenchmarkTier {
  if (!correct || !Number.isFinite(speedup) || speedup < 0) return "invalid";
  if (speedup >= 2) return "gold";
  if (speedup >= 1) return "silver";
  return "bronze";
}

/**
 * Daily benchmark boards use stable performance bands. A higher band wins;
 * within a band, fewer provider-reported tokens wins. Exact speedup remains
 * visible but is not a noisy hidden composite tie-breaker.
 */
export function compareBenchmarkScores(left: BenchmarkScore, right: BenchmarkScore): number {
  const leftTier = tierOrder[benchmarkTier(left.correct, left.speedup)];
  const rightTier = tierOrder[benchmarkTier(right.correct, right.speedup)];
  if (leftTier !== rightTier) return rightTier - leftTier;
  const leftTokens =
    Number.isFinite(left.competitionTokens) && left.competitionTokens >= 0
      ? left.competitionTokens
      : Number.MAX_SAFE_INTEGER;
  const rightTokens =
    Number.isFinite(right.competitionTokens) && right.competitionTokens >= 0
      ? right.competitionTokens
      : Number.MAX_SAFE_INTEGER;
  return leftTokens - rightTokens;
}
