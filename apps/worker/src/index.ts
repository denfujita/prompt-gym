import { Worker, type ConnectionOptions } from "bullmq";
import {
  HttpChallengeServiceClient,
  assertModelDeploymentDigest,
  ModelProviderRouter,
  OpenAIResponsesProvider,
  OpenRouterChatProvider,
  PromptGymService,
  RunEngine,
  RunEventHub,
  createModelArenas,
  defaultModelArena,
  deploymentModelCatalog,
  resolveArenaSeasonAnchor,
  resolveRankedPlayEnabled,
  type ModelProvider,
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
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
if (process.env.NODE_ENV === "production" && openRouterApiKey) {
  const parsed = new URL(openRouterBaseUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "openrouter.ai" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("OPENROUTER_BASE_URL must use the credential-free HTTPS openrouter.ai origin");
  }
}
const sandboxImageDigest = required("SANDBOX_IMAGE_DIGEST");
if (!/^sha256:[a-f0-9]{64}$/u.test(sandboxImageDigest))
  throw new Error("SANDBOX_IMAGE_DIGEST must be a pinned sha256 digest");
const challengeService = new HttpChallengeServiceClient(challengeServiceUrl, challengeServiceToken);
const deployableProfiles = deploymentModelCatalog({
  openAiEnabled: true,
  openRouterEnabled: Boolean(openRouterApiKey),
});
const arenas = createModelArenas({
  profiles: deployableProfiles,
  now: resolveArenaSeasonAnchor(required("ARENA_SEASON_ANCHOR")),
  sandboxImageDigest,
  rankedTerra: resolveRankedPlayEnabled({
    enabled: process.env.RANKED_PLAY_ENABLED,
    isolationAttestation: process.env.RANKED_ISOLATION_ATTESTATION,
  }),
});
const modelProfiles = deployableProfiles.map((profile) => ({
  ...profile,
  ranked: arenas.find((candidate) => candidate.modelAlias === profile.id)?.ranked ?? false,
}));
assertModelDeploymentDigest(required("MODEL_DEPLOYMENT_DIGEST"), modelProfiles, arenas);
const arena = defaultModelArena(arenas);
const challenges = await challengeService.listChallenges();
const repository = new PostgresPromptGymRepository({ databaseUrl, arenas, challenges });
await repository.initialize();
const service = new PromptGymService(
  repository,
  challengeService,
  arena,
  new RunEventHub(),
  required("INSTANCE_ASSIGNMENT_SECRET"),
  required("PUBLIC_HANDLE_SECRET"),
  undefined,
  { modelProfiles, arenas },
);
const providers = new Map<string, ModelProvider>();
for (const modelArena of arenas) {
  const profile = modelProfiles.find((candidate) => candidate.id === modelArena.modelAlias);
  if (!profile?.providerModelId) continue;
  providers.set(
    modelArena.id,
    profile.provider === "openai"
      ? new OpenAIResponsesProvider(openAiApiKey, profile.providerModelId)
      : new OpenRouterChatProvider({
          apiKey: openRouterApiKey!,
          profile,
          baseUrl: openRouterBaseUrl,
          appUrl: process.env.APP_ORIGIN?.split(",")[0]?.trim(),
          appName: process.env.OPENROUTER_APP_NAME ?? "Prompt Gym",
        }),
  );
}
const engine = new RunEngine(service, new ModelProviderRouter(providers), {
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
