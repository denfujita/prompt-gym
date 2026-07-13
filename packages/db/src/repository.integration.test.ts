import { randomUUID } from "node:crypto";
import type {
  ArenaConfig,
  AttemptState,
  ChallengeInstanceEnvelope,
  ChallengeManifest,
  ConsentRecord,
  EligibilityRecord,
  Turn,
  UsageV1,
} from "@prompt-gym/contracts";
import { GENESIS_EVENT_HASH, verifyEventChain } from "@prompt-gym/core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresPromptGymRepository } from "./repository.js";

const databaseUrl = process.env.POSTGRES_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

const manifest: ChallengeManifest = {
  slug: "signal-vault",
  version: "1.0.0",
  title: "Signal Vault",
  shortDescription: "Open the vault.",
  playerBrief: "A short player story.",
  winCondition: "Open every chamber.",
  brief: "Use the visible controls to open all chambers.",
  kind: "visual",
  playMode: "puzzle",
  accent: { name: "Volt", hex: "#dfff00", symbol: "⚡" },
  difficulty: "hard",
  estimatedMinutes: 8,
  actionBudgetLabel: "24 control actions",
  maxPrompts: 6,
  maxToolActionsPerTurn: 8,
  maxCompetitionTokens: 20_000,
  featured: true,
  accessibilityLabel: "Signal Vault challenge",
};

const arena: ArenaConfig = {
  id: "test-season:gpt-5.6-terra:medium:test-price",
  seasonId: "test-season",
  modelAlias: "gpt-5.6-terra",
  resolvedModel: "gpt-5.6-terra",
  reasoningEffort: "medium",
  responseVerbosity: "low",
  priceVersion: "test-price",
  sandboxImageDigest: "sha256:test-sandbox",
  ranked: true,
  startsAt: "2026-07-06T00:00:00.000Z",
  endsAt: "2026-07-13T00:00:00.000Z",
};

function envelope(seed: string = randomUUID()): ChallengeInstanceEnvelope {
  return {
    instance: {
      id: randomUUID(),
      challengeSlug: manifest.slug,
      challengeVersion: manifest.version,
      instanceClass: "calibrated-private",
      seedCommitment: seed,
      sandboxImageDigest: arena.sandboxImageDigest,
    },
    publicState: { chamber: 1, status: "LOCKED" },
    modelBrief: manifest.brief,
    allowedTools: [{ name: "press", description: "Press a control", inputSchema: { type: "object" } }],
  };
}

function attempt(userId: string, instanceEnvelope = envelope(), ranked = false): AttemptState {
  return {
    id: randomUUID(),
    userId,
    publicHandle: `player-${userId.slice(-6)}`,
    arenaId: arena.id,
    challengeSlug: manifest.slug,
    challengeVersion: manifest.version,
    instance: instanceEnvelope.instance,
    ranked,
    assisted: false,
    status: "created",
    promptsUsed: 0,
    toolActionsUsed: 0,
    competitionTokens: 0,
    actualCostNanoUsd: 0,
    maxPrompts: 6,
    maxToolActionsPerTurn: 8,
    maxCompetitionTokens: 20_000,
    maxActualCostNanoUsd: 250_000_000,
    startedAt: "2026-07-12T12:00:00.000Z",
    expiresAt: "2026-07-12T12:10:00.000Z",
    lastEventSequence: 0,
    lastEventHash: GENESIS_EVENT_HASH,
  };
}

suite("PostgresPromptGymRepository", () => {
  let repository: PostgresPromptGymRepository;
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { prepare: false, max: 1 });
    await admin`
      truncate table
        dataset_release_episode, dataset_release, baseline_run, artifact, leaderboard_entry,
        verification_run, usage_item, run_event, turn, cost_reservation, credit_ledger,
        fraud_signal, consent_record, eligibility_record, daily_cost_total, attempt, task_instance,
        arena, challenge_version, challenge
      restart identity cascade
    `;
    repository = new PostgresPromptGymRepository({
      databaseUrl: databaseUrl!,
      arena,
      challenges: [manifest],
      maxConnections: 12,
    });
    await repository.initialize();
  });

  afterAll(async () => {
    await repository?.close();
    await admin?.end();
  });

  it("round-trips attempts, envelopes, and row-locked turn updates", async () => {
    const instanceEnvelope = envelope("seed-roundtrip");
    const state = attempt(`roundtrip-${randomUUID()}`, instanceEnvelope);
    await repository.createAttempt(state, instanceEnvelope);

    expect(await repository.getAttempt(state.id)).toEqual(state);
    expect(await repository.getInstanceEnvelope(state.id)).toEqual(instanceEnvelope);

    const updated = await repository.updateAttempt(state.id, (current) => ({
      ...current,
      status: "ready",
      promptsUsed: 1,
    }));
    expect(updated.status).toBe("ready");
    expect((await repository.findActiveAttempt(state.userId))?.id).toBe(state.id);

    const turn: Turn = {
      id: randomUUID(),
      attemptId: state.id,
      ordinal: 1,
      prompt: "Test one hypothesis.",
      status: "queued",
      createdAt: "2026-07-12T12:00:01.000Z",
    };
    const queued = await repository.queueTurn(turn);
    expect(queued.attempt.promptsUsed).toBe(2);
    expect(queued.event.type).toBe("turn.queued");
    expect(queued.event.turnId).toBe(turn.id);
    const retried = await repository.queueTurn(turn);
    expect(retried.event.id).toBe(queued.event.id);
    expect(retried.attempt.promptsUsed).toBe(2);
    await expect(repository.queueTurn({ ...turn, prompt: "Changed prompt" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    for (const mutation of [
      { id: randomUUID() },
      { attemptId: randomUUID() },
      { ordinal: 2 },
      { prompt: "Changed prompt" },
      { createdAt: "2026-07-12T12:00:09.000Z" },
    ]) {
      await expect(
        repository.updateTurn(turn.id, (current) => ({ ...current, ...mutation })),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await repository.updateTurn(turn.id, (current) => ({
      ...current,
      status: "running",
      startedAt: "2026-07-12T12:00:02.000Z",
    }));
    expect((await repository.listTurns(state.id))[0]?.status).toBe("running");
  });

  it("serializes concurrent event appends into a valid hash chain", async () => {
    const state = attempt(`events-${randomUUID()}`);
    await repository.createAttempt(state, { ...envelope(), instance: state.instance });
    await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        repository.appendEvent({
          attemptId: state.id,
          actor: "system",
          type: "task.state",
          payload: { index },
          createdAt: `2026-07-12T12:00:${String(index).padStart(2, "0")}.000Z`,
        }),
      ),
    );
    const events = await repository.listEvents(state.id);
    expect(events).toHaveLength(16);
    expect(verifyEventChain(events)).toBe(true);
    expect((await repository.getAttempt(state.id))?.lastEventSequence).toBe(16);
  });

  it("deduplicates provider usage and stores verifier results without a private ref", async () => {
    const state = attempt(`usage-${randomUUID()}`);
    await repository.createAttempt(state, { ...envelope(), instance: state.instance });
    await repository.updateAttempt(state.id, (current) => ({ ...current, status: "ready" }));
    const turn: Turn = {
      id: randomUUID(),
      attemptId: state.id,
      ordinal: 1,
      prompt: "Check the evidence once.",
      status: "queued",
      createdAt: "2026-07-12T12:00:59.000Z",
    };
    await repository.queueTurn(turn);
    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openai",
      providerResponseId: `resp-${randomUUID()}`,
      resolvedModel: arena.resolvedModel,
      inputTokens: 100,
      cachedInputTokens: 80,
      cacheWriteTokens: 0,
      outputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 125,
      imageTokens: 0,
      toolUnits: 1,
      priceVersion: arena.priceVersion,
      actualCostNanoUsd: 1000,
      createdAt: "2026-07-12T12:01:00.000Z",
    };
    await Promise.all([
      repository.recordUsage(state.id, usage, turn.id),
      repository.recordUsage(state.id, usage, turn.id),
    ]);
    expect(await repository.listUsage(state.id)).toEqual([{ ...usage, turnId: turn.id }]);
    expect(await repository.getAttempt(state.id)).toMatchObject({
      competitionTokens: 125,
      actualCostNanoUsd: 1000,
    });
    await expect(
      repository.recordVerification(
        state.id,
        {
          passed: false,
          verifierDigest: "sha256:verifier",
          publicFeedback: "Try again.",
          verifiedAt: "2026-07-12T12:01:01.000Z",
        },
        turn.id,
      ),
    ).resolves.toBeUndefined();
    const linked = await admin<{ usage_turn_id: string | null; verification_turn_id: string | null }[]>`
      select usage.turn_id as usage_turn_id, verification.turn_id as verification_turn_id
      from usage_item usage
      join verification_run verification on verification.attempt_id = usage.attempt_id
      where usage.attempt_id = ${state.id}
    `;
    expect(linked[0]).toEqual({ usage_turn_id: turn.id, verification_turn_id: turn.id });
  });

  it("rejects cross-attempt turn lineage in repositories and composite constraints", async () => {
    const first = attempt(`lineage-a-${randomUUID()}`);
    const second = attempt(`lineage-b-${randomUUID()}`);
    await repository.createAttempt(first, { ...envelope(), instance: first.instance });
    await repository.createAttempt(second, { ...envelope(), instance: second.instance });
    await repository.updateAttempt(second.id, (current) => ({ ...current, status: "ready" }));
    const foreignTurn: Turn = {
      id: randomUUID(),
      attemptId: second.id,
      ordinal: 1,
      prompt: "Inspect the other attempt.",
      status: "queued",
      createdAt: "2026-07-12T12:01:10.000Z",
    };
    await repository.queueTurn(foreignTurn);
    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openai",
      providerResponseId: `resp-${randomUUID()}`,
      resolvedModel: arena.resolvedModel,
      inputTokens: 10,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 5,
      reasoningTokens: 0,
      totalTokens: 15,
      imageTokens: 0,
      toolUnits: 0,
      priceVersion: arena.priceVersion,
      actualCostNanoUsd: 100,
      createdAt: "2026-07-12T12:01:11.000Z",
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
          verifierDigest: "sha256:lineage",
          publicFeedback: "No",
          verifiedAt: "2026-07-12T12:01:12.000Z",
        },
        foreignTurn.id,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      admin`
        insert into run_event
          (id, attempt_id, turn_id, sequence, actor, event_type, public_payload, previous_hash, hash, created_at)
        values (
          ${randomUUID()}, ${first.id}, ${foreignTurn.id}, 1, 'model', 'model.message', '{}'::jsonb,
          ${GENESIS_EVENT_HASH}, ${"1".repeat(64)}, now()
        )
      `,
    ).rejects.toMatchObject({ code: "23503", constraint_name: "run_event_attempt_turn_fk" });
    await expect(
      admin`
        insert into usage_item (
          attempt_id, turn_id, provider, provider_response_id, resolved_model, input_tokens,
          cached_input_tokens, cache_write_tokens, output_tokens, reasoning_tokens,
          total_tokens, image_tokens, tool_units, price_version, actual_cost_nano_usd, created_at
        ) values (
          ${first.id}, ${foreignTurn.id}, 'openai', ${`direct-${randomUUID()}`}, ${arena.resolvedModel},
          1, 0, 0, 1, 0, 2, 0, 0, ${arena.priceVersion}, 1, now()
        )
      `,
    ).rejects.toMatchObject({ code: "23503", constraint_name: "usage_item_attempt_turn_fk" });
    await expect(
      admin`
        insert into verification_run
          (attempt_id, turn_id, passed, verifier_digest, public_feedback, verified_at)
        values (${first.id}, ${foreignTurn.id}, false, 'sha256:direct-lineage', 'No', now())
      `,
    ).rejects.toMatchObject({ code: "23503", constraint_name: "verification_run_attempt_turn_fk" });
    expect(await repository.listEvents(first.id)).toEqual([]);
    expect(await repository.listUsage(first.id)).toEqual([]);
    expect(await repository.getAttempt(first.id)).toMatchObject({
      lastEventSequence: 0,
      lastEventHash: GENESIS_EVENT_HASH,
      competitionTokens: 0,
      actualCostNanoUsd: 0,
    });
  });

  it("preserves hash-attested turn ids on direct deletion while account deletion still cascades", async () => {
    const state = attempt(`delete-lineage-${randomUUID()}`);
    await repository.createAttempt(state, { ...envelope(), instance: state.instance });
    await repository.updateAttempt(state.id, (current) => ({ ...current, status: "ready" }));
    const turn: Turn = {
      id: randomUUID(),
      attemptId: state.id,
      ordinal: 1,
      prompt: "Keep this lineage intact.",
      status: "queued",
      createdAt: "2026-07-12T12:01:20.000Z",
    };
    await repository.queueTurn(turn);
    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openai",
      providerResponseId: `resp-${randomUUID()}`,
      resolvedModel: arena.resolvedModel,
      inputTokens: 10,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 5,
      reasoningTokens: 0,
      totalTokens: 15,
      imageTokens: 0,
      toolUnits: 0,
      priceVersion: arena.priceVersion,
      actualCostNanoUsd: 100,
      createdAt: "2026-07-12T12:01:21.000Z",
    };
    await repository.recordUsage(state.id, usage, turn.id);
    await repository.recordVerification(
      state.id,
      {
        passed: true,
        verifierDigest: "sha256:delete-lineage",
        publicFeedback: "Pass",
        verifiedAt: "2026-07-12T12:01:22.000Z",
      },
      turn.id,
    );

    await expect(admin`delete from turn where id = ${turn.id}`).rejects.toMatchObject({
      code: "23503",
    });
    const events = await repository.listEvents(state.id);
    expect(events[0]?.turnId).toBe(turn.id);
    expect(verifyEventChain(events)).toBe(true);

    await expect(repository.deleteUser(state.userId)).resolves.toBeUndefined();
    const counts = await admin<
      { attempts: number; turns: number; events: number; usages: number; verifications: number }[]
    >`
      select
        (select count(*)::int from attempt where id = ${state.id}) as attempts,
        (select count(*)::int from turn where attempt_id = ${state.id}) as turns,
        (select count(*)::int from run_event where attempt_id = ${state.id}) as events,
        (select count(*)::int from usage_item where attempt_id = ${state.id}) as usages,
        (select count(*)::int from verification_run where attempt_id = ${state.id}) as verifications
    `;
    expect(counts[0]).toEqual({ attempts: 0, turns: 0, events: 0, usages: 0, verifications: 0 });
  });

  it("atomically enforces the global reservation cap and settles idempotently", async () => {
    const first = attempt(`budget-a-${randomUUID()}`);
    const second = attempt(`budget-b-${randomUUID()}`);
    await repository.createAttempt(first, { ...envelope(), instance: first.instance });
    await repository.createAttempt(second, { ...envelope(), instance: second.instance });
    const reserve = (state: AttemptState) =>
      repository.reserveCost({
        attemptId: state.id,
        userId: state.userId,
        utcDay: "2026-07-12",
        amountNanoUsd: 60,
        attemptLimitNanoUsd: 100,
        userDailyLimitNanoUsd: 100,
        globalDailyLimitNanoUsd: 100,
      });
    const results = await Promise.allSettled([reserve(first), reserve(second)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const reservation = results.find((result) => result.status === "fulfilled")!;
    if (reservation.status !== "fulfilled") throw new Error("Expected one reservation");
    await repository.settleCost(reservation.value.id, 25);
    await expect(repository.settleCost(reservation.value.id, 25)).resolves.toBeUndefined();
    await expect(repository.settleCost(reservation.value.id, 26)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("conservatively settles an interrupted running turn without retry state", async () => {
    const state = attempt(`recovery-${randomUUID()}`);
    await repository.createAttempt(state, { ...envelope(), instance: state.instance });
    await repository.updateAttempt(state.id, (current) => ({ ...current, status: "ready" }));
    const turn: Turn = {
      id: randomUUID(),
      attemptId: state.id,
      ordinal: 1,
      prompt: "Inspect once.",
      status: "queued",
      createdAt: "2026-07-12T12:01:00.000Z",
    };
    await repository.queueTurn(turn);
    await repository.updateTurn(turn.id, (current) => ({
      ...current,
      status: "running",
      startedAt: "2026-07-12T12:01:01.000Z",
    }));
    await repository.updateAttempt(state.id, (current) => ({ ...current, status: "running" }));
    const reservation = await repository.reserveCost({
      attemptId: state.id,
      userId: state.userId,
      utcDay: "2026-07-12",
      amountNanoUsd: 50,
      attemptLimitNanoUsd: 100,
      userDailyLimitNanoUsd: 100,
      globalDailyLimitNanoUsd: 1_000,
    });

    const recovery = await repository.recoverInterruptedTurn(turn.id, "2026-07-12T12:01:05.000Z");
    expect(recovery).toMatchObject({ recovered: true, chargedNanoUsd: 50 });
    expect(await repository.getAttempt(state.id)).toMatchObject({ status: "failed", actualCostNanoUsd: 50 });
    expect(await repository.getTurn(turn.id)).toMatchObject({
      status: "failed",
      failureCode: "WORKER_INTERRUPTED",
    });
    const rows = await admin<{ status: string; actual_nano_usd: number | string }[]>`
      select status, actual_nano_usd from cost_reservation where id = ${reservation.id}
    `;
    expect(rows[0]).toMatchObject({ status: "settled" });
    expect(Number(rows[0]?.actual_nano_usd)).toBe(50);
    expect(await repository.recoverInterruptedTurn(turn.id, "2026-07-12T12:01:06.000Z")).toEqual({
      recovered: false,
      chargedNanoUsd: 0,
    });
  });

  it("keeps exact-seed leaderboard scopes and competition ranking semantics", async () => {
    const first = attempt(`leader-a-${randomUUID()}`, envelope("seed-board-a"));
    const second = attempt(`leader-b-${randomUUID()}`, envelope("seed-board-a"));
    const otherSeed = attempt(`leader-c-${randomUUID()}`, envelope("seed-board-b"));
    await repository.createAttempt(first, { ...envelope(), instance: first.instance });
    await repository.createAttempt(second, { ...envelope(), instance: second.instance });
    await repository.createAttempt(otherSeed, { ...envelope(), instance: otherSeed.instance });
    await repository.saveLeaderboardEntry({
      arenaId: arena.id,
      challengeSlug: manifest.slug,
      instanceId: "seed-board-a",
      attemptId: first.id,
      publicHandle: first.publicHandle,
      competitionTokens: 200,
      turns: 2,
      assisted: false,
      solvedAt: "2026-07-12T12:02:00.000Z",
    });
    await repository.saveLeaderboardEntry({
      arenaId: arena.id,
      challengeSlug: manifest.slug,
      instanceId: "seed-board-a",
      attemptId: second.id,
      publicHandle: second.publicHandle,
      competitionTokens: 200,
      turns: 3,
      assisted: false,
      solvedAt: "2026-07-12T12:03:00.000Z",
    });
    await repository.saveLeaderboardEntry({
      arenaId: arena.id,
      challengeSlug: manifest.slug,
      instanceId: "seed-board-b",
      attemptId: otherSeed.id,
      publicHandle: otherSeed.publicHandle,
      competitionTokens: 50,
      turns: 1,
      assisted: false,
      solvedAt: "2026-07-12T12:04:00.000Z",
    });
    const entries = await repository.listLeaderboard({
      arenaId: arena.id,
      challengeSlug: manifest.slug,
      instanceId: "seed-board-a",
    });
    expect(entries.map((entry) => entry.rank)).toEqual([1, 1]);
    expect(entries.map((entry) => entry.competitionTokens)).toEqual([200, 200]);
  });

  it("versions consent, stores eligibility, and deletes operational user data", async () => {
    const userId = `delete-${randomUUID()}`;
    const state = attempt(userId);
    await repository.createAttempt(state, { ...envelope(), instance: state.instance });
    const consent: ConsentRecord = {
      userId,
      version: "2026-07-12",
      operational: true,
      research: false,
      publicReplay: false,
      recordedAt: "2026-07-12T12:05:00.000Z",
    };
    const eligibility: EligibilityRecord = {
      userId,
      age18Plus: true,
      usResident: true,
      version: "2026-07-12",
      recordedAt: "2026-07-12T12:05:01.000Z",
    };
    await repository.saveConsent(consent);
    await repository.saveEligibility(eligibility);
    expect(await repository.getConsent(userId)).toEqual(consent);
    expect(await repository.getEligibility(userId)).toEqual(eligibility);
    await repository.deleteUser(userId);
    expect(await repository.getAttempt(state.id)).toBeUndefined();
    expect(await repository.getConsent(userId)).toBeUndefined();
    expect(await repository.getEligibility(userId)).toBeUndefined();
  });
});
