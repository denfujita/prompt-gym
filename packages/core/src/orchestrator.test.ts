import { describe, expect, it, vi } from "vitest";
import type { ChallengeManifest } from "@prompt-gym/contracts";
import { LocalDemoChallengeService } from "./challenge-service.js";
import {
  createDefaultArena,
  PromptGymService,
  RANKED_ISOLATION_ATTESTATION,
  resolveRankedPlayEnabled,
  RunEngine,
} from "./orchestrator.js";
import {
  ScriptedModelProvider,
  type ModelProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "./provider.js";
import { InMemoryPromptGymRepository, RunEventHub } from "./repository.js";
import { PromptGymError } from "./errors.js";

const fixedClock = { now: () => new Date("2026-07-12T12:00:00.000Z") };

const benchmarkProfile = {
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
} as const satisfies NonNullable<ChallengeManifest["benchmark"]>;

class BenchmarkPreviewChallengeService extends LocalDemoChallengeService {
  override async listChallenges(): Promise<ChallengeManifest[]> {
    const base = (await super.listChallenges())[0]!;
    return [
      {
        ...base,
        slug: "kernel-sprint",
        title: "Kernel Sprint",
        kind: "artifact",
        playMode: "build",
        benchmark: benchmarkProfile,
      },
    ];
  }
}

class NoopProvider implements ModelProvider {
  readonly name = "scripted" as const;
  private counter = 0;
  async respond(_request: ProviderRequest): Promise<ProviderResponse> {
    this.counter += 1;
    return {
      providerResponseId: `noop-${this.counter}`,
      resolvedModel: "prompt-gym-scripted-demo",
      visibleText: "I need more direction.",
      toolCalls: [],
      usage: {
        schemaVersion: "usage.v1",
        provider: "scripted",
        providerResponseId: `noop-${this.counter}`,
        resolvedModel: "prompt-gym-scripted-demo",
        inputTokens: 10,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 5,
        reasoningTokens: 1,
        totalTokens: 15,
        imageTokens: 0,
        toolUnits: 0,
        priceVersion: "test",
        actualCostNanoUsd: 0,
        createdAt: fixedClock.now().toISOString(),
      },
    };
  }
}

describe("ranked release gate", () => {
  it("defaults every arena to unranked", () => {
    expect(createDefaultArena(fixedClock.now()).ranked).toBe(false);
    expect(resolveRankedPlayEnabled({})).toBe(false);
    expect(resolveRankedPlayEnabled({ enabled: "false" })).toBe(false);
  });

  it("requires the exact isolation attestation before enabling ranked play", () => {
    expect(() => resolveRankedPlayEnabled({ enabled: "true" })).toThrow(/isolation attestation/i);
    expect(() => resolveRankedPlayEnabled({ enabled: "true", isolationAttestation: "almost" })).toThrow(
      /isolation attestation/i,
    );
    expect(
      resolveRankedPlayEnabled({
        enabled: "true",
        isolationAttestation: RANKED_ISOLATION_ATTESTATION,
      }),
    ).toBe(true);
  });
});

describe("Prompt Gym run engine", () => {
  it("fails closed instead of routing benchmark manifests through Daily Gym", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new BenchmarkPreviewChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );

    await expect(service.listChallenges()).resolves.toMatchObject({ challenges: [] });
    await expect(
      service.createAttempt({ id: "benchmark-user" }, "kernel-sprint", false),
    ).rejects.toMatchObject({
      code: "BENCHMARK_NOT_ENABLED",
    });
  });

  it("keeps local fallback attempts unranked and solves through visible tools", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "user-1" }, "signal-vault", true);
    expect(attempt.ranked).toBe(false);
    const turn = await service.queueTurn(
      "user-1",
      attempt.id,
      "Inspect carefully and follow the signal path.",
    );
    const engine = new RunEngine(service, new ScriptedModelProvider(), {
      safetySecret: "safe",
      clock: fixedClock,
    });
    await engine.processTurn(turn.id);
    const completed = await service.requireAttempt(attempt.id);
    expect(completed.status).toBe("solved");
    expect(completed.competitionTokens).toBeGreaterThan(0);
    const events = await repository.listEvents(attempt.id);
    expect(events.some((event) => event.type === "model.thinking")).toBe(true);
    expect(
      events.some((event) => event.type === "verification.completed" && event.payload.passed === true),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain("privateResultRef");
  });

  it("does not permit a second concurrent player turn", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "user-2" }, "rigged-race", false);
    await service.queueTurn("user-2", attempt.id, "Analyze the race.");
    await expect(service.queueTurn("user-2", attempt.id, "Also check drift.")).rejects.toMatchObject({
      code: "RUN_ACTIVE",
    });
  });

  it("keeps consented replays owner-only until the redaction pipeline is available", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "replay-owner" }, "signal-vault", false);
    await service.saveConsent("replay-owner", {
      research: false,
      publicReplay: true,
      version: "2026-07-12.v1",
    });

    await expect(service.replay("other-player", attempt.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.replay("replay-owner", attempt.id)).resolves.toMatchObject({
      attempt: { id: attempt.id },
    });
  });

  it("expires an abandoned run before checking the one-active-attempt guard", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const abandoned = await service.createAttempt({ id: "user-expired" }, "signal-vault", false);
    await repository.updateAttempt(abandoned.id, (current) => ({
      ...current,
      expiresAt: "2026-07-12T11:59:59.000Z",
    }));
    const replacement = await service.createAttempt({ id: "user-expired" }, "rigged-race", false);
    expect((await service.requireAttempt(abandoned.id)).status).toBe("expired");
    expect(replacement.status).toBe("ready");
  });

  it("cancels a persisted queued turn after a process restart", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "user-recover" }, "rigged-race", false);
    const queued = await service.queueTurn("user-recover", attempt.id, "Read the evidence.");
    const restartedEngine = new RunEngine(service, new NoopProvider(), {
      safetySecret: "safe",
      clock: fixedClock,
    });
    expect(await restartedEngine.stopTurn(attempt.id)).toBe(true);
    expect((await repository.getTurn(queued.id))?.status).toBe("cancelled");
    await expect(
      service.queueTurn("user-recover", attempt.id, "Try a narrower check."),
    ).resolves.toBeDefined();
  });

  it("stops only the active model turn and lets the player coach again", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "user-stop" }, "signal-vault", false);
    const turn = await service.queueTurn("user-stop", attempt.id, "Inspect the panel.");
    const provider: ModelProvider = {
      name: "scripted",
      respond: (request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
            once: true,
          });
        }),
    };
    const engine = new RunEngine(service, provider, { safetySecret: "safe", clock: fixedClock });
    const work = engine.processTurn(turn.id);
    expect(await engine.stopTurn(attempt.id)).toBe(true);
    await work;
    expect((await service.requireAttempt(attempt.id)).status).toBe("awaiting_player");
    await expect(
      service.queueTurn("user-stop", attempt.id, "Now use the new evidence."),
    ).resolves.toBeDefined();
  });

  it("unlocks hints after two unsolved turns and permanently marks the run assisted", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "user-hint" }, "rigged-race", false);
    const engine = new RunEngine(service, new NoopProvider(), { safetySecret: "safe", clock: fixedClock });
    for (const prompt of ["Look at the times.", "Recheck the sensors."]) {
      const turn = await service.queueTurn("user-hint", attempt.id, prompt);
      await engine.processTurn(turn.id);
    }
    const unlocked = await service.unlockHint("user-hint", attempt.id);
    expect(unlocked.attempt.assisted).toBe(true);
    expect(unlocked.hint).toContain("aliases");
  });

  it("conservatively charges the full reservation when provider completion is ambiguous", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const attempt = await service.createAttempt({ id: "user-ambiguous" }, "signal-vault", false);
    const turn = await service.queueTurn("user-ambiguous", attempt.id, "Open the vault.");
    const provider: ModelProvider = {
      name: "scripted",
      respond: async () => {
        throw new PromptGymError("PROVIDER_AMBIGUOUS", "unknown", 502);
      },
    };
    const engine = new RunEngine(service, provider, { safetySecret: "safe", clock: fixedClock });
    await expect(engine.processTurn(turn.id)).rejects.toMatchObject({ code: "PROVIDER_AMBIGUOUS" });
    const failed = await service.requireAttempt(attempt.id);
    expect(failed.actualCostNanoUsd).toBe(failed.maxActualCostNanoUsd);
    expect(failed.status).toBe("failed");
  });

  it("counts provider-reported usage before rejecting a resolved-model drift", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const created = await service.createAttempt({ id: "user-model-drift" }, "signal-vault", false);
    await repository.updateAttempt(created.id, (attempt) => ({ ...attempt, ranked: true }));
    const turn = await service.queueTurn("user-model-drift", created.id, "Open the vault.");
    const engine = new RunEngine(service, new NoopProvider(), { safetySecret: "safe", clock: fixedClock });

    await expect(engine.processTurn(turn.id)).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect((await service.requireAttempt(created.id)).competitionTokens).toBe(15);
    expect(await repository.listUsage(created.id)).toHaveLength(1);
  });

  it("expires a queued turn without calling the provider", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const created = await service.createAttempt({ id: "user-deadline" }, "signal-vault", false);
    const turn = await service.queueTurn("user-deadline", created.id, "Inspect the vault.");
    await repository.updateAttempt(created.id, (attempt) => ({
      ...attempt,
      expiresAt: fixedClock.now().toISOString(),
    }));
    const respond = vi.fn<ModelProvider["respond"]>();
    await new RunEngine(
      service,
      { name: "scripted", respond },
      { safetySecret: "safe", clock: fixedClock },
    ).processTurn(turn.id);
    expect(respond).not.toHaveBeenCalled();
    expect((await service.requireAttempt(created.id)).status).toBe("expired");
    expect((await repository.getTurn(turn.id))?.failureCode).toBe("ATTEMPT_EXPIRED");
  });

  it("closes a persisted running turn without retrying and conservatively settles its reservation", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const created = await service.createAttempt({ id: "user-redelivery" }, "signal-vault", false);
    const turn = await service.queueTurn("user-redelivery", created.id, "Open the vault.");
    await repository.updateTurn(turn.id, (item) => ({
      ...item,
      status: "running",
      startedAt: fixedClock.now().toISOString(),
    }));
    await repository.updateAttempt(created.id, (attempt) => ({ ...attempt, status: "running" }));
    await repository.reserveCost({
      attemptId: created.id,
      userId: created.userId,
      utcDay: "2026-07-12",
      amountNanoUsd: created.maxActualCostNanoUsd,
      attemptLimitNanoUsd: created.maxActualCostNanoUsd,
      userDailyLimitNanoUsd: 750_000_000,
      globalDailyLimitNanoUsd: 100_000_000_000,
    });
    const respond = vi.fn<ModelProvider["respond"]>();
    await new RunEngine(
      service,
      { name: "scripted", respond },
      { safetySecret: "safe", clock: fixedClock },
    ).processTurn(turn.id);
    expect(respond).not.toHaveBeenCalled();
    expect(await service.requireAttempt(created.id)).toMatchObject({
      status: "failed",
      actualCostNanoUsd: created.maxActualCostNanoUsd,
    });
    expect(await repository.getTurn(turn.id)).toMatchObject({
      status: "failed",
      failureCode: "WORKER_INTERRUPTED",
    });
  });

  it("bounds a provider call and treats an unconfirmed timeout as full-cost ambiguity", async () => {
    const repository = new InMemoryPromptGymRepository();
    const service = new PromptGymService(
      repository,
      new LocalDemoChallengeService(),
      createDefaultArena(fixedClock.now()),
      new RunEventHub(),
      "assign",
      "handle",
      fixedClock,
    );
    const created = await service.createAttempt({ id: "user-timeout" }, "signal-vault", false);
    const turn = await service.queueTurn("user-timeout", created.id, "Open the vault.");
    const provider: ModelProvider = {
      name: "scripted",
      respond: async () => new Promise<ProviderResponse>(() => undefined),
    };
    const engine = new RunEngine(service, provider, {
      safetySecret: "safe",
      clock: fixedClock,
      providerCallTimeoutMs: 5,
    });
    await expect(engine.processTurn(turn.id)).rejects.toMatchObject({ code: "PROVIDER_AMBIGUOUS" });
    expect(await service.requireAttempt(created.id)).toMatchObject({
      status: "failed",
      actualCostNanoUsd: created.maxActualCostNanoUsd,
    });
  });
});
