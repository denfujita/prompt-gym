import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AttemptState, ChallengeInstanceEnvelope, JsonValue, Turn } from "@prompt-gym/contracts";

export const challengeKindEnum = pgEnum("challenge_kind", ["visual", "artifact", "data"]);
export const attemptStatusEnum = pgEnum("attempt_status", [
  "created",
  "ready",
  "running",
  "awaiting_player",
  "solved",
  "failed",
  "cancelled",
  "expired",
  "budget_exhausted",
]);
export const turnStatusEnum = pgEnum("turn_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const eventActorEnum = pgEnum("event_actor", ["system", "player", "model", "tool", "verifier"]);
export const artifactKindEnum = pgEnum("artifact_kind", ["file", "snapshot", "report"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["pending", "settled"]);

export const challenges = pgTable("challenge", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  kind: challengeKindEnum("kind").notNull(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challengeVersions = pgTable(
  "challenge_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeSlug: text("challenge_slug")
      .notNull()
      .references(() => challenges.slug, { onDelete: "restrict" }),
    version: text("version").notNull(),
    manifest: jsonb("manifest").$type<Record<string, JsonValue>>().notNull(),
    generatorDigest: text("generator_digest").notNull(),
    verifierDigest: text("verifier_digest").notNull(),
    toolSchemaDigest: text("tool_schema_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("challenge_version_slug_version_uq").on(table.challengeSlug, table.version)],
);

export const arenas = pgTable(
  "arena",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id").notNull(),
    modelAlias: text("model_alias").notNull(),
    resolvedModel: text("resolved_model").notNull(),
    reasoningEffort: text("reasoning_effort").notNull(),
    responseVerbosity: text("response_verbosity").notNull(),
    priceVersion: text("price_version").notNull(),
    sandboxImageDigest: text("sandbox_image_digest").notNull(),
    ranked: boolean("ranked").notNull(),
    closedReason: text("closed_reason"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("arena_season_idx").on(table.seasonId)],
);

export const taskInstances = pgTable(
  "task_instance",
  {
    id: text("id").primaryKey(),
    challengeVersionId: uuid("challenge_version_id")
      .notNull()
      .references(() => challengeVersions.id, { onDelete: "restrict" }),
    instanceClass: text("instance_class").notNull(),
    seedCommitment: text("seed_commitment").notNull(),
    sandboxImageDigest: text("sandbox_image_digest").notNull(),
    assignedDay: text("assigned_day").notNull(),
    seedSlot: integer("seed_slot").notNull(),
    privateLocator: text("private_locator").notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("task_instance_seed_slot_ck", sql`${table.seedSlot} between 0 and 2`),
    uniqueIndex("task_instance_seed_uq").on(
      table.challengeVersionId,
      table.seedCommitment,
      table.sandboxImageDigest,
    ),
  ],
);

export const attempts = pgTable(
  "attempt",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    publicHandle: text("public_handle").notNull(),
    arenaId: text("arena_id")
      .notNull()
      .references(() => arenas.id, { onDelete: "restrict" }),
    challengeVersionId: uuid("challenge_version_id")
      .notNull()
      .references(() => challengeVersions.id, { onDelete: "restrict" }),
    taskInstanceId: text("task_instance_id")
      .notNull()
      .references(() => taskInstances.id, { onDelete: "restrict" }),
    ranked: boolean("ranked").notNull(),
    assisted: boolean("assisted").notNull().default(false),
    status: attemptStatusEnum("status").notNull(),
    promptsUsed: integer("prompts_used").notNull().default(0),
    toolActionsUsed: integer("tool_actions_used").notNull().default(0),
    competitionTokens: integer("competition_tokens").notNull().default(0),
    actualCostNanoUsd: bigint("actual_cost_nano_usd", { mode: "number" }).notNull().default(0),
    maxPrompts: integer("max_prompts").notNull(),
    maxToolActionsPerTurn: integer("max_tool_actions_per_turn").notNull(),
    maxCompetitionTokens: integer("max_competition_tokens").notNull(),
    maxActualCostNanoUsd: bigint("max_actual_cost_nano_usd", { mode: "number" }).notNull(),
    lastEventSequence: integer("last_event_sequence").notNull().default(0),
    lastEventHash: text("last_event_hash").notNull(),
    challengeSlug: text("challenge_slug").notNull(),
    challengeVersion: text("challenge_version").notNull(),
    startedDay: text("started_day").notNull(),
    state: jsonb("state").$type<AttemptState>().notNull(),
    envelope: jsonb("envelope").$type<ChallengeInstanceEnvelope>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attempt_user_status_idx").on(table.userId, table.status),
    index("attempt_arena_instance_idx").on(table.arenaId, table.taskInstanceId),
    uniqueIndex("attempt_one_active_user_uq")
      .on(table.userId)
      .where(sql`${table.status} in ('created', 'ready', 'running', 'awaiting_player')`),
    uniqueIndex("attempt_ranked_daily_challenge_uq")
      .on(table.userId, table.challengeSlug, table.startedDay)
      .where(sql`${table.ranked} = true`),
    check(
      "attempt_counters_nonnegative_ck",
      sql`${table.promptsUsed} >= 0 and ${table.toolActionsUsed} >= 0 and ${table.competitionTokens} >= 0 and ${table.actualCostNanoUsd} >= 0`,
    ),
  ],
);

export const turns = pgTable(
  "turn",
  {
    id: uuid("id").primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    prompt: text("prompt").notNull(),
    status: turnStatusEnum("status").notNull(),
    failureCode: text("failure_code"),
    state: jsonb("state").$type<Turn>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("turn_attempt_ordinal_uq").on(table.attemptId, table.ordinal),
    uniqueIndex("turn_attempt_id_id_uq").on(table.attemptId, table.id),
    check("turn_prompt_length_ck", sql`char_length(${table.prompt}) between 1 and 4000`),
  ],
);

export const runEvents = pgTable(
  "run_event",
  {
    id: uuid("id").primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id"),
    sequence: integer("sequence").notNull(),
    actor: eventActorEnum("actor").notNull(),
    eventType: text("event_type").notNull(),
    publicPayload: jsonb("public_payload").$type<Record<string, JsonValue>>().notNull(),
    previousHash: text("previous_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("run_event_attempt_sequence_uq").on(table.attemptId, table.sequence),
    uniqueIndex("run_event_attempt_hash_uq").on(table.attemptId, table.hash),
    index("run_event_turn_sequence_idx").on(table.turnId, table.sequence),
    foreignKey({
      name: "run_event_attempt_turn_fk",
      columns: [table.attemptId, table.turnId],
      foreignColumns: [turns.attemptId, turns.id],
    }),
  ],
);

export const usageItems = pgTable(
  "usage_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id"),
    provider: text("provider").notNull(),
    providerResponseId: text("provider_response_id").notNull(),
    resolvedModel: text("resolved_model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    reasoningTokens: integer("reasoning_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    imageTokens: integer("image_tokens").notNull(),
    toolUnits: integer("tool_units").notNull(),
    priceVersion: text("price_version").notNull(),
    actualCostNanoUsd: bigint("actual_cost_nano_usd", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("usage_provider_response_uq").on(table.provider, table.providerResponseId),
    index("usage_attempt_idx").on(table.attemptId),
    index("usage_turn_idx").on(table.turnId),
    foreignKey({
      name: "usage_item_attempt_turn_fk",
      columns: [table.attemptId, table.turnId],
      foreignColumns: [turns.attemptId, turns.id],
    }),
  ],
);

export const verificationRuns = pgTable(
  "verification_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id"),
    passed: boolean("passed").notNull(),
    verifierDigest: text("verifier_digest").notNull(),
    publicFeedback: text("public_feedback").notNull(),
    privateResultRef: text("private_result_ref"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("verification_attempt_idx").on(table.attemptId),
    index("verification_turn_idx").on(table.turnId),
    foreignKey({
      name: "verification_run_attempt_turn_fk",
      columns: [table.attemptId, table.turnId],
      foreignColumns: [turns.attemptId, turns.id],
    }),
  ],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "set null" }),
    entryType: text("entry_type").notNull(),
    amountNanoUsd: bigint("amount_nano_usd", { mode: "number" }).notNull(),
    utcDay: text("utc_day").notNull(),
    reservationId: uuid("reservation_id"),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("credit_ledger_user_day_idx").on(table.userId, table.utcDay),
    index("credit_ledger_day_idx").on(table.utcDay),
  ],
);

/** Authoritative reservation lifecycle. The append-only credit ledger mirrors these rows for audit. */
export const costReservations = pgTable(
  "cost_reservation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    utcDay: text("utc_day").notNull(),
    reservedNanoUsd: bigint("reserved_nano_usd", { mode: "number" }).notNull(),
    actualNanoUsd: bigint("actual_nano_usd", { mode: "number" }),
    status: reservationStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("cost_reservation_attempt_idx").on(table.attemptId, table.status),
    index("cost_reservation_user_day_idx").on(table.userId, table.utcDay, table.status),
    index("cost_reservation_day_idx").on(table.utcDay, table.status),
    check(
      "cost_reservation_amount_ck",
      sql`${table.reservedNanoUsd} > 0 and (${table.actualNanoUsd} is null or (${table.actualNanoUsd} >= 0 and ${table.actualNanoUsd} <= ${table.reservedNanoUsd}))`,
    ),
  ],
);

/** PII-free settled spend retained across account deletion for the circuit breaker. */
export const dailyCostTotals = pgTable("daily_cost_total", {
  utcDay: text("utc_day").primaryKey(),
  actualNanoUsd: bigint("actual_nano_usd", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaderboardEntries = pgTable(
  "leaderboard_entry",
  {
    attemptId: uuid("attempt_id")
      .primaryKey()
      .references(() => attempts.id, { onDelete: "cascade" }),
    arenaId: text("arena_id")
      .notNull()
      .references(() => arenas.id, { onDelete: "cascade" }),
    challengeSlug: text("challenge_slug").notNull(),
    instanceId: text("instance_id").notNull(),
    publicHandle: text("public_handle").notNull(),
    competitionTokens: integer("competition_tokens").notNull(),
    turns: integer("turns").notNull(),
    assisted: boolean("assisted").notNull(),
    solvedAt: timestamp("solved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("leaderboard_exact_arena_idx").on(
      table.arenaId,
      table.challengeSlug,
      table.instanceId,
      table.assisted,
      table.competitionTokens,
    ),
  ],
);

export const artifacts = pgTable(
  "artifact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    kind: artifactKindEnum("kind").notNull(),
    objectKey: text("object_key").notNull(),
    sha256: text("sha256").notNull(),
    byteLength: bigint("byte_length", { mode: "number" }).notNull(),
    publicLabel: text("public_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_object_key_uq").on(table.objectKey),
    index("artifact_attempt_idx").on(table.attemptId),
  ],
);

export const consentRecords = pgTable(
  "consent_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    version: text("version").notNull(),
    operational: boolean("operational").notNull().default(true),
    research: boolean("research").notNull(),
    publicReplay: boolean("public_replay").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("consent_user_version_uq").on(table.userId, table.version),
    index("consent_user_recorded_idx").on(table.userId, table.recordedAt),
  ],
);

export const eligibilityRecords = pgTable(
  "eligibility_record",
  {
    userId: text("user_id").primaryKey(),
    age18Plus: boolean("age_18_plus").notNull(),
    usResident: boolean("us_resident").notNull(),
    version: text("version").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("eligibility_required_truth_ck", sql`${table.age18Plus} = true and ${table.usResident} = true`),
  ],
);

export const fraudSignals = pgTable(
  "fraud_signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "set null" }),
    signalType: text("signal_type").notNull(),
    severity: integer("severity").notNull(),
    evidence: jsonb("evidence").$type<Record<string, JsonValue>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("fraud_signal_user_idx").on(table.userId),
    check("fraud_signal_severity_ck", sql`${table.severity} between 1 and 5`),
  ],
);

export const baselineRuns = pgTable(
  "baseline_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskInstanceId: text("task_instance_id")
      .notNull()
      .references(() => taskInstances.id, { onDelete: "restrict" }),
    arenaId: text("arena_id")
      .notNull()
      .references(() => arenas.id, { onDelete: "restrict" }),
    strategy: text("strategy").notNull(),
    replicate: integer("replicate").notNull(),
    episodeObjectKey: text("episode_object_key").notNull(),
    passed: boolean("passed").notNull(),
    competitionTokens: integer("competition_tokens").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("baseline_instance_strategy_replicate_uq").on(
      table.taskInstanceId,
      table.arenaId,
      table.strategy,
      table.replicate,
    ),
  ],
);

export const datasetReleases = pgTable(
  "dataset_release",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull(),
    state: text("state").notNull(),
    manifestObjectKey: text("manifest_object_key").notNull(),
    manifestSha256: text("manifest_sha256").notNull(),
    episodeCount: integer("episode_count").notNull(),
    tombstoneVersion: integer("tombstone_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("dataset_release_version_uq").on(table.version)],
);

export const datasetReleaseEpisodes = pgTable(
  "dataset_release_episode",
  {
    releaseId: uuid("release_id")
      .notNull()
      .references(() => datasetReleases.id, { onDelete: "cascade" }),
    // Deliberately no FK: deletion leaves a buyer-facing tombstone without retaining the operational attempt.
    attemptId: uuid("attempt_id").notNull(),
    episodeSha256: text("episode_sha256").notNull(),
    deletionState: text("deletion_state").notNull().default("active"),
  },
  (table) => [primaryKey({ columns: [table.releaseId, table.attemptId] })],
);
