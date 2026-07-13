import type { UsageV1 } from "@prompt-gym/contracts";

export interface PriceTable {
  version: string;
  inputNanoUsdPerToken: number;
  cachedInputNanoUsdPerToken: number;
  cacheWriteNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
}

/** Frozen for the first Terra season: $2.50/M input, $0.25/M cached, $3.125/M writes, $15/M output. */
export const TERRA_PRICE_2026_07_12: PriceTable = {
  version: "terra-2026-07-12",
  inputNanoUsdPerToken: 2_500,
  cachedInputNanoUsdPerToken: 250,
  cacheWriteNanoUsdPerToken: 3_125,
  outputNanoUsdPerToken: 15_000,
};

export function calculateActualCostNanoUsd(
  usage: Pick<UsageV1, "inputTokens" | "cachedInputTokens" | "cacheWriteTokens" | "outputTokens">,
  price: PriceTable,
): number {
  const regularInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    regularInput * price.inputNanoUsdPerToken +
    usage.cachedInputTokens * price.cachedInputNanoUsdPerToken +
    usage.cacheWriteTokens * price.cacheWriteNanoUsdPerToken +
    usage.outputTokens * price.outputNanoUsdPerToken
  );
}

export function competitionTokens(usages: readonly Pick<UsageV1, "totalTokens">[]): number {
  return usages.reduce((sum, usage) => sum + usage.totalTokens, 0);
}

export const NANO_USD = 1_000_000_000;
export const MAX_ATTEMPT_COST_NANO_USD = Math.round(0.25 * NANO_USD);
export const MAX_DAILY_USER_COST_NANO_USD = Math.round(0.75 * NANO_USD);
export const DEFAULT_GLOBAL_DAILY_COST_NANO_USD = 100 * NANO_USD;
