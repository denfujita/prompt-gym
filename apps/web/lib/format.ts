export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

export function formatCost(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Math.max(0, value));
}

export function scoreDelta(tokens: number, cheapest: number): number {
  return Math.max(0, tokens - cheapest);
}

export function compactNumber(value: number): string {
  if (value < 1_000) return String(value);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
