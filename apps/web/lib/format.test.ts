import { describe, expect, it } from "vitest";

import { compactNumber, formatCost, formatTokens, scoreDelta } from "./format";

describe("score formatting", () => {
  it("formats token counts and score deltas", () => {
    expect(formatTokens(2843)).toBe("2,843");
    expect(scoreDelta(2843, 1907)).toBe(936);
    expect(scoreDelta(1000, 1200)).toBe(0);
  });

  it("formats cost and compact counts", () => {
    expect(formatCost(0.0432)).toBe("$0.043");
    expect(compactNumber(1284)).toBe("1.3K");
  });
});
