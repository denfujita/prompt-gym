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

  it("records defensive provider overruns instead of releasing real spend", async () => {
    const repository = new InMemoryPromptGymRepository();
    await repository.createAttempt(attempt(), envelope);
    const reservation = await repository.reserveCost({
      attemptId: "a1",
      userId: "u1",
      utcDay: "2026-07-12",
      amountNanoUsd: 10_000,
      attemptLimitNanoUsd: 250_000_000,
      userDailyLimitNanoUsd: 750_000_000,
      globalDailyLimitNanoUsd: 100_000_000_000,
    });

    await repository.settleCost(reservation.id, 12_000);
    await expect(
      repository.reserveCost({
        attemptId: "a1",
        userId: "u1",
        utcDay: "2026-07-12",
        amountNanoUsd: 249_988_001,
        attemptLimitNanoUsd: 250_000_000,
        userDailyLimitNanoUsd: 750_000_000,
        globalDailyLimitNanoUsd: 100_000_000_000,
      }),
    ).rejects.toMatchObject({ code: "COST_BUDGET" });
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
    expect(queued.event.turnId).toBe(turn.id);
    const retried = await repository.queueTurn(turn);
    expect(retried.event.id).toBe(queued.event.id);
    expect(retried.attempt.promptsUsed).toBe(1);
    expect(await repository.listTurns("a1")).toHaveLength(1);
    expect(await repository.listEvents("a1")).toHaveLength(1);
    await expect(repository.queueTurn({ ...turn, prompt: "Changed prompt" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(repository.queueTurn({ ...turn, id: "t2", ordinal: 2 })).rejects.toMatchObject({
      code: "RUN_ACTIVE",
    });

    for (const mutation of [
      { id: "changed" },
      { attemptId: "a2" },
      { ordinal: 2 },
      { prompt: "Changed prompt" },
      { createdAt: "2026-07-12T00:00:09.000Z" },
    ]) {
      await expect(
        repository.updateTurn(turn.id, (current) => ({ ...current, ...mutation })),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await expect(
      repository.updateTurn(turn.id, (current) => ({
        ...current,
        status: "running",
        startedAt: "2026-07-12T00:00:03.000Z",
      })),
    ).resolves.toMatchObject({ status: "running" });
    expect(await repository.getTurn(turn.id)).toMatchObject({
      prompt: turn.prompt,
      ordinal: turn.ordinal,
      createdAt: turn.createdAt,
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
    expect((await repository.recordUsage("a1", usage, turn.id)).applied).toBe(true);
    expect((await repository.recordUsage("a1", usage, turn.id)).applied).toBe(false);
    await repository.createTurn({ ...turn, id: "t2", ordinal: 2 });
    await expect(repository.recordUsage("a1", usage, "t2")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await repository.listUsage("a1")).toEqual([{ ...usage, turnId: turn.id }]);
    expect(await repository.getAttempt("a1")).toMatchObject({
      competitionTokens: 125,
      actualCostNanoUsd: 1_000,
    });
  });

  it("rejects cross-attempt turn lineage without side effects", async () => {
    const repository = new InMemoryPromptGymRepository();
    const first = attempt();
    const second: AttemptState = {
      ...attempt(),
      id: "a2",
      userId: "u2",
      publicHandle: "KeenOtter2",
      instance: { ...attempt().instance, id: "i2" },
    };
    await repository.createAttempt(first, envelope);
    await repository.createAttempt(second, { ...envelope, instance: second.instance });
    const foreignTurn: Turn = {
      id: "foreign-turn",
      attemptId: second.id,
      ordinal: 1,
      prompt: "Inspect the other attempt.",
      status: "queued",
      createdAt: "2026-07-12T00:00:01.000Z",
    };
    await repository.queueTurn(foreignTurn);
    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openai",
      providerResponseId: "resp-foreign",
      resolvedModel: "gpt-5.6-terra",
      inputTokens: 10,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 5,
      reasoningTokens: 0,
      totalTokens: 15,
      imageTokens: 0,
      toolUnits: 0,
      priceVersion: "test",
      actualCostNanoUsd: 100,
      createdAt: "2026-07-12T00:00:02.000Z",
    };

    await expect(
      repository.appendEvent({
        attemptId: first.id,
        turnId: foreignTurn.id,
        actor: "model",
        type: "model.message",
        payload: { text: "wrong attempt" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.recordUsage(first.id, usage, foreignTurn.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      repository.recordVerification(
        first.id,
        {
          passed: false,
          verifierDigest: "sha256:test",
          publicFeedback: "No",
          verifiedAt: "2026-07-12T00:00:03.000Z",
        },
        foreignTurn.id,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await repository.listEvents(first.id)).toEqual([]);
    expect(await repository.listUsage(first.id)).toEqual([]);
    expect(await repository.getAttempt(first.id)).toMatchObject({
      lastEventSequence: 0,
      lastEventHash: GENESIS_EVENT_HASH,
      competitionTokens: 0,
      actualCostNanoUsd: 0,
    });
  });
});
