import { Worker, type ConnectionOptions } from "bullmq";
import {
  HttpChallengeServiceClient,
  OpenAIResponsesProvider,
  PromptGymService,
  RunEngine,
  RunEventHub,
  createDefaultArena,
  resolveRankedPlayEnabled,
} from "@prompt-gym/core";
import { PostgresPromptGymRepository } from "@prompt-gym/db";
import { createJobProcessor } from "./processor.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const redisUrl = required("REDIS_URL");
const databaseUrl = required("DATABASE_URL");
const challengeServiceUrl = required("CHALLENGE_SERVICE_URL");
const challengeServiceToken = required("CHALLENGE_SERVICE_TOKEN");
const openAiApiKey = required("OPENAI_API_KEY");
const model = process.env.OPENAI_MODEL ?? "gpt-5.6-terra";
const sandboxImageDigest = required("SANDBOX_IMAGE_DIGEST");
if (!/^sha256:[a-f0-9]{64}$/u.test(sandboxImageDigest))
  throw new Error("SANDBOX_IMAGE_DIGEST must be a pinned sha256 digest");
const challengeService = new HttpChallengeServiceClient(challengeServiceUrl, challengeServiceToken);
const arena = createDefaultArena(
  new Date(),
  model,
  sandboxImageDigest,
  resolveRankedPlayEnabled({
    enabled: process.env.RANKED_PLAY_ENABLED,
    isolationAttestation: process.env.RANKED_ISOLATION_ATTESTATION,
  }),
);
const challenges = await challengeService.listChallenges();
const repository = new PostgresPromptGymRepository({ databaseUrl, arena, challenges });
await repository.initialize();
const service = new PromptGymService(
  repository,
  challengeService,
  arena,
  new RunEventHub(),
  required("INSTANCE_ASSIGNMENT_SECRET"),
  required("PUBLIC_HANDLE_SECRET"),
);
const engine = new RunEngine(service, new OpenAIResponsesProvider(openAiApiKey, model), {
  safetySecret: required("SAFETY_IDENTIFIER_SECRET"),
  globalDailyCostLimitNanoUsd: process.env.GLOBAL_DAILY_COST_USD
    ? Number(process.env.GLOBAL_DAILY_COST_USD) * 1_000_000_000
    : undefined,
});

const parsedRedis = new URL(redisUrl);
const connection: ConnectionOptions = {
  host: parsedRedis.hostname,
  port: Number(parsedRedis.port || 6379),
  ...(parsedRedis.username ? { username: decodeURIComponent(parsedRedis.username) } : {}),
  ...(parsedRedis.password ? { password: decodeURIComponent(parsedRedis.password) } : {}),
  ...(parsedRedis.pathname.length > 1 ? { db: Number(parsedRedis.pathname.slice(1)) } : {}),
  ...(parsedRedis.protocol === "rediss:" ? { tls: {} } : {}),
};
const worker = new Worker(
  process.env.RUN_QUEUE_NAME ?? "prompt-gym-runs",
  createJobProcessor({ processTurn: (turnId) => engine.processTurn(turnId) }),
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 8), lockDuration: 12 * 60_000 },
);
worker.on("failed", (job, error) =>
  console.error(
    JSON.stringify({ level: "error", event: "run_job_failed", jobId: job?.id, message: error.message }),
  ),
);
worker.on("error", (error) =>
  console.error(JSON.stringify({ level: "error", event: "worker_error", message: error.message })),
);
const shutdown = async () => {
  await worker.close();
  await repository.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
