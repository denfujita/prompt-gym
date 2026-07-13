import { z } from "zod";

export const CHALLENGE_KINDS = ["visual", "artifact", "data"] as const;
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
  "usage.recorded",
  "verification.completed",
  "hint.unlocked",
] as const;

export type ChallengeKind = (typeof CHALLENGE_KINDS)[number];
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export type TurnStatus = (typeof TURN_STATUSES)[number];
export type RunEventActor = (typeof RUN_EVENT_ACTORS)[number];
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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
  brief: string;
  kind: ChallengeKind;
  accent: ChallengeAccent;
  difficulty: "hard" | "expert";
  estimatedMinutes: number;
  maxPrompts: number;
  maxToolActionsPerTurn: number;
  maxCompetitionTokens: number;
  featured: boolean;
  accessibilityLabel: string;
}
export interface ArenaConfig {
  id: string;
  seasonId: string;
  modelAlias: string;
  resolvedModel: string;
  reasoningEffort: "medium";
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
  provider: "openai" | "scripted";
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
  outcome: { passed: boolean; verifierDigest: string; artifactHashes: string[] };
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
