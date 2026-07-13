import { describe, expect, it } from "vitest";
import type { AttemptState, ChallengeInstanceEnvelope, Turn, UsageV1 } from "@prompt-gym/contracts";
import { GENESIS_EVENT_HASH, verifyEventChain } from "./crypto.js";
import { InMemoryPromptGymRepository } from "./repository.js";

const attempt = (): AttemptState => ({
  id: "a1",
  userId: "u1",
  publicHandle: "KeenOtter1",
  arenaId: "arena",
  challengeSlug: "signal-vault",
  challengeVersion: "1",
  instance: {
    id: "i1",
    challengeSlug: "signal-vault",
    challengeVersion: "1",
    instanceClass: "gameplay",
    seedCommitment: "abc",
    sandboxImageDigest: "sha256:demo",
  },
  ranked: true,
  assisted: false,
  status: "ready",
  promptsUsed: 0,
  toolActionsUsed: 0,
  competitionTokens: 0,
  actualCostNanoUsd: 0,
  maxPrompts: 6,
  maxToolActionsPerTurn: 8,
  maxCompetitionTokens: 20_000,
  maxActualCostNanoUsd: 250_000_000,
  startedAt: "2026-07-12T00:00:00.000Z",
  expiresAt: "2026-07-12T00:10:00.000Z",
  lastEventSequence: 0,
  lastEventHash: GENESIS_EVENT_HASH,
});
const envelope: ChallengeInstanceEnvelope = {
  instance: attempt().instance,
  publicState: {},
  modelBrief: "brief",
  allowedTools: [],
};

describe("InMemoryPromptGymRepository", () => {
  it("atomically orders and hashes visible events", async () => {
    const repository = new InMemoryPromptGymRepository();
    await repository.createAttempt(attempt(), envelope);
    await repository.appendEvent({
      attemptId: "a1",
      actor: "system",
      type: "attempt.started",
      payload: { ranked: true },
    });
    await repository.appendEvent({
      attemptId: "a1",
      actor: "player",
      type: "turn.queued",
      payload: { prompt: "look" },
    });
    const events = await repository.listEvents("a1");
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(verifyEventChain(events)).toBe(true);
  });

  it("reserves worst-case spend and releases the unused amount on settlement", async () => {
    const repository = new InMemoryPromptGymRepository();
    await repository.createAttempt(attempt(), envelope);
    const reservation = await repository.reserveCost({
      attemptId: "a1",
      userId: "u1",
      utcDay: "2026-07-12",
      amountNanoUsd: 250_000_000,
      attemptLimitNanoUsd: 250_000_000,
      userDailyLimitNanoUsd: 750_000_000,
      globalDailyLimitNanoUsd: 100_000_000_000,
    });
    await expect(
      repository.reserveCost({
        attemptId: "a1",
        userId: "u1",
        utcDay: "2026-07-12",
        amountNanoUsd: 1,
        attemptLimitNanoUsd: 250_000_000,
        userDailyLimitNanoUsd: 750_000_000,
        globalDailyLimitNanoUsd: 100_000_000_000,
      }),
    ).rejects.toMatchObject({ code: "COST_BUDGET" });
    await repository.settleCost(reservation.id, 10_000);
    await expect(
      repository.reserveCost({
        attemptId: "a1",
        userId: "u1",
        utcDay: "2026-07-12",
        amountNanoUsd: 249_990_000,
        attemptLimitNanoUsd: 250_000_000,
        userDailyLimitNanoUsd: 750_000_000,
        globalDailyLimitNanoUsd: 100_000_000_000,
      }),
    ).resolves.toBeDefined();
  });

  it("atomically queues a prompt and deduplicates score accounting", async () => {
    const repository = new InMemoryPromptGymRepository();
    await repository.createAttempt(attempt(), envelope);
    const turn: Turn = {
      id: "t1",
      attemptId: "a1",
      ordinal: 1,
      prompt: "Inspect the gate.",
      status: "queued",
      createdAt: "2026-07-12T00:00:01.000Z",
    };
    const queued = await repository.queueTurn(turn);
    expect(queued.attempt.promptsUsed).toBe(1);
    expect(queued.event.type).toBe("turn.queued");
    await expect(repository.queueTurn({ ...turn, id: "t2", ordinal: 2 })).rejects.toMatchObject({
      code: "RUN_ACTIVE",
    });

    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openai",
      providerResponseId: "resp-1",
      resolvedModel: "gpt-5.6-terra",
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheWriteTokens: 0,
      outputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 125,
      imageTokens: 0,
      toolUnits: 1,
      priceVersion: "test",
      actualCostNanoUsd: 1_000,
      createdAt: "2026-07-12T00:00:02.000Z",
    };
    expect((await repository.recordUsage("a1", usage)).applied).toBe(true);
    expect((await repository.recordUsage("a1", usage)).applied).toBe(false);
    expect(await repository.getAttempt("a1")).toMatchObject({
      competitionTokens: 125,
      actualCostNanoUsd: 1_000,
    });
  });
});
