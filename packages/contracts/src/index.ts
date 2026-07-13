import { z } from "zod";

export const CHALLENGE_KINDS = ["visual", "artifact", "data"] as const;
export const CHALLENGE_PLAY_MODES = ["puzzle", "build"] as const;
export const ATTEMPT_STATUSES = [
  "created",
  "ready",
  "running",
  "awaiting_player",
  "solved",
  "failed",
  "cancelled",
  "expired",
  "budget_exhausted",
] as const;
export const TURN_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export const RUN_EVENT_ACTORS = ["system", "player", "model", "tool", "verifier"] as const;
export const RUN_EVENT_TYPES = [
  "attempt.started",
  "attempt.cancelled",
  "attempt.completed",
  "attempt.failed",
  "attempt.budget_exhausted",
  "turn.queued",
  "turn.started",
  "turn.completed",
  "turn.cancelled",
  "turn.failed",
  "model.thinking",
  "model.message",
  "tool.started",
  "tool.completed",
  "task.state",
  "evaluation.queued",
  "evaluation.started",
  "evaluation.completed",
  "usage.recorded",
  "verification.completed",
  "hint.unlocked",
] as const;

export type ChallengeKind = (typeof CHALLENGE_KINDS)[number];
export type ChallengePlayMode = (typeof CHALLENGE_PLAY_MODES)[number];
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export type TurnStatus = (typeof TURN_STATUSES)[number];
export type RunEventActor = (typeof RUN_EVENT_ACTORS)[number];
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Public, season-pinned routing metadata for a playable model. Model profiles
 * are immutable inputs to an arena: changing a route creates a new profile or
 * season instead of silently changing the model behind a leaderboard.
 */
export interface ModelProfileV1 {
  schemaVersion: "model-profile.v1";
  /** Prompt Gym's stable public identifier. Thinking variants have their own id. */
  id: string;
  designArenaId: string;
  displayName: string;
  creator: string;
  /** Direct OpenAI Responses or OpenRouter's OpenAI-compatible chat API. */
  provider: "openai" | "openrouter";
  /** Exact provider route. Absent only when Design Arena has not published one. */
  providerModelId?: string;
  /** Design Arena's exact OpenRouter route, including for directly routed models. */
  openRouterModelId?: string;
  /** Frozen OpenRouter endpoint tag. Aggregator practice never load-balances endpoints. */
  providerEndpoint?: string;
  availability: "available" | "needs-route";
  ranked: boolean;
  reasoningMode: "standard" | "thinking";
  priceVersion: string;
  /**
   * Reviewed provider price ceiling used to bound every subsidized call before
   * it is sent. Omitted only for profiles without a validated provider route.
   */
  priceCeiling?: {
    inputNanoUsdPerToken: number;
    outputNanoUsdPerToken: number;
  };
  /** ISO date for the checked-in Design Arena snapshot. */
  sourceSyncedAt: string;
}

export const BENCHMARK_TIERS = ["invalid", "bronze", "silver", "gold"] as const;
export type BenchmarkTier = (typeof BENCHMARK_TIERS)[number];

export interface KernelBenchmarkProfileV1 {
  schemaVersion: "benchmark.v1";
  family: "kernelbench-compatible";
  source: {
    name: string;
    upstreamCommit: string;
    license: string;
    taskId: string;
    /** Public manifests only describe exposed practice. Sealed classification stays private. */
    contamination: "public_benchmark_practice";
  };
  maxEvaluations: number;
  evaluatorProfileDigest: string;
  environmentProfileDigest: string;
  hardwareProfile: string;
  backend: "cuda" | "triton";
  precision: string;
  score: {
    metricId: "speedup_ppm";
    direction: "maximize";
    correctnessGate: "all_hidden_cases";
    bronzeThresholdPpm: "0";
    silverThresholdPpm: "1000000";
    goldThresholdPpm: "2000000";
    tieBreaker: "competition_tokens";
  };
}

const benchmarkEvaluatorBaseSchema = {
  schemaVersion: z.literal("benchmark-evaluator-result.v1"),
  candidateSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  evaluatorProfileDigest: z.string().min(8).max(160),
  environmentDigest: z.string().min(8).max(160),
  measurementDigest: z.string().min(8).max(160),
  publicFeedback: z.string().min(1).max(400),
  evaluatedAt: z.string().datetime({ offset: true }),
};

const benchmarkScoreSchema = z
  .object({
    metricId: z.literal("speedup_ppm"),
    valueInt: z.string().regex(/^\d+$/),
    referenceLatencyNs: z.string().regex(/^[1-9]\d*$/),
    candidateLatencyNs: z.string().regex(/^[1-9]\d*$/),
  })
  .strict();

export const benchmarkEvaluatorResultSchema = z
  .discriminatedUnion("outcome", [
    z
      .object({
        ...benchmarkEvaluatorBaseSchema,
        outcome: z.literal("incorrect"),
        correctness: z
          .object({
            passed: z.literal(false),
            casesPassed: z.number().int().nonnegative(),
            casesTotal: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...benchmarkEvaluatorBaseSchema,
        outcome: z.literal("correct"),
        correctness: z
          .object({
            passed: z.literal(true),
            casesPassed: z.number().int().positive(),
            casesTotal: z.number().int().positive(),
          })
          .strict(),
        score: benchmarkScoreSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.correctness.casesPassed > value.correctness.casesTotal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctness", "casesPassed"],
        message: "casesPassed cannot exceed casesTotal",
      });
    }
    if (value.outcome === "correct" && value.correctness.casesPassed !== value.correctness.casesTotal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctness"],
        message: "correct benchmark results must pass every case",
      });
    }
  });

export type BenchmarkEvaluatorResultV1 = z.infer<typeof benchmarkEvaluatorResultSchema>;
type IncorrectBenchmarkEvaluatorResultV1 = Extract<BenchmarkEvaluatorResultV1, { outcome: "incorrect" }>;
type CorrectBenchmarkEvaluatorResultV1 = Extract<BenchmarkEvaluatorResultV1, { outcome: "correct" }>;

interface BenchmarkEvaluationBaseV1 {
  schemaVersion: "benchmark-evaluation.v1";
  evaluationId: string;
  turnId: string;
  purpose: "candidate" | "final" | "audit";
  competitionTokensAtCandidate: number;
}

/** Core-stamped durable evaluation. Evaluators never supply IDs, tiers, or token accounting. */
export type BenchmarkEvaluationV1 =
  | (BenchmarkEvaluationBaseV1 & {
      eligible: false;
      tier: "invalid";
      result: IncorrectBenchmarkEvaluatorResultV1;
    })
  | (BenchmarkEvaluationBaseV1 & {
      eligible: true;
      tier: Exclude<BenchmarkTier, "invalid">;
      result: CorrectBenchmarkEvaluatorResultV1;
    });

export interface ChallengeAccent {
  name: string;
  hex: `#${string}`;
  symbol: string;
}
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
}
export interface ChallengeManifest {
  slug: string;
  version: string;
  title: string;
  shortDescription: string;
  /** Short story shown to the player. Never use this as model instruction text. */
  playerBrief: string;
  /** Exact, player-readable condition the deterministic verifier checks. */
  winCondition: string;
  /** Complete task instruction placed in the model context. */
  brief: string;
  kind: ChallengeKind;
  playMode: ChallengePlayMode;
  accent: ChallengeAccent;
  difficulty: "hard" | "expert";
  estimatedMinutes: number;
  /** Player-readable total task budget, such as "24 control actions" or "18 oracle probes". */
  actionBudgetLabel: string;
  maxPrompts: number;
  maxToolActionsPerTurn: number;
  maxCompetitionTokens: number;
  featured: boolean;
  accessibilityLabel: string;
  benchmark?: KernelBenchmarkProfileV1;
}
export interface ArenaConfig {
  id: string;
  seasonId: string;
  modelAlias: string;
  resolvedModel: string;
  reasoningEffort: "default" | "none" | "medium";
  responseVerbosity: "low";
  priceVersion: string;
  sandboxImageDigest: string;
  ranked: boolean;
  startsAt: string;
  endsAt: string;
}
export interface TaskInstanceRef {
  id: string;
  challengeSlug: string;
  challengeVersion: string;
  instanceClass: string;
  seedCommitment: string;
  sandboxImageDigest: string;
}
export interface AttemptState {
  id: string;
  userId: string;
  publicHandle: string;
  arenaId: string;
  /** Stable model profile selected before the attempt starts. */
  modelProfileId?: string;
  challengeSlug: string;
  challengeVersion: string;
  instance: TaskInstanceRef;
  ranked: boolean;
  assisted: boolean;
  status: AttemptStatus;
  promptsUsed: number;
  toolActionsUsed: number;
  competitionTokens: number;
  actualCostNanoUsd: number;
  maxPrompts: number;
  maxToolActionsPerTurn: number;
  maxCompetitionTokens: number;
  maxActualCostNanoUsd: number;
  startedAt: string;
  expiresAt: string;
  completedAt?: string;
  lastEventSequence: number;
  lastEventHash: string;
}
export interface Turn {
  id: string;
  attemptId: string;
  ordinal: number;
  prompt: string;
  status: TurnStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failureCode?: string;
}
export interface RunEvent {
  id: string;
  attemptId: string;
  /** Durable link to the human turn that caused this event, when applicable. */
  turnId?: string;
  sequence: number;
  actor: RunEventActor;
  type: RunEventType;
  /** Payloads are user-visible. Private verifier state and reasoning are forbidden. */
  payload: Record<string, JsonValue>;
  createdAt: string;
  previousHash: string;
  hash: string;
}
export interface UsageV1 {
  schemaVersion: "usage.v1";
  /** Populated by storage when this provider call belongs to a persisted turn. */
  turnId?: string;
  provider: "openai" | "openrouter" | "scripted";
  providerResponseId: string;
  resolvedModel: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  imageTokens: number;
  toolUnits: number;
  priceVersion: string;
  actualCostNanoUsd: number;
  createdAt: string;
}
export interface VerificationResult {
  /** Populated by storage when this check belongs to a persisted turn. */
  turnId?: string;
  passed: boolean;
  verifierDigest: string;
  publicFeedback: string;
  /** Opaque server-side locator; never expose it in public DTOs or RunEvents. */
  privateResultRef?: string;
  verifiedAt: string;
}
export interface ArtifactRef {
  id: string;
  kind: "file" | "snapshot" | "report";
  sha256: string;
  byteLength: number;
  publicLabel: string;
}
export interface ChallengeInstanceEnvelope {
  instance: TaskInstanceRef;
  publicState: Record<string, JsonValue>;
  modelBrief: string;
  allowedTools: ToolDefinition[];
}
export interface ChallengeToolResult {
  visibleOutput: Record<string, JsonValue>;
  publicState?: Record<string, JsonValue>;
  artifacts?: ArtifactRef[];
  /** Untrusted evaluator measurement; core validates it and stamps durable accounting. */
  evaluation?: BenchmarkEvaluatorResultV1;
  verification?: VerificationResult;
}
export interface LeaderboardEntry {
  rank: number;
  attemptId: string;
  publicHandle: string;
  competitionTokens: number;
  turns: number;
  assisted: boolean;
  solvedAt: string;
}
export interface ConsentRecord {
  userId: string;
  version: string;
  operational: true;
  research: boolean;
  publicReplay: boolean;
  recordedAt: string;
  withdrawnAt?: string;
}
export interface EligibilityRecord {
  userId: string;
  age18Plus: true;
  usResident: true;
  version: string;
  recordedAt: string;
}
export interface EpisodeEventV1 {
  sequence: number;
  turnId?: string;
  actor: RunEventActor;
  type: RunEventType;
  payload: Record<string, JsonValue>;
  createdAt: string;
  hash: string;
}
export interface EpisodeV1 {
  schemaVersion: "episode.v1";
  episodeId: string;
  task: {
    slug: string;
    version: string;
    instanceClass: string;
    seedCommitment: string;
    generatorDigest: string;
  };
  configuration: {
    provider: string;
    modelAlias: string;
    resolvedModel: string;
    reasoningEffort: string;
    toolSchemaDigest: string;
    sandboxImageDigest: string;
    priceVersion: string;
  };
  events: EpisodeEventV1[];
  usage: UsageV1[];
  outcome: { passed: boolean; turnId?: string; verifierDigest: string; artifactHashes: string[] };
  baselineEpisodeIds: string[];
  qualityFlags: string[];
  integrityFlags: string[];
  consent: {
    version: string;
    permittedUses: Array<"operations" | "research" | "public_replay">;
    deletionState: "active" | "withdrawn" | "deleted";
  };
}
export interface PublicReplay {
  attempt: Omit<AttemptState, "userId" | "lastEventHash">;
  challenge: ChallengeManifest;
  events: RunEvent[];
}
export interface EnergyStatus {
  remaining: number;
  total: number;
  resetsAt: string;
}

export const createAttemptRequestSchema = z
  .object({
    challengeSlug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
    ranked: z.boolean().optional().default(true),
    modelProfileId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9][a-z0-9._-]*$/)
      .optional(),
  })
  .strict();
export const createTurnRequestSchema = z.object({ prompt: z.string().trim().min(1).max(4_000) }).strict();
export const consentRequestSchema = z
  .object({ research: z.boolean(), publicReplay: z.boolean(), version: z.string().min(1).max(40) })
  .strict();
export const eligibilityRequestSchema = z
  .object({
    age18Plus: z.literal(true),
    usResident: z.literal(true),
    version: z.string().min(1).max(40),
    turnstileToken: z.string().min(1).max(4_000).optional(),
  })
  .strict();
export const leaderboardQuerySchema = z
  .object({
    challengeSlug: z.string().min(1).max(80).optional(),
    instanceId: z.string().min(1).max(160).optional(),
    assisted: z.enum(["true", "false"]).optional(),
  })
  .strict();
export type CreateAttemptRequest = z.infer<typeof createAttemptRequestSchema>;
export type CreateTurnRequest = z.infer<typeof createTurnRequestSchema>;
export type ConsentRequest = z.infer<typeof consentRequestSchema>;
export type EligibilityRequest = z.infer<typeof eligibilityRequestSchema>;
