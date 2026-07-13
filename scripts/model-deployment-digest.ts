import {
  createModelArenas,
  deploymentModelCatalog,
  modelDeploymentDigest,
  resolveArenaSeasonAnchor,
  resolveRankedPlayEnabled,
} from "../packages/core/src/index.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const profiles = deploymentModelCatalog({
  openAiEnabled: true,
  openRouterEnabled:
    Boolean(process.env.OPENROUTER_API_KEY) || process.env.OPENROUTER_MODELS_ENABLED === "true",
});
const arenas = createModelArenas({
  profiles,
  now: resolveArenaSeasonAnchor(required("ARENA_SEASON_ANCHOR")),
  sandboxImageDigest: required("SANDBOX_IMAGE_DIGEST"),
  rankedTerra: resolveRankedPlayEnabled({
    enabled: process.env.RANKED_PLAY_ENABLED,
    isolationAttestation: process.env.RANKED_ISOLATION_ATTESTATION,
  }),
});

process.stdout.write(`${modelDeploymentDigest(profiles, arenas)}\n`);
