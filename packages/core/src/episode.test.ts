import { describe, expect, it } from "vitest";
import type { EpisodeBuildInput } from "./episode.js";
import { buildEpisodeJsonlRelease, buildEpisodeV1 } from "./episode.js";
import { createDefaultArena } from "./orchestrator.js";
import { GENESIS_EVENT_HASH, createVisibleRunEvent } from "./crypto.js";

const TURN_ID = "00000000-0000-4000-8000-000000000002";

const input = (): EpisodeBuildInput => {
  const event = createVisibleRunEvent({
    attemptId: "00000000-0000-4000-8000-000000000001",
    turnId: TURN_ID,
    sequence: 1,
    actor: "player",
    type: "turn.queued",
    payload: {
      prompt: "Email me at coach@example.com; key sk-abcdefghijklmnop",
      privateResultRef: "never-export",
    },
    createdAt: "2026-07-12T12:00:00.000Z",
    previousHash: GENESIS_EVENT_HASH,
  });
  return {
    attempt: {
      id: event.attemptId,
      userId: "user-private",
      publicHandle: "quietcoach",
      arenaId: "arena",
      challengeSlug: "signal-vault",
      challengeVersion: "1.0.0",
      instance: {
        id: "private-instance",
        challengeSlug: "signal-vault",
        challengeVersion: "1.0.0",
        instanceClass: "gameplay",
        seedCommitment: "seed-hash",
        sandboxImageDigest: "sha256:image",
      },
      ranked: true,
      assisted: false,
      status: "solved",
      promptsUsed: 1,
      toolActionsUsed: 4,
      competitionTokens: 100,
      actualCostNanoUsd: 10,
      maxPrompts: 6,
      maxToolActionsPerTurn: 8,
      maxCompetitionTokens: 20_000,
      maxActualCostNanoUsd: 250_000_000,
      startedAt: event.createdAt,
      expiresAt: "2026-07-12T12:10:00.000Z",
      completedAt: event.createdAt,
      lastEventSequence: 1,
      lastEventHash: event.hash,
    },
    challenge: {
      slug: "signal-vault",
      version: "1.0.0",
      title: "Signal Vault",
      shortDescription: "",
      playerBrief: "",
      winCondition: "Open every chamber.",
      brief: "",
      kind: "visual",
      playMode: "puzzle",
      accent: { name: "cyan", hex: "#00FFFF", symbol: "o" },
      difficulty: "hard",
      estimatedMinutes: 8,
      actionBudgetLabel: "24 control actions",
      maxPrompts: 6,
      maxToolActionsPerTurn: 8,
      maxCompetitionTokens: 20_000,
      featured: true,
      accessibilityLabel: "cyan circle",
    },
    arena: createDefaultArena(new Date("2026-07-12T12:00:00Z")),
    events: [event],
    usage: [],
    verification: {
      turnId: event.turnId,
      passed: true,
      verifierDigest: "verify",
      publicFeedback: "pass",
      privateResultRef: "private",
      verifiedAt: event.createdAt,
    },
    consent: {
      userId: "user-private",
      version: "v1",
      operational: true,
      research: true,
      publicReplay: false,
      recordedAt: event.createdAt,
    },
    generatorDigest: "generator",
    toolSchemaDigest: "tools",
    baselineEpisodeIds: ["baseline-1"],
  };
};

describe("EpisodeV1 export", () => {
  it("requires active research consent and strips private or identifying payload data", () => {
    const episode = buildEpisodeV1(input());
    const serialized = JSON.stringify(episode);
    expect(serialized).not.toContain("coach@example.com");
    expect(serialized).not.toContain("never-export");
    expect(serialized).not.toContain("user-private");
    expect(episode.events[0]?.turnId).toBe(TURN_ID);
    expect(episode.outcome.turnId).toBe(TURN_ID);
    expect(episode.qualityFlags).toContain("pii_or_secret_redacted");
    expect(() => buildEpisodeV1({ ...input(), consent: { ...input().consent, research: false } })).toThrow(
      /not permitted/,
    );
  });

  it("fails closed for benchmark trajectories until EpisodeV2 exists", () => {
    const value = input();
    expect(() =>
      buildEpisodeV1({
        ...value,
        challenge: {
          ...value.challenge,
          kind: "artifact",
          playMode: "build",
          benchmark: {
            schemaVersion: "benchmark.v1",
            family: "kernelbench-compatible",
            source: {
              name: "KernelBench",
              upstreamCommit: "test-commit",
              license: "MIT",
              taskId: "level1-1",
              contamination: "public_benchmark_practice",
            },
            maxEvaluations: 3,
            evaluatorProfileDigest: "sha256:evaluator",
            environmentProfileDigest: "sha256:environment",
            hardwareProfile: "test-gpu",
            backend: "triton",
            precision: "fp16",
            score: {
              metricId: "speedup_ppm",
              direction: "maximize",
              correctnessGate: "all_hidden_cases",
              bronzeThresholdPpm: "0",
              silverThresholdPpm: "1000000",
              goldThresholdPpm: "2000000",
              tieBreaker: "competition_tokens",
            },
          },
        },
      }),
    ).toThrow(/EpisodeV2/);
  });

  it("emits deterministic JSONL and checksums", () => {
    const episode = buildEpisodeV1(input());
    const first = buildEpisodeJsonlRelease([episode], "2026-07-13T00:00:00Z");
    const second = buildEpisodeJsonlRelease([episode], "2026-07-13T00:00:00Z");
    expect(second).toEqual(first);
    expect(first.manifest.episodeCount).toBe(1);
    expect(first.jsonl.endsWith("\n")).toBe(true);
  });
});
