import { createHash } from "node:crypto";
import type {
  ArenaConfig,
  AttemptState,
  ChallengeInstanceEnvelope,
  ChallengeManifest,
  ConsentRecord,
  EligibilityRecord,
  JsonValue,
  LeaderboardEntry,
  RunEvent,
  Turn,
  UsageV1,
  VerificationResult,
} from "@prompt-gym/contracts";
import {
  GENESIS_EVENT_HASH,
  PromptGymError,
  createVisibleRunEvent,
  type CostReservation,
  type CostReservationInput,
  type EventInput,
  type InterruptedTurnRecovery,
  type LeaderboardQuery,
  type PromptGymRepository,
  type QueuedTurnResult,
  type UsageRecordResult,
} from "@prompt-gym/core";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

interface StoredLeaderboardEntry extends Omit<LeaderboardEntry, "rank"> {
  arenaId: string;
  challengeSlug: string;
  instanceId: string;
}

interface RunEventRow {
  id: string;
  attempt_id: string;
  turn_id: string | null;
  sequence: number;
  actor: RunEvent["actor"];
  event_type: RunEvent["type"];
  public_payload: Record<string, JsonValue>;
  created_at: Date | string;
  previous_hash: string;
  hash: string;
}

export interface PostgresPromptGymRepositoryOptions {
  databaseUrl: string;
  arena: ArenaConfig;
  challenges: ChallengeManifest[];
  maxConnections?: number;
}

type Queryable = postgres.Sql | postgres.TransactionSql;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deterministicSeedSlot(seedCommitment: string): number {
  return Number.parseInt(digest(seedCommitment).slice(0, 2), 16) % 3;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRunEvent(row: RunEventRow): RunEvent {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    ...(row.turn_id ? { turnId: row.turn_id } : {}),
    sequence: row.sequence,
    actor: row.actor,
    type: row.event_type,
    payload: clone(row.public_payload),
    createdAt: iso(row.created_at),
    previousHash: row.previous_hash,
    hash: row.hash,
  };
}

function assertImmutableTurnFields(current: Turn, next: Turn): void {
  if (
    next.id !== current.id ||
    next.attemptId !== current.attemptId ||
    next.ordinal !== current.ordinal ||
    next.prompt !== current.prompt ||
    next.createdAt !== current.createdAt
  ) {
    throw new PromptGymError("CONFLICT", "Immutable turn fields were changed", 409);
  }
}

function resolveTurnLink(explicitTurnId?: string, embeddedTurnId?: string): string | undefined {
  if (explicitTurnId && embeddedTurnId && explicitTurnId !== embeddedTurnId) {
    throw new PromptGymError("CONFLICT", "Conflicting turn lineage was supplied", 409);
  }
  return explicitTurnId ?? embeddedTurnId;
}

function isSafeMoney(value: number, allowZero: boolean): boolean {
  return Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
}

function numeric(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(number))
    throw new PromptGymError("CONFLICT", "Stored cost is outside the safe accounting range", 500);
  return number;
}

function asAttempt(value: unknown): AttemptState {
  return clone(value as AttemptState);
}

function asTurn(value: unknown): Turn {
  return clone(value as Turn);
}

function asEnvelope(value: unknown): ChallengeInstanceEnvelope {
  return clone(value as ChallengeInstanceEnvelope);
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof PromptGymError) throw error;
  const dbError = error as { code?: string; constraint_name?: string };
  if (dbError.code === "23505") {
    if (dbError.constraint_name === "attempt_one_active_user_uq") {
      throw new PromptGymError("RUN_ACTIVE", "Finish or stop your current run first", 409);
    }
    if (dbError.constraint_name === "attempt_ranked_daily_challenge_uq") {
      throw new PromptGymError(
        "ENERGY_EXHAUSTED",
        "Today's ranked start for this challenge is already used",
        409,
      );
    }
    throw new PromptGymError("CONFLICT", "The record already exists", 409);
  }
  if (dbError.code === "23503")
    throw new PromptGymError("NOT_FOUND", "A referenced record was not found", 404);
  throw error;
}

/**
 * Durable repository for the API and worker. Every read-modify-write operation
 * locks its owning row, event sequence allocation is serialized per attempt,
 * and daily cost checks share a PostgreSQL advisory lock per UTC day.
 *
 * Apply the package migrations before constructing this class. `initialize()`
 * is safe to call repeatedly and waits for catalog bootstrapping.
 */
export class PostgresPromptGymRepository implements PromptGymRepository {
  private readonly client: postgres.Sql;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  private readonly ready: Promise<void>;

  constructor(private readonly options: PostgresPromptGymRepositoryOptions) {
    if (!options.databaseUrl) throw new Error("databaseUrl is required");
    this.client = postgres(options.databaseUrl, { prepare: false, max: options.maxConnections ?? 10 });
    this.db = drizzle(this.client, { schema });
    this.ready = this.bootstrap();
  }

  async initialize(): Promise<void> {
    await this.ready;
  }

  async close(): Promise<void> {
    await this.ready.catch(() => undefined);
    await this.client.end();
  }

  private async bootstrap(): Promise<void> {
    const { arena, challenges } = this.options;
    await this.client.begin(async (tx) => {
      for (const manifest of challenges) {
        await tx`
          insert into challenge (slug, title, kind, active)
          values (${manifest.slug}, ${manifest.title}, ${manifest.kind}, true)
          on conflict (slug) do update set title = excluded.title, kind = excluded.kind, active = true
        `;
        await tx`
          insert into challenge_version
            (challenge_slug, version, manifest, generator_digest, verifier_digest, tool_schema_digest)
          values (
            ${manifest.slug}, ${manifest.version}, ${jsonText(manifest)}::jsonb,
            ${digest([manifest.slug, manifest.version, "generator"])},
            ${digest([manifest.slug, manifest.version, "verifier"])},
            ${digest([manifest.slug, manifest.version, "tools"])}
          )
          on conflict (challenge_slug, version) do update set manifest = excluded.manifest
        `;
      }
      await tx`
        insert into arena
          (id, season_id, model_alias, resolved_model, reasoning_effort, response_verbosity,
           price_version, sandbox_image_digest, ranked, starts_at, ends_at)
        values (
          ${arena.id}, ${arena.seasonId}, ${arena.modelAlias}, ${arena.resolvedModel},
          ${arena.reasoningEffort}, ${arena.responseVerbosity}, ${arena.priceVersion},
          ${arena.sandboxImageDigest}, ${arena.ranked}, ${arena.startsAt}, ${arena.endsAt}
        )
        on conflict (id) do nothing
      `;
      const stored = await tx<
        {
          season_id: string;
          model_alias: string;
          resolved_model: string;
          reasoning_effort: string;
          response_verbosity: string;
          price_version: string;
          sandbox_image_digest: string;
          ranked: boolean;
          starts_at: Date | string;
          ends_at: Date | string;
        }[]
      >`
        select season_id, model_alias, resolved_model, reasoning_effort, response_verbosity,
          price_version, sandbox_image_digest, ranked, starts_at, ends_at
        from arena where id = ${arena.id}
      `;
      const row = stored[0];
      if (
        !row ||
        row.season_id !== arena.seasonId ||
        row.model_alias !== arena.modelAlias ||
        row.resolved_model !== arena.resolvedModel ||
        row.reasoning_effort !== arena.reasoningEffort ||
        row.response_verbosity !== arena.responseVerbosity ||
        row.price_version !== arena.priceVersion ||
        row.sandbox_image_digest !== arena.sandboxImageDigest ||
        row.ranked !== arena.ranked ||
        iso(row.starts_at) !== iso(arena.startsAt) ||
        iso(row.ends_at) !== iso(arena.endsAt)
      ) {
        throw new PromptGymError("CONFLICT", "Arena configuration is immutable; create a new arena id", 409);
      }
    });
  }

  async createAttempt(attempt: AttemptState, envelope: ChallengeInstanceEnvelope): Promise<void> {
    await this.ready;
    if (attempt.instance.id !== envelope.instance.id) {
      throw new PromptGymError("CONFLICT", "Attempt and challenge instance do not match", 409);
    }
    try {
      await this.client.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${`prompt-gym:attempt:${attempt.userId}`}, 0))`;
        const active = await tx<{ id: string }[]>`
          select id from attempt
          where user_id = ${attempt.userId}
            and status in ('created', 'ready', 'running', 'awaiting_player')
          limit 1
        `;
        if (active.length > 0)
          throw new PromptGymError("RUN_ACTIVE", "Finish or stop your current run first", 409);

        const startedDay = attempt.startedAt.slice(0, 10);
        if (attempt.ranked) {
          const sameChallenge = await tx<{ present: boolean }[]>`
            select exists(
              select 1 from attempt
              where user_id = ${attempt.userId} and challenge_slug = ${attempt.challengeSlug}
                and started_day = ${startedDay} and ranked = true
            ) as present
          `;
          if (sameChallenge[0]?.present) {
            throw new PromptGymError(
              "ENERGY_EXHAUSTED",
              "Today's ranked start for this challenge is already used",
              409,
            );
          }
          const starts = await tx<{ count: number }[]>`
            select count(*)::int as count from attempt
            where user_id = ${attempt.userId} and started_day = ${startedDay} and ranked = true
          `;
          if ((starts[0]?.count ?? 0) >= 3) {
            throw new PromptGymError("ENERGY_EXHAUSTED", "All three daily energy passes are used", 409);
          }
        }

        const versions = await tx<{ id: string }[]>`
          select id from challenge_version
          where challenge_slug = ${attempt.challengeSlug} and version = ${attempt.challengeVersion}
          limit 1
        `;
        const challengeVersionId = versions[0]?.id;
        if (!challengeVersionId) throw new PromptGymError("NOT_FOUND", "Challenge version not found", 404);
        const taskInstanceId = digest([
          attempt.challengeSlug,
          attempt.challengeVersion,
          attempt.instance.seedCommitment,
          attempt.instance.sandboxImageDigest,
        ]);
        await tx`
          insert into task_instance
            (id, challenge_version_id, instance_class, seed_commitment, sandbox_image_digest,
             assigned_day, seed_slot, private_locator)
          values (
            ${taskInstanceId}, ${challengeVersionId}, ${attempt.instance.instanceClass},
            ${attempt.instance.seedCommitment}, ${attempt.instance.sandboxImageDigest},
            ${startedDay}, ${deterministicSeedSlot(attempt.instance.seedCommitment)}, ${`challenge-service:${taskInstanceId}`}
          )
          on conflict (challenge_version_id, seed_commitment, sandbox_image_digest) do nothing
        `;
        await tx`
          insert into attempt (
            id, user_id, public_handle, arena_id, challenge_version_id, task_instance_id,
            ranked, assisted, status, prompts_used, tool_actions_used, competition_tokens,
            actual_cost_nano_usd, max_prompts, max_tool_actions_per_turn,
            max_competition_tokens, max_actual_cost_nano_usd, last_event_sequence,
            last_event_hash, challenge_slug, challenge_version, started_day, state, envelope,
            started_at, expires_at, completed_at
          ) values (
            ${attempt.id}, ${attempt.userId}, ${attempt.publicHandle}, ${attempt.arenaId},
            ${challengeVersionId}, ${taskInstanceId}, ${attempt.ranked}, ${attempt.assisted},
            ${attempt.status}, ${attempt.promptsUsed}, ${attempt.toolActionsUsed},
            ${attempt.competitionTokens}, ${attempt.actualCostNanoUsd}, ${attempt.maxPrompts},
            ${attempt.maxToolActionsPerTurn}, ${attempt.maxCompetitionTokens},
            ${attempt.maxActualCostNanoUsd}, ${attempt.lastEventSequence}, ${attempt.lastEventHash},
            ${attempt.challengeSlug}, ${attempt.challengeVersion}, ${startedDay},
            ${jsonText(attempt)}::jsonb, ${jsonText(envelope)}::jsonb,
            ${attempt.startedAt}, ${attempt.expiresAt}, ${attempt.completedAt ?? null}
          )
        `;
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async getAttempt(id: string): Promise<AttemptState | undefined> {
    await this.ready;
    const rows = await this.client<{ state: unknown }[]>`select state from attempt where id = ${id} limit 1`;
    return rows[0] ? asAttempt(rows[0].state) : undefined;
  }

  async updateAttempt(id: string, update: (attempt: AttemptState) => AttemptState): Promise<AttemptState> {
    await this.ready;
    try {
      return await this.client.begin(async (tx) => {
        const rows = await tx<{ state: unknown; task_instance_id: string }[]>`
          select state, task_instance_id from attempt where id = ${id} for update
        `;
        const row = rows[0];
        if (!row) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
        const current = asAttempt(row.state);
        const next = clone(update(clone(current)));
        if (next.id !== id || next.userId !== current.userId || next.instance.id !== current.instance.id) {
          throw new PromptGymError("CONFLICT", "Immutable attempt identity was changed", 409);
        }
        await tx`
          update attempt set
            public_handle = ${next.publicHandle}, arena_id = ${next.arenaId}, ranked = ${next.ranked},
            assisted = ${next.assisted}, status = ${next.status}, prompts_used = ${next.promptsUsed},
            tool_actions_used = ${next.toolActionsUsed}, competition_tokens = ${next.competitionTokens},
            actual_cost_nano_usd = ${next.actualCostNanoUsd}, max_prompts = ${next.maxPrompts},
            max_tool_actions_per_turn = ${next.maxToolActionsPerTurn},
            max_competition_tokens = ${next.maxCompetitionTokens},
            max_actual_cost_nano_usd = ${next.maxActualCostNanoUsd},
            last_event_sequence = ${next.lastEventSequence}, last_event_hash = ${next.lastEventHash},
            started_at = ${next.startedAt}, expires_at = ${next.expiresAt},
            completed_at = ${next.completedAt ?? null}, state = ${jsonText(next)}::jsonb
          where id = ${id}
        `;
        return next;
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async findActiveAttempt(userId: string): Promise<AttemptState | undefined> {
    await this.ready;
    const rows = await this.client<{ state: unknown }[]>`
      select state from attempt where user_id = ${userId}
        and status in ('created', 'ready', 'running', 'awaiting_player')
      order by started_at desc limit 1
    `;
    return rows[0] ? asAttempt(rows[0].state) : undefined;
  }

  async hasRankedStart(userId: string, challengeSlug: string, utcDay: string): Promise<boolean> {
    await this.ready;
    const rows = await this.client<{ present: boolean }[]>`
      select exists(
        select 1 from attempt where user_id = ${userId} and challenge_slug = ${challengeSlug}
          and started_day = ${utcDay} and ranked = true
      ) as present
    `;
    return rows[0]?.present ?? false;
  }

  async countRankedStarts(userId: string, utcDay: string): Promise<number> {
    await this.ready;
    const rows = await this.client<{ count: number }[]>`
      select count(*)::int as count from attempt
      where user_id = ${userId} and started_day = ${utcDay} and ranked = true
    `;
    return rows[0]?.count ?? 0;
  }

  async getInstanceEnvelope(attemptId: string): Promise<ChallengeInstanceEnvelope | undefined> {
    await this.ready;
    const rows = await this.client<
      { envelope: unknown }[]
    >`select envelope from attempt where id = ${attemptId} limit 1`;
    return rows[0] ? asEnvelope(rows[0].envelope) : undefined;
  }

  private async assertTurnLineage(
    tx: postgres.TransactionSql,
    attemptId: string,
    turnId: string,
  ): Promise<void> {
    const rows = await tx<{ present: boolean }[]>`
      select exists(
        select 1 from turn where id = ${turnId} and attempt_id = ${attemptId}
      ) as present
    `;
    if (!rows[0]?.present) {
      throw new PromptGymError("CONFLICT", "Turn does not belong to this attempt", 409);
    }
  }

  async createTurn(turn: Turn): Promise<void> {
    await this.ready;
    try {
      await this.client`
        insert into turn (id, attempt_id, ordinal, prompt, status, failure_code, state, created_at, started_at, completed_at)
        values (
          ${turn.id}, ${turn.attemptId}, ${turn.ordinal}, ${turn.prompt}, ${turn.status},
          ${turn.failureCode ?? null}, ${jsonText(turn)}::jsonb, ${turn.createdAt},
          ${turn.startedAt ?? null}, ${turn.completedAt ?? null}
        )
      `;
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async queueTurn(turn: Turn): Promise<QueuedTurnResult> {
    await this.ready;
    try {
      return await this.client.begin(async (tx) => {
        const rows = await tx<{ state: unknown; last_event_sequence: number; last_event_hash: string }[]>`
          select state, last_event_sequence, last_event_hash from attempt where id = ${turn.attemptId} for update
        `;
        const row = rows[0];
        if (!row) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
        const current = asAttempt(row.state);
        const existingRows = await tx<{ state: unknown }[]>`
          select state from turn where id = ${turn.id} for update
        `;
        if (existingRows[0]) {
          const existing = asTurn(existingRows[0].state);
          assertImmutableTurnFields(existing, turn);
          const eventRows = await tx<RunEventRow[]>`
            select id, attempt_id, turn_id, sequence, actor, event_type, public_payload,
              created_at, previous_hash, hash
            from run_event
            where attempt_id = ${turn.attemptId} and turn_id = ${turn.id} and event_type = 'turn.queued'
            order by sequence asc limit 1
          `;
          if (!eventRows[0]) {
            throw new PromptGymError("CONFLICT", "Turn exists without its queued event", 409);
          }
          return { turn: existing, attempt: current, event: mapRunEvent(eventRows[0]) };
        }
        const activeTurns = await tx<{ present: boolean }[]>`
          select exists(
            select 1 from turn where attempt_id = ${turn.attemptId} and status in ('queued', 'running')
          ) as present
        `;
        if (
          !(current.status === "ready" || current.status === "awaiting_player") ||
          activeTurns[0]?.present
        ) {
          throw new PromptGymError("RUN_ACTIVE", "The model is already working", 409);
        }
        if (current.promptsUsed >= current.maxPrompts) {
          throw new PromptGymError("PROMPT_LIMIT", "This run has used all six coaching prompts", 409);
        }
        const event = createVisibleRunEvent({
          attemptId: turn.attemptId,
          turnId: turn.id,
          sequence: row.last_event_sequence + 1,
          actor: "player",
          type: "turn.queued",
          payload: { turnId: turn.id, ordinal: turn.ordinal, prompt: turn.prompt },
          createdAt: turn.createdAt,
          previousHash: row.last_event_hash || GENESIS_EVENT_HASH,
        });
        const attempt = {
          ...current,
          promptsUsed: current.promptsUsed + 1,
          lastEventSequence: event.sequence,
          lastEventHash: event.hash,
        };
        await tx`
          insert into turn (id, attempt_id, ordinal, prompt, status, failure_code, state, created_at, started_at, completed_at)
          values (
            ${turn.id}, ${turn.attemptId}, ${turn.ordinal}, ${turn.prompt}, ${turn.status},
            ${turn.failureCode ?? null}, ${jsonText(turn)}::jsonb, ${turn.createdAt},
            ${turn.startedAt ?? null}, ${turn.completedAt ?? null}
          )
        `;
        await tx`
          insert into run_event
            (id, attempt_id, turn_id, sequence, actor, event_type, public_payload, previous_hash, hash, created_at)
          values (
            ${event.id}, ${event.attemptId}, ${turn.id}, ${event.sequence}, ${event.actor}, ${event.type},
            ${jsonText(event.payload)}::jsonb, ${event.previousHash}, ${event.hash}, ${event.createdAt}
          )
        `;
        await tx`
          update attempt set prompts_used = ${attempt.promptsUsed},
            last_event_sequence = ${event.sequence}, last_event_hash = ${event.hash},
            state = ${jsonText(attempt)}::jsonb
          where id = ${turn.attemptId}
        `;
        return { turn: clone(turn), attempt: clone(attempt), event: clone(event) };
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async getTurn(id: string): Promise<Turn | undefined> {
    await this.ready;
    const rows = await this.client<{ state: unknown }[]>`select state from turn where id = ${id} limit 1`;
    return rows[0] ? asTurn(rows[0].state) : undefined;
  }

  async updateTurn(id: string, update: (turn: Turn) => Turn): Promise<Turn> {
    await this.ready;
    try {
      return await this.client.begin(async (tx) => {
        const rows = await tx<{ state: unknown }[]>`select state from turn where id = ${id} for update`;
        const row = rows[0];
        if (!row) throw new PromptGymError("NOT_FOUND", "Turn not found", 404);
        const current = asTurn(row.state);
        const next = clone(update(clone(current)));
        assertImmutableTurnFields(current, next);
        await tx`
          update turn set status = ${next.status}, failure_code = ${next.failureCode ?? null},
            started_at = ${next.startedAt ?? null}, completed_at = ${next.completedAt ?? null},
            state = ${jsonText(next)}::jsonb
          where id = ${id}
        `;
        return next;
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async listTurns(attemptId: string): Promise<Turn[]> {
    await this.ready;
    const rows = await this.client<{ state: unknown }[]>`
      select state from turn where attempt_id = ${attemptId} order by ordinal asc
    `;
    return rows.map((row) => asTurn(row.state));
  }

  async listQueuedTurns(limit = 100): Promise<Turn[]> {
    await this.ready;
    const safeLimit = Math.min(1_000, Math.max(1, Math.trunc(limit)));
    const rows = await this.client<{ state: unknown }[]>`
      select state from turn where status = 'queued' order by created_at asc limit ${safeLimit}
    `;
    return rows.map((row) => asTurn(row.state));
  }

  async recoverInterruptedTurn(turnId: string, recoveredAt: string): Promise<InterruptedTurnRecovery> {
    await this.ready;
    try {
      return await this.client.begin(async (tx) => {
        const dayRows = await tx<{ utc_day: string }[]>`
          select distinct r.utc_day from cost_reservation r
          join turn t on t.attempt_id = r.attempt_id
          where t.id = ${turnId} and r.status = 'pending' order by r.utc_day
        `;
        for (const row of dayRows) {
          await tx`select pg_advisory_xact_lock(hashtextextended(${`prompt-gym:budget:${row.utc_day}`}, 0))`;
        }
        const turnRows = await tx<
          { state: unknown }[]
        >`select state from turn where id = ${turnId} for update`;
        const turn = turnRows[0] ? asTurn(turnRows[0].state) : undefined;
        if (!turn || turn.status !== "running") return { recovered: false, chargedNanoUsd: 0 };
        const attemptRows = await tx<
          { state: unknown }[]
        >`select state from attempt where id = ${turn.attemptId} for update`;
        const attempt = attemptRows[0] ? asAttempt(attemptRows[0].state) : undefined;
        if (!attempt || attempt.status !== "running") return { recovered: false, chargedNanoUsd: 0 };
        const reservations = await tx<
          { id: string; user_id: string; utc_day: string; reserved_nano_usd: number | string }[]
        >`
          select id, user_id, utc_day, reserved_nano_usd from cost_reservation
          where attempt_id = ${attempt.id} and status = 'pending' for update
        `;
        let chargedNanoUsd = 0;
        for (const reservation of reservations) {
          const reserved = numeric(reservation.reserved_nano_usd);
          chargedNanoUsd += reserved;
          await tx`update cost_reservation set status = 'settled', actual_nano_usd = ${reserved}, settled_at = ${recoveredAt} where id = ${reservation.id}`;
          await tx`
            insert into daily_cost_total (utc_day, actual_nano_usd) values (${reservation.utc_day}, ${reserved})
            on conflict (utc_day) do update set actual_nano_usd = daily_cost_total.actual_nano_usd + excluded.actual_nano_usd, updated_at = now()
          `;
          await tx`
            insert into credit_ledger (user_id, attempt_id, entry_type, amount_nano_usd, utc_day, reservation_id, metadata)
            values
              (${reservation.user_id}, ${attempt.id}, 'reservation_release', ${-reserved}, ${reservation.utc_day}, ${reservation.id}, '{}'::jsonb),
              (${reservation.user_id}, ${attempt.id}, 'provider_spend', ${reserved}, ${reservation.utc_day}, ${reservation.id}, ${jsonText({ recovery: "worker_interrupted" })}::jsonb)
          `;
        }
        const failedAttempt: AttemptState = {
          ...attempt,
          status: "failed",
          actualCostNanoUsd: Math.min(
            attempt.maxActualCostNanoUsd,
            attempt.actualCostNanoUsd + chargedNanoUsd,
          ),
          completedAt: recoveredAt,
        };
        const failedTurn: Turn = {
          ...turn,
          status: "failed",
          failureCode: "WORKER_INTERRUPTED",
          completedAt: recoveredAt,
        };
        await tx`update turn set status = 'failed', failure_code = 'WORKER_INTERRUPTED', state = ${jsonText(failedTurn)}::jsonb, completed_at = ${recoveredAt} where id = ${turnId}`;
        await tx`update attempt set status = 'failed', actual_cost_nano_usd = ${failedAttempt.actualCostNanoUsd}, state = ${jsonText(failedAttempt)}::jsonb, completed_at = ${recoveredAt} where id = ${attempt.id}`;
        return { recovered: true, chargedNanoUsd, attempt: failedAttempt };
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async appendEvent(input: EventInput): Promise<RunEvent> {
    await this.ready;
    try {
      return await this.client.begin(async (tx) => {
        const rows = await tx<{ state: unknown; last_event_sequence: number; last_event_hash: string }[]>`
          select state, last_event_sequence, last_event_hash from attempt where id = ${input.attemptId} for update
        `;
        const row = rows[0];
        if (!row) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
        if ("turnId" in input.payload && input.payload.turnId !== input.turnId) {
          throw new PromptGymError("CONFLICT", "Conflicting turn lineage was supplied", 409);
        }
        if (input.turnId) await this.assertTurnLineage(tx, input.attemptId, input.turnId);
        const event = createVisibleRunEvent({
          attemptId: input.attemptId,
          ...(input.turnId ? { turnId: input.turnId } : {}),
          sequence: row.last_event_sequence + 1,
          actor: input.actor,
          type: input.type,
          payload: clone(input.payload),
          createdAt: input.createdAt ?? new Date().toISOString(),
          previousHash: row.last_event_hash || GENESIS_EVENT_HASH,
        });
        const attempt = asAttempt(row.state);
        const next = { ...attempt, lastEventSequence: event.sequence, lastEventHash: event.hash };
        await tx`
          insert into run_event
            (id, attempt_id, turn_id, sequence, actor, event_type, public_payload, previous_hash, hash, created_at)
          values (
            ${event.id}, ${event.attemptId}, ${input.turnId ?? null}, ${event.sequence}, ${event.actor}, ${event.type},
            ${jsonText(event.payload)}::jsonb, ${event.previousHash}, ${event.hash}, ${event.createdAt}
          )
        `;
        await tx`
          update attempt set last_event_sequence = ${event.sequence}, last_event_hash = ${event.hash},
            state = ${jsonText(next)}::jsonb
          where id = ${input.attemptId}
        `;
        return event;
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async listEvents(attemptId: string, afterSequence = 0): Promise<RunEvent[]> {
    await this.ready;
    const rows = await this.client<RunEventRow[]>`
      select id, attempt_id, turn_id, sequence, actor, event_type, public_payload, created_at, previous_hash, hash
      from run_event where attempt_id = ${attemptId} and sequence > ${afterSequence}
      order by sequence asc
    `;
    return rows.map(mapRunEvent);
  }

  async recordUsage(attemptId: string, usage: UsageV1, turnId?: string): Promise<UsageRecordResult> {
    await this.ready;
    try {
      return await this.client.begin(async (tx) => {
        const attemptRows = await tx<{ state: unknown }[]>`
          select state from attempt where id = ${attemptId} for update
        `;
        const row = attemptRows[0];
        if (!row) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
        const current = asAttempt(row.state);
        const linkedTurnId = resolveTurnLink(turnId, usage.turnId);
        if (linkedTurnId) await this.assertTurnLineage(tx, attemptId, linkedTurnId);
        const inserted = await tx<{ provider_response_id: string }[]>`
          insert into usage_item (
            attempt_id, turn_id, provider, provider_response_id, resolved_model, input_tokens,
            cached_input_tokens, cache_write_tokens, output_tokens, reasoning_tokens,
            total_tokens, image_tokens, tool_units, price_version, actual_cost_nano_usd, created_at
          ) values (
            ${attemptId}, ${linkedTurnId ?? null}, ${usage.provider}, ${usage.providerResponseId}, ${usage.resolvedModel},
            ${usage.inputTokens}, ${usage.cachedInputTokens}, ${usage.cacheWriteTokens},
            ${usage.outputTokens}, ${usage.reasoningTokens}, ${usage.totalTokens},
            ${usage.imageTokens}, ${usage.toolUnits}, ${usage.priceVersion},
            ${usage.actualCostNanoUsd}, ${usage.createdAt}
          ) on conflict (provider, provider_response_id) do nothing
          returning provider_response_id
        `;
        if (inserted.length === 0) {
          const existing = await tx<{ attempt_id: string; turn_id: string | null }[]>`
            select attempt_id, turn_id from usage_item
            where provider = ${usage.provider} and provider_response_id = ${usage.providerResponseId}
            limit 1
          `;
          if (existing[0]?.attempt_id !== attemptId) {
            throw new PromptGymError("CONFLICT", "Provider usage belongs to another attempt", 409);
          }
          if ((existing[0]?.turn_id ?? undefined) !== linkedTurnId) {
            throw new PromptGymError("CONFLICT", "Provider usage has different turn lineage", 409);
          }
          return { applied: false, attempt: current };
        }
        const attempt = {
          ...current,
          competitionTokens: current.competitionTokens + usage.totalTokens,
          actualCostNanoUsd: current.actualCostNanoUsd + usage.actualCostNanoUsd,
        };
        await tx`
          update attempt set competition_tokens = ${attempt.competitionTokens},
            actual_cost_nano_usd = ${attempt.actualCostNanoUsd},
            state = ${jsonText(attempt)}::jsonb
          where id = ${attemptId}
        `;
        return { applied: true, attempt };
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async listUsage(attemptId: string): Promise<UsageV1[]> {
    await this.ready;
    const rows = await this.client<
      {
        provider: UsageV1["provider"];
        turn_id: string | null;
        provider_response_id: string;
        resolved_model: string;
        input_tokens: number;
        cached_input_tokens: number;
        cache_write_tokens: number;
        output_tokens: number;
        reasoning_tokens: number;
        total_tokens: number;
        image_tokens: number;
        tool_units: number;
        price_version: string;
        actual_cost_nano_usd: number | string;
        created_at: Date | string;
      }[]
    >`
      select turn_id, provider, provider_response_id, resolved_model, input_tokens, cached_input_tokens,
        cache_write_tokens, output_tokens, reasoning_tokens, total_tokens, image_tokens,
        tool_units, price_version, actual_cost_nano_usd, created_at
      from usage_item where attempt_id = ${attemptId} order by created_at asc, id asc
    `;
    return rows.map((row) => ({
      schemaVersion: "usage.v1",
      ...(row.turn_id ? { turnId: row.turn_id } : {}),
      provider: row.provider,
      providerResponseId: row.provider_response_id,
      resolvedModel: row.resolved_model,
      inputTokens: row.input_tokens,
      cachedInputTokens: row.cached_input_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      totalTokens: row.total_tokens,
      imageTokens: row.image_tokens,
      toolUnits: row.tool_units,
      priceVersion: row.price_version,
      actualCostNanoUsd: numeric(row.actual_cost_nano_usd),
      createdAt: iso(row.created_at),
    }));
  }

  async recordVerification(attemptId: string, result: VerificationResult, turnId?: string): Promise<void> {
    await this.ready;
    try {
      await this.client.begin(async (tx) => {
        const linkedTurnId = resolveTurnLink(turnId, result.turnId);
        if (linkedTurnId) await this.assertTurnLineage(tx, attemptId, linkedTurnId);
        await tx`
          insert into verification_run
            (attempt_id, turn_id, passed, verifier_digest, public_feedback, private_result_ref, verified_at)
          values (
            ${attemptId}, ${linkedTurnId ?? null}, ${result.passed}, ${result.verifierDigest}, ${result.publicFeedback},
            ${result.privateResultRef ?? null}, ${result.verifiedAt}
          )
        `;
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async reserveCost(input: CostReservationInput): Promise<CostReservation> {
    await this.ready;
    if (
      !isSafeMoney(input.amountNanoUsd, false) ||
      !isSafeMoney(input.attemptLimitNanoUsd, true) ||
      !isSafeMoney(input.userDailyLimitNanoUsd, true) ||
      !isSafeMoney(input.globalDailyLimitNanoUsd, true)
    ) {
      throw new PromptGymError("INVALID_INPUT", "Invalid cost reservation", 400);
    }
    try {
      return await this.client.begin(async (tx) => {
        // A single lock per UTC day makes pending + settled cap checks linearizable
        // across every API and worker process.
        await tx`select pg_advisory_xact_lock(hashtextextended(${`prompt-gym:budget:${input.utcDay}`}, 0))`;
        const attemptRows = await tx<{ user_id: string }[]>`
          select user_id from attempt where id = ${input.attemptId} for update
        `;
        if (!attemptRows[0] || attemptRows[0].user_id !== input.userId) {
          throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
        }
        const attemptSpend = await this.reservationSpend(tx, tx`attempt_id = ${input.attemptId}`);
        if (attemptSpend + input.amountNanoUsd > input.attemptLimitNanoUsd) {
          throw new PromptGymError("COST_BUDGET", "This run has reached its covered API budget", 402);
        }
        const userSpend = await this.reservationSpend(
          tx,
          tx`user_id = ${input.userId} and utc_day = ${input.utcDay}`,
        );
        if (userSpend + input.amountNanoUsd > input.userDailyLimitNanoUsd) {
          throw new PromptGymError("ENERGY_EXHAUSTED", "Today's covered API budget is used up", 402);
        }
        const dailyTotals = await tx<{ actual_nano_usd: number | string }[]>`
          select actual_nano_usd from daily_cost_total where utc_day = ${input.utcDay}
        `;
        const settledGlobal = numeric(dailyTotals[0]?.actual_nano_usd);
        const pendingGlobal = await this.pendingReservationSpend(tx, tx`utc_day = ${input.utcDay}`);
        const globalSpend = settledGlobal + pendingGlobal;
        if (globalSpend + input.amountNanoUsd > input.globalDailyLimitNanoUsd) {
          throw new PromptGymError(
            "GLOBAL_CIRCUIT_OPEN",
            "The daily arena budget is temporarily full",
            503,
            true,
          );
        }
        const rows = await tx<{ id: string }[]>`
          insert into cost_reservation (attempt_id, user_id, utc_day, reserved_nano_usd)
          values (${input.attemptId}, ${input.userId}, ${input.utcDay}, ${input.amountNanoUsd})
          returning id
        `;
        const id = rows[0]?.id;
        if (!id) throw new PromptGymError("CONFLICT", "Cost reservation could not be created", 500);
        await tx`
          insert into credit_ledger
            (user_id, attempt_id, entry_type, amount_nano_usd, utc_day, reservation_id, metadata)
          values (
            ${input.userId}, ${input.attemptId}, 'reservation', ${input.amountNanoUsd},
            ${input.utcDay}, ${id}, '{}'::jsonb
          )
        `;
        return {
          id,
          attemptId: input.attemptId,
          userId: input.userId,
          utcDay: input.utcDay,
          reservedNanoUsd: input.amountNanoUsd,
        };
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  private async reservationSpend(tx: postgres.TransactionSql, where: ReturnType<Queryable>): Promise<number> {
    const rows = await tx<{ amount: number | string }[]>`
      select coalesce(sum(
        case when status = 'pending' then reserved_nano_usd else coalesce(actual_nano_usd, 0) end
      ), 0) as amount
      from cost_reservation where ${where}
    `;
    return numeric(rows[0]?.amount);
  }

  private async pendingReservationSpend(
    tx: postgres.TransactionSql,
    where: ReturnType<Queryable>,
  ): Promise<number> {
    const rows = await tx<{ amount: number | string }[]>`
      select coalesce(sum(reserved_nano_usd), 0) as amount
      from cost_reservation where status = 'pending' and ${where}
    `;
    return numeric(rows[0]?.amount);
  }

  async settleCost(reservationId: string, actualNanoUsd: number): Promise<void> {
    await this.ready;
    if (!isSafeMoney(actualNanoUsd, true)) {
      throw new PromptGymError("CONFLICT", "Provider cost exceeded its reservation", 409);
    }
    try {
      await this.client.begin(async (tx) => {
        const dayRows = await tx<{ utc_day: string }[]>`
          select utc_day from cost_reservation where id = ${reservationId} limit 1
        `;
        const day = dayRows[0]?.utc_day;
        if (!day) throw new PromptGymError("CONFLICT", "Cost reservation is missing", 409);
        await tx`select pg_advisory_xact_lock(hashtextextended(${`prompt-gym:budget:${day}`}, 0))`;
        const rows = await tx<
          {
            attempt_id: string;
            user_id: string;
            utc_day: string;
            reserved_nano_usd: number | string;
            actual_nano_usd: number | string | null;
            status: "pending" | "settled";
          }[]
        >`
          select attempt_id, user_id, utc_day, reserved_nano_usd, actual_nano_usd, status
          from cost_reservation where id = ${reservationId} for update
        `;
        const row = rows[0];
        if (!row) throw new PromptGymError("CONFLICT", "Cost reservation is missing", 409);
        const reserved = numeric(row.reserved_nano_usd);
        if (actualNanoUsd > reserved) {
          throw new PromptGymError("CONFLICT", "Provider cost exceeded its reservation", 409);
        }
        if (row.status === "settled") {
          if (numeric(row.actual_nano_usd) === actualNanoUsd) return;
          throw new PromptGymError("CONFLICT", "Cost reservation was already settled differently", 409);
        }
        await tx`
          update cost_reservation set status = 'settled', actual_nano_usd = ${actualNanoUsd}, settled_at = now()
          where id = ${reservationId}
        `;
        await tx`
          insert into daily_cost_total (utc_day, actual_nano_usd)
          values (${row.utc_day}, ${actualNanoUsd})
          on conflict (utc_day) do update set
            actual_nano_usd = daily_cost_total.actual_nano_usd + excluded.actual_nano_usd,
            updated_at = now()
        `;
        await tx`
          insert into credit_ledger
            (user_id, attempt_id, entry_type, amount_nano_usd, utc_day, reservation_id, metadata)
          values
            (${row.user_id}, ${row.attempt_id}, 'reservation_release', ${-reserved}, ${row.utc_day}, ${reservationId}, '{}'::jsonb),
            (${row.user_id}, ${row.attempt_id}, 'provider_spend', ${actualNanoUsd}, ${row.utc_day}, ${reservationId}, '{}'::jsonb)
        `;
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async saveLeaderboardEntry(entry: StoredLeaderboardEntry): Promise<void> {
    await this.ready;
    try {
      await this.client`
        insert into leaderboard_entry
          (attempt_id, arena_id, challenge_slug, instance_id, public_handle,
           competition_tokens, turns, assisted, solved_at)
        values (
          ${entry.attemptId}, ${entry.arenaId}, ${entry.challengeSlug}, ${entry.instanceId},
          ${entry.publicHandle}, ${entry.competitionTokens}, ${entry.turns},
          ${entry.assisted}, ${entry.solvedAt}
        ) on conflict (attempt_id) do nothing
      `;
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async listLeaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    await this.ready;
    const rows = await this.client<
      {
        attempt_id: string;
        public_handle: string;
        competition_tokens: number;
        turns: number;
        assisted: boolean;
        solved_at: Date | string;
        arena_id: string;
        challenge_slug: string;
        instance_id: string;
      }[]
    >`
      select attempt_id, public_handle, competition_tokens, turns, assisted, solved_at,
        arena_id, challenge_slug, instance_id
      from leaderboard_entry where arena_id = ${query.arenaId}
      order by competition_tokens asc, attempt_id asc
    `;
    const filtered = rows
      .filter((row) => !query.challengeSlug || row.challenge_slug === query.challengeSlug)
      .filter((row) => !query.instanceId || row.instance_id === query.instanceId)
      .filter((row) => query.assisted === undefined || row.assisted === query.assisted);
    let previous: number | undefined;
    let rank = 0;
    return filtered.slice(0, query.limit ?? 100).map((row, index) => {
      if (row.competition_tokens !== previous) rank = index + 1;
      previous = row.competition_tokens;
      return {
        rank,
        attemptId: row.attempt_id,
        publicHandle: row.public_handle,
        competitionTokens: row.competition_tokens,
        turns: row.turns,
        assisted: row.assisted,
        solvedAt: iso(row.solved_at),
      };
    });
  }

  async saveConsent(consent: ConsentRecord): Promise<void> {
    await this.ready;
    await this.client`
      insert into consent_record
        (user_id, version, operational, research, public_replay, recorded_at, withdrawn_at)
      values (
        ${consent.userId}, ${consent.version}, true, ${consent.research},
        ${consent.publicReplay}, ${consent.recordedAt}, ${consent.withdrawnAt ?? null}
      ) on conflict (user_id, version) do update set
        research = excluded.research,
        public_replay = excluded.public_replay,
        recorded_at = excluded.recorded_at,
        withdrawn_at = excluded.withdrawn_at
    `;
  }

  async getConsent(userId: string): Promise<ConsentRecord | undefined> {
    await this.ready;
    const rows = await this.client<
      {
        user_id: string;
        version: string;
        research: boolean;
        public_replay: boolean;
        recorded_at: Date | string;
        withdrawn_at: Date | string | null;
      }[]
    >`
      select user_id, version, research, public_replay, recorded_at, withdrawn_at
      from consent_record where user_id = ${userId}
      order by recorded_at desc, id desc limit 1
    `;
    const row = rows[0];
    return row
      ? {
          userId: row.user_id,
          version: row.version,
          operational: true,
          research: row.research,
          publicReplay: row.public_replay,
          recordedAt: iso(row.recorded_at),
          ...(row.withdrawn_at ? { withdrawnAt: iso(row.withdrawn_at) } : {}),
        }
      : undefined;
  }

  async saveEligibility(record: EligibilityRecord): Promise<void> {
    await this.ready;
    await this.client`
      insert into eligibility_record (user_id, age_18_plus, us_resident, version, recorded_at)
      values (${record.userId}, true, true, ${record.version}, ${record.recordedAt})
      on conflict (user_id) do update set
        age_18_plus = true,
        us_resident = true,
        version = excluded.version,
        recorded_at = excluded.recorded_at
    `;
  }

  async getEligibility(userId: string): Promise<EligibilityRecord | undefined> {
    await this.ready;
    const rows = await this.client<
      {
        user_id: string;
        version: string;
        recorded_at: Date | string;
      }[]
    >`
      select user_id, version, recorded_at from eligibility_record where user_id = ${userId} limit 1
    `;
    const row = rows[0];
    return row
      ? {
          userId: row.user_id,
          age18Plus: true,
          usResident: true,
          version: row.version,
          recordedAt: iso(row.recorded_at),
        }
      : undefined;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.ready;
    await this.client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`prompt-gym:delete:${userId}`}, 0))`;
      const attempts = await tx<
        { id: string }[]
      >`select id from attempt where user_id = ${userId} for update`;
      const ids = attempts.map((row) => row.id);
      if (ids.length > 0) {
        // Released rows remain as explicit tombstones, while operational traces are deleted.
        await tx`
          update dataset_release set tombstone_version = tombstone_version + 1
          where id in (
            select distinct release_id from dataset_release_episode
            where attempt_id = any(${tx.array(ids)}::uuid[])
          )
        `;
        await tx`
          update dataset_release_episode set deletion_state = 'deleted'
          where attempt_id = any(${tx.array(ids)}::uuid[])
        `;
        // Turn lineage uses NO ACTION so an isolated turn deletion cannot rewrite
        // a hash-attested turn id. Account deletion removes the linked rows first.
        await tx`delete from verification_run where attempt_id = any(${tx.array(ids)}::uuid[])`;
        await tx`delete from usage_item where attempt_id = any(${tx.array(ids)}::uuid[])`;
        await tx`delete from run_event where attempt_id = any(${tx.array(ids)}::uuid[])`;
      }
      await tx`delete from credit_ledger where user_id = ${userId}`;
      await tx`delete from cost_reservation where user_id = ${userId}`;
      await tx`delete from fraud_signal where user_id = ${userId}`;
      await tx`delete from consent_record where user_id = ${userId}`;
      await tx`delete from eligibility_record where user_id = ${userId}`;
      await tx`delete from attempt where user_id = ${userId}`;
    });
  }
}
