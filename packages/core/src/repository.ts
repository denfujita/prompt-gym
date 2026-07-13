import { randomUUID } from "node:crypto";
import type {
  AttemptState,
  ChallengeInstanceEnvelope,
  ConsentRecord,
  EligibilityRecord,
  JsonValue,
  LeaderboardEntry,
  RunEvent,
  RunEventActor,
  RunEventType,
  Turn,
  UsageV1,
  VerificationResult,
} from "@prompt-gym/contracts";
import { createVisibleRunEvent, GENESIS_EVENT_HASH } from "./crypto.js";
import { PromptGymError } from "./errors.js";

export interface EventInput {
  attemptId: string;
  actor: RunEventActor;
  type: RunEventType;
  payload: Record<string, JsonValue>;
  createdAt?: string;
}

export interface CostReservationInput {
  attemptId: string;
  userId: string;
  utcDay: string;
  amountNanoUsd: number;
  attemptLimitNanoUsd: number;
  userDailyLimitNanoUsd: number;
  globalDailyLimitNanoUsd: number;
}

export interface CostReservation {
  id: string;
  attemptId: string;
  userId: string;
  utcDay: string;
  reservedNanoUsd: number;
}

export interface LeaderboardQuery {
  arenaId: string;
  challengeSlug?: string;
  instanceId?: string;
  assisted?: boolean;
  limit?: number;
}

export interface QueuedTurnResult {
  turn: Turn;
  attempt: AttemptState;
  event: RunEvent;
}

export interface UsageRecordResult {
  applied: boolean;
  attempt: AttemptState;
}

export interface InterruptedTurnRecovery {
  recovered: boolean;
  chargedNanoUsd: number;
  attempt?: AttemptState;
}

interface StoredLeaderboardEntry extends Omit<LeaderboardEntry, "rank"> {
  arenaId: string;
  challengeSlug: string;
  instanceId: string;
}

export interface PromptGymRepository {
  createAttempt(attempt: AttemptState, envelope: ChallengeInstanceEnvelope): Promise<void>;
  getAttempt(id: string): Promise<AttemptState | undefined>;
  updateAttempt(id: string, update: (attempt: AttemptState) => AttemptState): Promise<AttemptState>;
  findActiveAttempt(userId: string): Promise<AttemptState | undefined>;
  hasRankedStart(userId: string, challengeSlug: string, utcDay: string): Promise<boolean>;
  countRankedStarts(userId: string, utcDay: string): Promise<number>;
  getInstanceEnvelope(attemptId: string): Promise<ChallengeInstanceEnvelope | undefined>;

  createTurn(turn: Turn): Promise<void>;
  queueTurn(turn: Turn): Promise<QueuedTurnResult>;
  getTurn(id: string): Promise<Turn | undefined>;
  updateTurn(id: string, update: (turn: Turn) => Turn): Promise<Turn>;
  listTurns(attemptId: string): Promise<Turn[]>;
  listQueuedTurns(limit?: number): Promise<Turn[]>;
  recoverInterruptedTurn(turnId: string, recoveredAt: string): Promise<InterruptedTurnRecovery>;

  appendEvent(input: EventInput): Promise<RunEvent>;
  listEvents(attemptId: string, afterSequence?: number): Promise<RunEvent[]>;
  recordUsage(attemptId: string, usage: UsageV1): Promise<UsageRecordResult>;
  listUsage(attemptId: string): Promise<UsageV1[]>;
  recordVerification(attemptId: string, result: VerificationResult): Promise<void>;

  reserveCost(input: CostReservationInput): Promise<CostReservation>;
  settleCost(reservationId: string, actualNanoUsd: number): Promise<void>;

  saveLeaderboardEntry(entry: StoredLeaderboardEntry): Promise<void>;
  listLeaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]>;
  saveConsent(consent: ConsentRecord): Promise<void>;
  getConsent(userId: string): Promise<ConsentRecord | undefined>;
  saveEligibility(record: EligibilityRecord): Promise<void>;
  getEligibility(userId: string): Promise<EligibilityRecord | undefined>;
  deleteUser(userId: string): Promise<void>;
}

const copy = <T>(value: T): T => structuredClone(value);
const activeStatuses = new Set(["created", "ready", "running", "awaiting_player"]);

export class InMemoryPromptGymRepository implements PromptGymRepository {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly envelopes = new Map<string, ChallengeInstanceEnvelope>();
  private readonly turns = new Map<string, Turn>();
  private readonly events = new Map<string, RunEvent[]>();
  private readonly usages = new Map<string, UsageV1[]>();
  private readonly verifications = new Map<string, VerificationResult[]>();
  private readonly reservations = new Map<string, CostReservation>();
  private readonly actualSpendByUserDay = new Map<string, number>();
  private readonly actualSpendByGlobalDay = new Map<string, number>();
  private readonly leaderboard = new Map<string, StoredLeaderboardEntry>();
  private readonly consents = new Map<string, ConsentRecord>();
  private readonly eligibility = new Map<string, EligibilityRecord>();

  async createAttempt(attempt: AttemptState, envelope: ChallengeInstanceEnvelope): Promise<void> {
    if (this.attempts.has(attempt.id)) throw new PromptGymError("CONFLICT", "Attempt already exists", 409);
    this.attempts.set(attempt.id, copy(attempt));
    this.envelopes.set(attempt.id, copy(envelope));
    this.events.set(attempt.id, []);
    this.usages.set(attempt.id, []);
  }

  async getAttempt(id: string): Promise<AttemptState | undefined> {
    const attempt = this.attempts.get(id);
    return attempt ? copy(attempt) : undefined;
  }

  async updateAttempt(id: string, update: (attempt: AttemptState) => AttemptState): Promise<AttemptState> {
    const current = this.attempts.get(id);
    if (!current) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
    const next = update(copy(current));
    if (next.id !== id || next.userId !== current.userId || next.instance.id !== current.instance.id) {
      throw new PromptGymError("CONFLICT", "Immutable attempt identity was changed", 409);
    }
    this.attempts.set(id, copy(next));
    return copy(next);
  }

  async findActiveAttempt(userId: string): Promise<AttemptState | undefined> {
    const found = [...this.attempts.values()].find(
      (attempt) => attempt.userId === userId && activeStatuses.has(attempt.status),
    );
    return found ? copy(found) : undefined;
  }

  async hasRankedStart(userId: string, challengeSlug: string, day: string): Promise<boolean> {
    return [...this.attempts.values()].some(
      (attempt) =>
        attempt.userId === userId &&
        attempt.challengeSlug === challengeSlug &&
        attempt.ranked &&
        attempt.startedAt.startsWith(day),
    );
  }

  async countRankedStarts(userId: string, day: string): Promise<number> {
    return [...this.attempts.values()].filter(
      (attempt) => attempt.userId === userId && attempt.ranked && attempt.startedAt.startsWith(day),
    ).length;
  }

  async getInstanceEnvelope(attemptId: string): Promise<ChallengeInstanceEnvelope | undefined> {
    const value = this.envelopes.get(attemptId);
    return value ? copy(value) : undefined;
  }

  async createTurn(turn: Turn): Promise<void> {
    if (this.turns.has(turn.id)) throw new PromptGymError("CONFLICT", "Turn already exists", 409);
    this.turns.set(turn.id, copy(turn));
  }

  async queueTurn(turn: Turn): Promise<QueuedTurnResult> {
    const current = this.attempts.get(turn.attemptId);
    if (!current) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
    if (this.turns.has(turn.id)) throw new PromptGymError("CONFLICT", "Turn already exists", 409);
    if (
      !(current.status === "ready" || current.status === "awaiting_player") ||
      [...this.turns.values()].some(
        (item) =>
          item.attemptId === turn.attemptId && (item.status === "queued" || item.status === "running"),
      )
    ) {
      throw new PromptGymError("RUN_ACTIVE", "The model is already working", 409);
    }
    if (current.promptsUsed >= current.maxPrompts)
      throw new PromptGymError("PROMPT_LIMIT", "This run has used all six coaching prompts", 409);
    const event = createVisibleRunEvent({
      attemptId: turn.attemptId,
      sequence: current.lastEventSequence + 1,
      actor: "player",
      type: "turn.queued",
      payload: { turnId: turn.id, ordinal: turn.ordinal, prompt: turn.prompt },
      createdAt: turn.createdAt,
      previousHash: current.lastEventHash || GENESIS_EVENT_HASH,
    });
    const attempt = {
      ...current,
      promptsUsed: current.promptsUsed + 1,
      lastEventSequence: event.sequence,
      lastEventHash: event.hash,
    };
    this.turns.set(turn.id, copy(turn));
    this.attempts.set(turn.attemptId, copy(attempt));
    const events = this.events.get(turn.attemptId) ?? [];
    events.push(copy(event));
    this.events.set(turn.attemptId, events);
    return { turn: copy(turn), attempt: copy(attempt), event: copy(event) };
  }

  async getTurn(id: string): Promise<Turn | undefined> {
    const turn = this.turns.get(id);
    return turn ? copy(turn) : undefined;
  }

  async updateTurn(id: string, update: (turn: Turn) => Turn): Promise<Turn> {
    const current = this.turns.get(id);
    if (!current) throw new PromptGymError("NOT_FOUND", "Turn not found", 404);
    const next = update(copy(current));
    if (next.id !== id || next.attemptId !== current.attemptId)
      throw new PromptGymError("CONFLICT", "Immutable turn identity was changed", 409);
    this.turns.set(id, copy(next));
    return copy(next);
  }

  async listTurns(attemptId: string): Promise<Turn[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.attemptId === attemptId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(copy);
  }

  async listQueuedTurns(limit = 100): Promise<Turn[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map(copy);
  }

  async recoverInterruptedTurn(turnId: string, recoveredAt: string): Promise<InterruptedTurnRecovery> {
    const turn = this.turns.get(turnId);
    if (!turn || turn.status !== "running") return { recovered: false, chargedNanoUsd: 0 };
    const attempt = this.attempts.get(turn.attemptId);
    if (!attempt || attempt.status !== "running") return { recovered: false, chargedNanoUsd: 0 };
    const pending = [...this.reservations.values()].filter((item) => item.attemptId === attempt.id);
    const chargedNanoUsd = pending.reduce((sum, item) => sum + item.reservedNanoUsd, 0);
    for (const reservation of pending) {
      this.reservations.delete(reservation.id);
      const userKey = `${reservation.userId}:${reservation.utcDay}`;
      this.actualSpendByUserDay.set(
        userKey,
        (this.actualSpendByUserDay.get(userKey) ?? 0) + reservation.reservedNanoUsd,
      );
      this.actualSpendByGlobalDay.set(
        reservation.utcDay,
        (this.actualSpendByGlobalDay.get(reservation.utcDay) ?? 0) + reservation.reservedNanoUsd,
      );
    }
    const failedAttempt: AttemptState = {
      ...attempt,
      status: "failed",
      actualCostNanoUsd: Math.min(attempt.maxActualCostNanoUsd, attempt.actualCostNanoUsd + chargedNanoUsd),
      completedAt: recoveredAt,
    };
    this.turns.set(turnId, {
      ...turn,
      status: "failed",
      failureCode: "WORKER_INTERRUPTED",
      completedAt: recoveredAt,
    });
    this.attempts.set(attempt.id, failedAttempt);
    return { recovered: true, chargedNanoUsd, attempt: copy(failedAttempt) };
  }

  async appendEvent(input: EventInput): Promise<RunEvent> {
    const attempt = this.attempts.get(input.attemptId);
    if (!attempt) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
    const event = createVisibleRunEvent({
      attemptId: input.attemptId,
      sequence: attempt.lastEventSequence + 1,
      actor: input.actor,
      type: input.type,
      payload: copy(input.payload),
      createdAt: input.createdAt ?? new Date().toISOString(),
      previousHash: attempt.lastEventHash || GENESIS_EVENT_HASH,
    });
    const list = this.events.get(input.attemptId) ?? [];
    list.push(event);
    this.events.set(input.attemptId, list);
    this.attempts.set(input.attemptId, {
      ...attempt,
      lastEventSequence: event.sequence,
      lastEventHash: event.hash,
    });
    return copy(event);
  }

  async listEvents(attemptId: string, afterSequence = 0): Promise<RunEvent[]> {
    return (this.events.get(attemptId) ?? []).filter((event) => event.sequence > afterSequence).map(copy);
  }

  async recordUsage(attemptId: string, usage: UsageV1): Promise<UsageRecordResult> {
    const current = this.attempts.get(attemptId);
    if (!current) throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
    const list = this.usages.get(attemptId) ?? [];
    if (
      list.some(
        (item) => item.provider === usage.provider && item.providerResponseId === usage.providerResponseId,
      )
    ) {
      return { applied: false, attempt: copy(current) };
    }
    list.push(copy(usage));
    this.usages.set(attemptId, list);
    const attempt = {
      ...current,
      competitionTokens: current.competitionTokens + usage.totalTokens,
      actualCostNanoUsd: current.actualCostNanoUsd + usage.actualCostNanoUsd,
    };
    this.attempts.set(attemptId, copy(attempt));
    return { applied: true, attempt: copy(attempt) };
  }

  async listUsage(attemptId: string): Promise<UsageV1[]> {
    return (this.usages.get(attemptId) ?? []).map(copy);
  }

  async recordVerification(attemptId: string, result: VerificationResult): Promise<void> {
    const list = this.verifications.get(attemptId) ?? [];
    list.push(copy(result));
    this.verifications.set(attemptId, list);
  }

  async reserveCost(input: CostReservationInput): Promise<CostReservation> {
    if (!Number.isSafeInteger(input.amountNanoUsd) || input.amountNanoUsd <= 0) {
      throw new PromptGymError("INVALID_INPUT", "Invalid cost reservation", 400);
    }
    const attempt = this.attempts.get(input.attemptId);
    if (!attempt || attempt.userId !== input.userId)
      throw new PromptGymError("NOT_FOUND", "Attempt not found", 404);
    const pending = [...this.reservations.values()];
    const pendingAttempt = pending
      .filter((item) => item.attemptId === input.attemptId)
      .reduce((sum, item) => sum + item.reservedNanoUsd, 0);
    if (attempt.actualCostNanoUsd + pendingAttempt + input.amountNanoUsd > input.attemptLimitNanoUsd) {
      throw new PromptGymError("COST_BUDGET", "This run has reached its covered API budget", 402);
    }
    const userKey = `${input.userId}:${input.utcDay}`;
    const pendingUser = pending
      .filter((item) => item.userId === input.userId && item.utcDay === input.utcDay)
      .reduce((sum, item) => sum + item.reservedNanoUsd, 0);
    if (
      (this.actualSpendByUserDay.get(userKey) ?? 0) + pendingUser + input.amountNanoUsd >
      input.userDailyLimitNanoUsd
    ) {
      throw new PromptGymError("ENERGY_EXHAUSTED", "Today's covered API budget is used up", 402);
    }
    const pendingGlobal = pending
      .filter((item) => item.utcDay === input.utcDay)
      .reduce((sum, item) => sum + item.reservedNanoUsd, 0);
    if (
      (this.actualSpendByGlobalDay.get(input.utcDay) ?? 0) + pendingGlobal + input.amountNanoUsd >
      input.globalDailyLimitNanoUsd
    ) {
      throw new PromptGymError(
        "GLOBAL_CIRCUIT_OPEN",
        "The daily arena budget is temporarily full",
        503,
        true,
      );
    }
    const reservation: CostReservation = {
      id: randomUUID(),
      attemptId: input.attemptId,
      userId: input.userId,
      utcDay: input.utcDay,
      reservedNanoUsd: input.amountNanoUsd,
    };
    this.reservations.set(reservation.id, reservation);
    return copy(reservation);
  }

  async settleCost(reservationId: string, actualNanoUsd: number): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new PromptGymError("CONFLICT", "Cost reservation is missing", 409);
    if (
      !Number.isSafeInteger(actualNanoUsd) ||
      actualNanoUsd < 0 ||
      actualNanoUsd > reservation.reservedNanoUsd
    ) {
      throw new PromptGymError("CONFLICT", "Provider cost exceeded its reservation", 409);
    }
    this.reservations.delete(reservationId);
    const userKey = `${reservation.userId}:${reservation.utcDay}`;
    this.actualSpendByUserDay.set(userKey, (this.actualSpendByUserDay.get(userKey) ?? 0) + actualNanoUsd);
    this.actualSpendByGlobalDay.set(
      reservation.utcDay,
      (this.actualSpendByGlobalDay.get(reservation.utcDay) ?? 0) + actualNanoUsd,
    );
  }

  async saveLeaderboardEntry(entry: StoredLeaderboardEntry): Promise<void> {
    if (!this.leaderboard.has(entry.attemptId)) this.leaderboard.set(entry.attemptId, copy(entry));
  }

  async listLeaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const values = [...this.leaderboard.values()]
      .filter((entry) => entry.arenaId === query.arenaId)
      .filter((entry) => !query.challengeSlug || entry.challengeSlug === query.challengeSlug)
      .filter((entry) => !query.instanceId || entry.instanceId === query.instanceId)
      .filter((entry) => query.assisted === undefined || entry.assisted === query.assisted)
      .sort((a, b) => a.competitionTokens - b.competitionTokens || a.attemptId.localeCompare(b.attemptId))
      .slice(0, query.limit ?? 100);
    let priorTokens: number | undefined;
    let rank = 0;
    return values.map((entry, index) => {
      if (entry.competitionTokens !== priorTokens) rank = index + 1;
      priorTokens = entry.competitionTokens;
      const { arenaId: _arena, challengeSlug: _challenge, instanceId: _instance, ...publicEntry } = entry;
      return { ...copy(publicEntry), rank };
    });
  }

  async saveConsent(consent: ConsentRecord): Promise<void> {
    this.consents.set(consent.userId, copy(consent));
  }
  async getConsent(userId: string): Promise<ConsentRecord | undefined> {
    const consent = this.consents.get(userId);
    return consent ? copy(consent) : undefined;
  }
  async saveEligibility(record: EligibilityRecord): Promise<void> {
    this.eligibility.set(record.userId, copy(record));
  }
  async getEligibility(userId: string): Promise<EligibilityRecord | undefined> {
    const record = this.eligibility.get(userId);
    return record ? copy(record) : undefined;
  }

  async deleteUser(userId: string): Promise<void> {
    const attemptIds = [...this.attempts.values()]
      .filter((attempt) => attempt.userId === userId)
      .map((attempt) => attempt.id);
    for (const attemptId of attemptIds) {
      this.attempts.delete(attemptId);
      this.envelopes.delete(attemptId);
      this.events.delete(attemptId);
      this.usages.delete(attemptId);
      this.verifications.delete(attemptId);
      this.leaderboard.delete(attemptId);
      for (const [turnId, turn] of this.turns) if (turn.attemptId === attemptId) this.turns.delete(turnId);
    }
    this.consents.delete(userId);
    this.eligibility.delete(userId);
  }
}

export type EventSubscriber = (event: RunEvent) => void;
export class RunEventHub {
  private readonly listeners = new Map<string, Set<EventSubscriber>>();
  publish(event: RunEvent): void {
    for (const listener of this.listeners.get(event.attemptId) ?? []) listener(copy(event));
  }
  subscribe(attemptId: string, listener: EventSubscriber): () => void {
    const set = this.listeners.get(attemptId) ?? new Set<EventSubscriber>();
    set.add(listener);
    this.listeners.set(attemptId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(attemptId);
    };
  }
}

export class VisibleEventWriter {
  constructor(
    private readonly repository: PromptGymRepository,
    private readonly hub: RunEventHub,
  ) {}
  async append(input: EventInput): Promise<RunEvent> {
    const event = await this.repository.appendEvent(input);
    this.hub.publish(event);
    return event;
  }
}
