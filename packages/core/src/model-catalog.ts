import type { ArenaConfig, ModelProfileV1 } from "@prompt-gym/contracts";
import { sha256, stableJson } from "./crypto.js";
import { createDefaultArena } from "./orchestrator.js";

export const DESIGN_ARENA_SNAPSHOT_DATE = "2026-07-13T00:00:00.000Z";
export const DEFAULT_MODEL_PROFILE_ID = "gpt-5.6-terra";
export const OPENROUTER_PRICE_VERSION = "openrouter-reported-2026-07-13";

export function resolveArenaSeasonAnchor(value: string | undefined, fallback = new Date()): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("ARENA_SEASON_ANCHOR must be an ISO timestamp");
  return parsed;
}

export function modelDeploymentDigest(
  profiles: readonly ModelProfileV1[],
  arenas: readonly ArenaConfig[],
): string {
  return sha256(stableJson({ profiles, arenas }));
}

export function assertModelDeploymentDigest(
  expected: string | undefined,
  profiles: readonly ModelProfileV1[],
  arenas: readonly ArenaConfig[],
): string {
  const actual = modelDeploymentDigest(profiles, arenas);
  if (expected && expected !== actual) {
    throw new Error(`MODEL_DEPLOYMENT_DIGEST mismatch; expected ${expected}, resolved ${actual}`);
  }
  return actual;
}

/**
 * Frozen nano-USD/token ceilings from the selected OpenRouter endpoint on the
 * snapshot date. Input sums prompt plus the highest cache-write rate. OpenRouter
 * also receives these as per-million `max_price` limits, so a rate above the
 * reviewed ceiling fails closed instead of consuming more subsidy.
 */
const OPENROUTER_PRICE_CEILINGS: Readonly<
  Record<string, { inputNanoUsdPerToken: number; outputNanoUsdPerToken: number }>
> = Object.freeze({
  "qwen/qwen3.6-plus": { inputNanoUsdPerToken: 732, outputNanoUsdPerToken: 1_950 },
  "qwen/qwen3.7-max": { inputNanoUsdPerToken: 2_813, outputNanoUsdPerToken: 3_750 },
  "qwen/qwen3.7-plus": { inputNanoUsdPerToken: 720, outputNanoUsdPerToken: 1_280 },
  "anthropic/claude-fable-5": { inputNanoUsdPerToken: 22_500, outputNanoUsdPerToken: 50_000 },
  "anthropic/claude-opus-4.6": { inputNanoUsdPerToken: 15_000, outputNanoUsdPerToken: 25_000 },
  "anthropic/claude-opus-4.7": { inputNanoUsdPerToken: 15_000, outputNanoUsdPerToken: 25_000 },
  "anthropic/claude-opus-4.8": { inputNanoUsdPerToken: 15_000, outputNanoUsdPerToken: 25_000 },
  "anthropic/claude-sonnet-4.5": { inputNanoUsdPerToken: 9_000, outputNanoUsdPerToken: 15_000 },
  "anthropic/claude-sonnet-4.6": { inputNanoUsdPerToken: 9_000, outputNanoUsdPerToken: 15_000 },
  "anthropic/claude-sonnet-5": { inputNanoUsdPerToken: 6_000, outputNanoUsdPerToken: 10_000 },
  "deepseek/deepseek-v4-flash": { inputNanoUsdPerToken: 77, outputNanoUsdPerToken: 154 },
  "deepseek/deepseek-v4-pro": { inputNanoUsdPerToken: 435, outputNanoUsdPerToken: 870 },
  "google/gemini-3.1-pro-preview": { inputNanoUsdPerToken: 1_188, outputNanoUsdPerToken: 6_000 },
  "google/gemini-3.5-flash": { inputNanoUsdPerToken: 792, outputNanoUsdPerToken: 4_500 },
  "inception/mercury-2": { inputNanoUsdPerToken: 250, outputNanoUsdPerToken: 750 },
  "minimax/minimax-m2.7": { inputNanoUsdPerToken: 240, outputNanoUsdPerToken: 960 },
  "minimax/minimax-m3": { inputNanoUsdPerToken: 300, outputNanoUsdPerToken: 1_200 },
  "moonshotai/kimi-k2.5": { inputNanoUsdPerToken: 400, outputNanoUsdPerToken: 1_900 },
  "moonshotai/kimi-k2.6": { inputNanoUsdPerToken: 700, outputNanoUsdPerToken: 3_400 },
  "moonshotai/kimi-k2.7-code": { inputNanoUsdPerToken: 719, outputNanoUsdPerToken: 3_490 },
  "nex-agi/nex-n2-pro": { inputNanoUsdPerToken: 250, outputNanoUsdPerToken: 1_000 },
  "nvidia/nemotron-3-ultra-550b-a55b": {
    inputNanoUsdPerToken: 600,
    outputNanoUsdPerToken: 3_600,
  },
  "openai/gpt-5.5": { inputNanoUsdPerToken: 2_500, outputNanoUsdPerToken: 15_000 },
  "openai/gpt-5.6-luna": { inputNanoUsdPerToken: 1_125, outputNanoUsdPerToken: 3_000 },
  "openai/gpt-5.6-sol": { inputNanoUsdPerToken: 5_625, outputNanoUsdPerToken: 15_000 },
  "openai/gpt-5.6-terra": { inputNanoUsdPerToken: 2_813, outputNanoUsdPerToken: 7_500 },
  "stepfun/step-3.7-flash": { inputNanoUsdPerToken: 200, outputNanoUsdPerToken: 1_150 },
  "tencent/hy3": { inputNanoUsdPerToken: 140, outputNanoUsdPerToken: 580 },
  "x-ai/grok-4.20": { inputNanoUsdPerToken: 1_250, outputNanoUsdPerToken: 2_500 },
  "x-ai/grok-4.3": { inputNanoUsdPerToken: 1_250, outputNanoUsdPerToken: 2_500 },
  "x-ai/grok-4.5": { inputNanoUsdPerToken: 2_000, outputNanoUsdPerToken: 6_000 },
  "xiaomi/mimo-v2.5": { inputNanoUsdPerToken: 140, outputNanoUsdPerToken: 280 },
  "xiaomi/mimo-v2.5-pro": { inputNanoUsdPerToken: 435, outputNanoUsdPerToken: 870 },
  "z-ai/glm-5-turbo": { inputNanoUsdPerToken: 1_200, outputNanoUsdPerToken: 4_000 },
  "z-ai/glm-5.1": { inputNanoUsdPerToken: 966, outputNanoUsdPerToken: 3_036 },
  "z-ai/glm-5.2": { inputNanoUsdPerToken: 943, outputNanoUsdPerToken: 2_962 },
  "z-ai/glm-5v-turbo": { inputNanoUsdPerToken: 1_200, outputNanoUsdPerToken: 4_000 },
});

const OPENROUTER_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  "qwen/qwen3.6-plus": "alibaba",
  "qwen/qwen3.7-max": "alibaba",
  "qwen/qwen3.7-plus": "alibaba",
  "anthropic/claude-fable-5": "amazon-bedrock/claude-on-aws",
  "anthropic/claude-opus-4.6": "amazon-bedrock/us-east-1",
  "anthropic/claude-opus-4.7": "amazon-bedrock/eu-west-1",
  "anthropic/claude-opus-4.8": "amazon-bedrock/eu-west-1",
  "anthropic/claude-sonnet-4.5": "amazon-bedrock",
  "anthropic/claude-sonnet-4.6": "amazon-bedrock/eu-west-1",
  "anthropic/claude-sonnet-5": "amazon-bedrock/claude-on-aws",
  "deepseek/deepseek-v4-flash": "streamlake/fp8",
  "deepseek/deepseek-v4-pro": "deepseek",
  "google/gemini-3.1-pro-preview": "google-ai-studio/flex",
  "google/gemini-3.5-flash": "google-ai-studio/flex",
  "inception/mercury-2": "inception",
  "minimax/minimax-m2.7": "mara",
  "minimax/minimax-m3": "deepinfra/bf16",
  "moonshotai/kimi-k2.5": "modelrun/fp4",
  "moonshotai/kimi-k2.6": "modelrun/fp4",
  "moonshotai/kimi-k2.7-code": "ambient/int4",
  "nex-agi/nex-n2-pro": "nex-agi/fp8",
  "nvidia/nemotron-3-ultra-550b-a55b": "together",
  "openai/gpt-5.5": "openai/flex",
  "openai/gpt-5.6-luna": "openai/flex",
  "openai/gpt-5.6-sol": "openai/flex",
  "openai/gpt-5.6-terra": "openai/flex",
  "stepfun/step-3.7-flash": "deepinfra",
  "tencent/hy3": "deepinfra/fp8",
  "x-ai/grok-4.20": "xai",
  "x-ai/grok-4.3": "xai",
  "x-ai/grok-4.5": "xai",
  "xiaomi/mimo-v2.5": "parasail/fp8",
  "xiaomi/mimo-v2.5-pro": "xiaomi/fp8",
  "z-ai/glm-5-turbo": "atlas-cloud/fp8",
  "z-ai/glm-5.1": "streamlake/fp8",
  "z-ai/glm-5.2": "streamlake/fp8",
  "z-ai/glm-5v-turbo": "z-ai/fp8",
});

type RoutedProfile = readonly [
  designArenaId: string,
  displayName: string,
  creator: string,
  providerModelId: string,
  reasoningMode?: "standard" | "thinking",
];

const routed = ([
  designArenaId,
  displayName,
  creator,
  providerModelId,
  reasoningMode = "standard",
]: RoutedProfile): ModelProfileV1 => {
  const openRouterPriceCeiling = OPENROUTER_PRICE_CEILINGS[providerModelId];
  if (!openRouterPriceCeiling) throw new Error(`Missing reviewed price ceiling for ${providerModelId}`);
  const providerEndpoint = OPENROUTER_ENDPOINTS[providerModelId];
  if (!providerEndpoint) throw new Error(`Missing reviewed provider endpoint for ${providerModelId}`);
  return {
    schemaVersion: "model-profile.v1",
    id: designArenaId,
    designArenaId,
    displayName,
    creator,
    provider: designArenaId === DEFAULT_MODEL_PROFILE_ID ? "openai" : "openrouter",
    providerModelId: designArenaId === DEFAULT_MODEL_PROFILE_ID ? "gpt-5.6-terra" : providerModelId,
    openRouterModelId: providerModelId,
    ...(designArenaId === DEFAULT_MODEL_PROFILE_ID ? {} : { providerEndpoint }),
    availability: "available",
    ranked: designArenaId === DEFAULT_MODEL_PROFILE_ID,
    reasoningMode,
    priceVersion: designArenaId === DEFAULT_MODEL_PROFILE_ID ? "terra-2026-07-12" : OPENROUTER_PRICE_VERSION,
    priceCeiling:
      designArenaId === DEFAULT_MODEL_PROFILE_ID
        ? { inputNanoUsdPerToken: 5_625, outputNanoUsdPerToken: 15_000 }
        : openRouterPriceCeiling,
    sourceSyncedAt: DESIGN_ARENA_SNAPSHOT_DATE,
  };
};

const ROUTED_PROFILES: RoutedProfile[] = [
  ["qwen3.6-plus", "Qwen3.6 Plus", "Alibaba", "qwen/qwen3.6-plus"],
  ["qwen3.7-max", "Qwen3.7 Max", "Alibaba", "qwen/qwen3.7-max"],
  ["qwen3.7-plus", "Qwen3.7 Plus", "Alibaba", "qwen/qwen3.7-plus"],
  ["claude-fable-5", "Claude Fable 5", "Anthropic", "anthropic/claude-fable-5"],
  ["claude-opus-4-6", "Claude Opus 4.6", "Anthropic", "anthropic/claude-opus-4.6"],
  [
    "claude-opus-4-6-thinking",
    "Claude Opus 4.6 (Thinking)",
    "Anthropic",
    "anthropic/claude-opus-4.6",
    "thinking",
  ],
  ["claude-opus-4-7-thinking", "Claude Opus 4.7", "Anthropic", "anthropic/claude-opus-4.7", "thinking"],
  ["claude-opus-4-8", "Claude Opus 4.8", "Anthropic", "anthropic/claude-opus-4.8"],
  ["claude-sonnet-4-5", "Claude Sonnet 4.5", "Anthropic", "anthropic/claude-sonnet-4.5"],
  [
    "claude-sonnet-4-5-thinking",
    "Claude Sonnet 4.5 (Thinking)",
    "Anthropic",
    "anthropic/claude-sonnet-4.5",
    "thinking",
  ],
  ["claude-sonnet-4-6", "Claude Sonnet 4.6", "Anthropic", "anthropic/claude-sonnet-4.6"],
  ["claude-sonnet-5", "Claude Sonnet 5", "Anthropic", "anthropic/claude-sonnet-5"],
  ["deepseek-v4-flash", "DeepSeek-V4-Flash", "DeepSeek", "deepseek/deepseek-v4-flash"],
  ["deepseek-v4-pro", "DeepSeek-V4-Pro", "DeepSeek", "deepseek/deepseek-v4-pro"],
  ["gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", "Google", "google/gemini-3.1-pro-preview"],
  ["gemini-3.5-flash", "Gemini 3.5 Flash", "Google", "google/gemini-3.5-flash"],
  ["mercury-2", "Mercury 2", "Inception", "inception/mercury-2"],
  ["deepocto", "MiniMax M2.7", "MiniMax", "minimax/minimax-m2.7"],
  ["minimax-m3", "MiniMax M3", "MiniMax", "minimax/minimax-m3"],
  ["kimi-k2.5", "Kimi K2.5 (Thinking)", "Moonshot AI", "moonshotai/kimi-k2.5", "thinking"],
  ["kimi-k2.6", "Kimi K2.6", "Moonshot AI", "moonshotai/kimi-k2.6"],
  ["kimi-k2.7-code", "Kimi K2.7 Code", "Moonshot AI", "moonshotai/kimi-k2.7-code"],
  ["nex-n2-pro", "Nex N2 Pro", "Nex AGI", "nex-agi/nex-n2-pro"],
  ["nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra", "NVIDIA", "nvidia/nemotron-3-ultra-550b-a55b"],
  ["gpt-5.5", "GPT-5.5", "OpenAI", "openai/gpt-5.5"],
  ["gpt-5.6-luna", "GPT-5.6 Luna", "OpenAI", "openai/gpt-5.6-luna"],
  ["gpt-5.6-sol", "GPT-5.6 Sol", "OpenAI", "openai/gpt-5.6-sol"],
  ["gpt-5.6-terra", "GPT-5.6 Terra", "OpenAI", "openai/gpt-5.6-terra"],
  ["step-3.7-flash", "Step 3.7 Flash", "StepFun", "stepfun/step-3.7-flash"],
  ["hy3", "Hy3", "Tencent", "tencent/hy3"],
  ["grok-4-20-beta-non-reasoning", "Grok 4.20 Beta", "xAI", "x-ai/grok-4.20"],
  ["grok-4-20-beta-reasoning", "Grok 4.20 Beta (Reasoning)", "xAI", "x-ai/grok-4.20", "thinking"],
  ["grok-4.3", "Grok 4.3", "xAI", "x-ai/grok-4.3"],
  ["yoda", "Grok 4.5", "xAI", "x-ai/grok-4.5"],
  ["mimo-v2.5", "MiMo-V2.5", "Xiaomi", "xiaomi/mimo-v2.5"],
  ["mimo-v2.5-pro", "MiMo-V2.5-Pro", "Xiaomi", "xiaomi/mimo-v2.5-pro"],
  ["glm-5-turbo", "GLM 5 Turbo", "Zhipu AI", "z-ai/glm-5-turbo"],
  ["coconut", "GLM 5.1", "Zhipu AI", "z-ai/glm-5.1"],
  ["glm-5.2", "GLM 5.2", "Zhipu AI", "z-ai/glm-5.2"],
  ["glm-5v-turbo", "GLM 5V Turbo", "Zhipu AI", "z-ai/glm-5v-turbo"],
];

const AGI_SWIFT: ModelProfileV1 = {
  schemaVersion: "model-profile.v1",
  id: "agi-01-swift",
  designArenaId: "agi-01-swift",
  displayName: "AGI-01 Swift",
  creator: "LucidQuery",
  provider: "openrouter",
  availability: "needs-route",
  ranked: false,
  reasoningMode: "standard",
  priceVersion: "unrouted",
  sourceSyncedAt: DESIGN_ARENA_SNAPSHOT_DATE,
};

/** Frozen, reviewed bootstrap snapshot; never mutate this array at runtime. */
export const DESIGN_ARENA_MODEL_CATALOG: readonly ModelProfileV1[] = Object.freeze([
  ...ROUTED_PROFILES.map(routed),
  AGI_SWIFT,
]);

export function deploymentModelCatalog(input: {
  openAiEnabled: boolean;
  openRouterEnabled: boolean;
}): ModelProfileV1[] {
  return DESIGN_ARENA_MODEL_CATALOG.map((profile) => ({
    ...profile,
    availability:
      profile.availability === "available" &&
      ((profile.provider === "openai" && input.openAiEnabled) ||
        (profile.provider === "openrouter" && input.openRouterEnabled))
        ? "available"
        : "needs-route",
    // No aggregator route is ranked in this release, regardless of catalog input.
    ranked: profile.provider === "openai" && profile.ranked && input.openAiEnabled,
  }));
}

export function createModelArenas(input: {
  profiles: readonly ModelProfileV1[];
  now?: Date;
  sandboxImageDigest?: string;
  rankedTerra?: boolean;
}): ArenaConfig[] {
  const now = input.now ?? new Date();
  return input.profiles.flatMap((profile) => {
    if (profile.availability !== "available" || !profile.providerModelId) return [];
    const base = createDefaultArena(
      now,
      profile.providerModelId,
      input.sandboxImageDigest,
      Boolean(input.rankedTerra && profile.id === DEFAULT_MODEL_PROFILE_ID && profile.ranked),
    );
    const reasoningEffort =
      profile.id === DEFAULT_MODEL_PROFILE_ID || profile.reasoningMode === "thinking" ? "medium" : "default";
    const config = {
      seasonId: base.seasonId,
      profile,
      resolvedModel: profile.providerModelId,
      reasoningEffort,
      responseVerbosity: base.responseVerbosity,
      sandboxImageDigest: base.sandboxImageDigest,
      ranked: Boolean(input.rankedTerra && profile.id === DEFAULT_MODEL_PROFILE_ID && profile.ranked),
      startsAt: base.startsAt,
      endsAt: base.endsAt,
    };
    return [
      {
        ...base,
        id: `${base.seasonId}:${profile.id}:${sha256(stableJson(config)).slice(0, 20)}`,
        modelAlias: profile.id,
        resolvedModel: profile.providerModelId,
        reasoningEffort,
        priceVersion: profile.priceVersion,
        ranked: Boolean(input.rankedTerra && profile.id === DEFAULT_MODEL_PROFILE_ID && profile.ranked),
      },
    ];
  });
}

export function defaultModelArena(arenas: readonly ArenaConfig[]): ArenaConfig {
  const arena = arenas.find((candidate) => candidate.modelAlias === DEFAULT_MODEL_PROFILE_ID);
  if (!arena) throw new Error("The default GPT-5.6 Terra model arena is not enabled");
  return arena;
}
