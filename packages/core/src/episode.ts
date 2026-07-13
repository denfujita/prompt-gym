import type {
  ArenaConfig,
  AttemptState,
  ChallengeManifest,
  ConsentRecord,
  EpisodeV1,
  JsonValue,
  RunEvent,
  UsageV1,
  VerificationResult,
} from "@prompt-gym/contracts";
import { PromptGymError } from "./errors.js";
import { sha256, stableJson } from "./crypto.js";

export interface EpisodeBuildInput {
  attempt: AttemptState;
  challenge: ChallengeManifest;
  arena: ArenaConfig;
  events: RunEvent[];
  usage: UsageV1[];
  verification: VerificationResult;
  consent: ConsentRecord;
  generatorDigest: string;
  toolSchemaDigest: string;
  artifactHashes?: string[];
  baselineEpisodeIds?: string[];
  qualityFlags?: string[];
  integrityFlags?: string[];
}

const forbiddenKeys = new Set([
  "privateResultRef",
  "encrypted_content",
  "chain_of_thought",
  "hidden_reasoning",
  "raw_reasoning",
]);
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const secretPattern = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b/g;
const phonePattern = /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g;

function sanitize(value: JsonValue, state: { redacted: boolean }): JsonValue {
  if (typeof value === "string") {
    const next = value
      .replace(emailPattern, "[redacted-email]")
      .replace(phonePattern, "[redacted-phone]")
      .replace(secretPattern, "[redacted-secret]");
    if (next !== value) state.redacted = true;
    return next;
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, state));
  if (value && typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        state.redacted = true;
        continue;
      }
      output[key] = sanitize(item, state);
    }
    return output;
  }
  return value;
}

export function buildEpisodeV1(input: EpisodeBuildInput): EpisodeV1 {
  if (!input.consent.research || input.consent.withdrawnAt) {
    throw new PromptGymError("CONFLICT", "This run is not permitted for research export", 409);
  }
  if (!input.verification.passed || input.attempt.status !== "solved") {
    throw new PromptGymError("CONFLICT", "Only reproducible exact solves can enter a Grade A export", 409);
  }
  const redaction = { redacted: false };
  const events = input.events.map((event) => {
    const payload = sanitize(event.payload, redaction) as Record<string, JsonValue>;
    return {
      sequence: event.sequence,
      actor: event.actor,
      type: event.type,
      payload,
      createdAt: event.createdAt,
      hash: sha256(
        stableJson({
          sequence: event.sequence,
          actor: event.actor,
          type: event.type,
          payload,
          createdAt: event.createdAt,
        }),
      ),
    };
  });
  const permittedUses: Array<"operations" | "research" | "public_replay"> = ["operations", "research"];
  if (input.consent.publicReplay) permittedUses.push("public_replay");
  const qualityFlags = new Set(input.qualityFlags ?? []);
  if (redaction.redacted) qualityFlags.add("pii_or_secret_redacted");
  const episodeId = `ep_${sha256(
    stableJson({
      attemptId: input.attempt.id,
      arenaId: input.arena.id,
      verifierDigest: input.verification.verifierDigest,
      eventHashes: events.map((event) => event.hash),
    }),
  ).slice(0, 32)}`;
  return {
    schemaVersion: "episode.v1",
    episodeId,
    task: {
      slug: input.challenge.slug,
      version: input.challenge.version,
      instanceClass: input.attempt.instance.instanceClass,
      seedCommitment: input.attempt.instance.seedCommitment,
      generatorDigest: input.generatorDigest,
    },
    configuration: {
      provider: input.usage[0]?.provider ?? "unknown",
      modelAlias: input.arena.modelAlias,
      resolvedModel: input.arena.resolvedModel,
      reasoningEffort: input.arena.reasoningEffort,
      toolSchemaDigest: input.toolSchemaDigest,
      sandboxImageDigest: input.arena.sandboxImageDigest,
      priceVersion: input.arena.priceVersion,
    },
    events,
    usage: structuredClone(input.usage),
    outcome: {
      passed: true,
      verifierDigest: input.verification.verifierDigest,
      artifactHashes: [...(input.artifactHashes ?? [])].sort(),
    },
    baselineEpisodeIds: [...(input.baselineEpisodeIds ?? [])].sort(),
    qualityFlags: [...qualityFlags].sort(),
    integrityFlags: [...(input.integrityFlags ?? [])].sort(),
    consent: { version: input.consent.version, permittedUses, deletionState: "active" },
  };
}

export interface EpisodeReleaseManifest {
  schemaVersion: "episode-release.v1";
  releaseId: string;
  generatedAt: string;
  episodeCount: number;
  jsonlSha256: string;
  jsonlBytes: number;
  episodes: Array<{ episodeId: string; sha256: string }>;
}

export function buildEpisodeJsonlRelease(
  episodes: EpisodeV1[],
  generatedAt: string,
): { jsonl: string; manifest: EpisodeReleaseManifest } {
  const ordered = [...episodes].sort((a, b) => a.episodeId.localeCompare(b.episodeId));
  const lines = ordered.map((episode) => stableJson(episode));
  const jsonl = lines.length ? `${lines.join("\n")}\n` : "";
  const digest = sha256(jsonl);
  return {
    jsonl,
    manifest: {
      schemaVersion: "episode-release.v1",
      releaseId: `release_${digest.slice(0, 24)}`,
      generatedAt,
      episodeCount: ordered.length,
      jsonlSha256: digest,
      jsonlBytes: Buffer.byteLength(jsonl),
      episodes: ordered.map((episode, index) => ({
        episodeId: episode.episodeId,
        sha256: sha256(lines[index]!),
      })),
    },
  };
}
