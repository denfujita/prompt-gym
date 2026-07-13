import { describe, expect, it } from "vitest";
import {
  benchmarkEvaluatorResultSchema,
  consentRequestSchema,
  createAttemptRequestSchema,
  createTurnRequestSchema,
} from "./index.js";

describe("public request contracts", () => {
  it("rejects fields that could smuggle server-owned instance state", () => {
    expect(
      createAttemptRequestSchema.safeParse({ challengeSlug: "signal-vault", ranked: true, seed: "pick-me" })
        .success,
    ).toBe(false);
  });
  it("trims and bounds player prompts", () => {
    expect(createTurnRequestSchema.parse({ prompt: "  try the circle gate  " }).prompt).toBe(
      "try the circle gate",
    );
    expect(createTurnRequestSchema.safeParse({ prompt: " ".repeat(10) }).success).toBe(false);
  });
  it("keeps research and public replay consent separate", () => {
    expect(
      consentRequestSchema.parse({ research: true, publicReplay: false, version: "2026-07-12" }),
    ).toMatchObject({ research: true, publicReplay: false });
  });

  it("validates correctness-gated evaluator measurements without accepting token accounting", () => {
    const correct = {
      schemaVersion: "benchmark-evaluator-result.v1",
      outcome: "correct",
      candidateSha256: "a".repeat(64),
      correctness: { passed: true, casesPassed: 5, casesTotal: 5 },
      score: {
        metricId: "speedup_ppm",
        valueInt: "2000000",
        referenceLatencyNs: "184000",
        candidateLatencyNs: "92000",
      },
      evaluatorProfileDigest: "sha256:evaluator",
      environmentDigest: "sha256:environment",
      measurementDigest: "sha256:measurement",
      publicFeedback: "All cases passed.",
      evaluatedAt: "2026-07-13T00:00:00.000Z",
    };
    expect(benchmarkEvaluatorResultSchema.parse(correct).outcome).toBe("correct");
    expect(
      benchmarkEvaluatorResultSchema.safeParse({ ...correct, competitionTokensAtCandidate: 10 }).success,
    ).toBe(false);
    expect(
      benchmarkEvaluatorResultSchema.safeParse({
        ...correct,
        correctness: { passed: true, casesPassed: 4, casesTotal: 5 },
      }).success,
    ).toBe(false);
    expect(
      benchmarkEvaluatorResultSchema.safeParse({
        ...correct,
        outcome: "incorrect",
      }).success,
    ).toBe(false);
  });
});
