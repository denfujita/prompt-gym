import type {
  AttemptResult,
  Challenge,
  ChallengeSlug,
  LeaderboardEntry,
  ModelCatalogV1,
  ModelProfileV1,
  Replay,
  RunEvent,
} from "./types";

type DemoModelRow = readonly [
  id: string,
  displayName: string,
  creator: string,
  providerModelId?: string,
  reasoningMode?: "standard" | "thinking",
];

// UI-only mirror. The server-owned, route/price/endpoint-attested catalog is
// authoritative for live attempts.
const DEMO_MODEL_ROWS: readonly DemoModelRow[] = [
  ["gpt-5.6-terra", "GPT-5.6 Terra", "OpenAI", "gpt-5.6-terra"],
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
  ["agi-01-swift", "AGI-01 Swift", "LucidQuery"],
];

const demoModelProfile = ([
  id,
  displayName,
  creator,
  providerModelId,
  reasoningMode = "standard",
]: DemoModelRow): ModelProfileV1 => {
  const direct = id === "gpt-5.6-terra";
  return {
    schemaVersion: "model-profile.v1",
    id,
    designArenaId: id,
    displayName,
    creator,
    provider: direct ? "openai" : "openrouter",
    ...(providerModelId ? { providerModelId } : {}),
    ...(providerModelId ? { openRouterModelId: direct ? "openai/gpt-5.6-terra" : providerModelId } : {}),
    availability: providerModelId ? "available" : "needs-route",
    ranked: direct,
    reasoningMode,
    priceVersion: direct
      ? "terra-2026-07-12"
      : providerModelId
        ? "openrouter-reported-2026-07-13"
        : "unrouted",
    sourceSyncedAt: "2026-07-13T00:00:00.000Z",
  };
};

export const demoModelCatalog: ModelCatalogV1 = {
  defaultModelId: "gpt-5.6-terra",
  models: DEMO_MODEL_ROWS.map(demoModelProfile),
};

export const challenges: Challenge[] = [
  {
    id: "challenge_signal_vault_v1",
    slug: "signal-vault",
    playMode: "puzzle",
    name: "Crack the Signal Vault",
    category: "Hidden-rule mystery",
    brief:
      "Three chambers, six controls, and no instructions. Help the AI learn the rules before it runs out of moves.",
    objective: "Open all 3 chambers within 24 actions.",
    accent: "volt",
    symbol: "◇",
    difficulty: "Hard",
    parTokens: 3_200,
    cheapestTokens: 1_907,
    playersToday: 1_284,
    energyCost: 1,
    timeLimitMinutes: 10,
    actionLimit: 24,
    actionBudgetLabel: "24 control actions",
  },
  {
    id: "challenge_gremlin_v1",
    slug: "clone-the-gremlin",
    playMode: "build",
    name: "Copy the Gremlin",
    category: "Behavior-copy build",
    brief: "A mischievous text machine has no manual. Help the AI test its quirks and build a perfect copy.",
    objective: "Pass all 42 hidden cases using at most 18 probes.",
    accent: "coral",
    symbol: "✦",
    difficulty: "Very hard",
    parTokens: 5_400,
    cheapestTokens: 3_611,
    playersToday: 892,
    energyCost: 1,
    timeLimitMinutes: 10,
    actionLimit: 18,
    actionBudgetLabel: "18 oracle probes",
  },
  {
    id: "challenge_race_v1",
    slug: "rigged-race",
    playMode: "puzzle",
    name: "Who Rigged the Race?",
    category: "Evidence mystery",
    brief:
      "The winner may not have won, and one sensor looks suspicious. Follow the evidence with the AI and find out what happened.",
    objective: "Name the real winner, the cheater, their advantage, and 2 proof IDs.",
    accent: "sky",
    symbol: "◎",
    difficulty: "Hard",
    parTokens: 4_100,
    cheapestTokens: 2_489,
    playersToday: 1_041,
    energyCost: 1,
    timeLimitMinutes: 10,
    actionLimit: 20,
    actionBudgetLabel: "20 evidence actions",
  },
];

export function getChallenge(slug: string): Challenge {
  return challenges.find((challenge) => challenge.slug === slug) ?? challenges[0]!;
}

const now = new Date("2026-07-12T17:40:00.000Z").toISOString();

export const initialArenaEvents: Record<ChallengeSlug, RunEvent[]> = {
  "signal-vault": [
    {
      id: "sv-0",
      sequence: 0,
      type: "model.status",
      actor: "system",
      title: "Chamber ready",
      body: "The AI can see Chamber 1 and has six controls to try.",
      createdAt: now,
    },
  ],
  "clone-the-gremlin": [
    {
      id: "cg-0",
      sequence: 0,
      type: "model.status",
      actor: "system",
      title: "Workbench ready",
      body: "18 oracle probes remain. The replacement file is empty.",
      createdAt: now,
    },
  ],
  "rigged-race": [
    {
      id: "rr-0",
      sequence: 0,
      type: "model.status",
      actor: "system",
      title: "Evidence loaded",
      body: "Telemetry, timing logs, and racer aliases are ready to inspect.",
      createdAt: now,
    },
  ],
};

type DemoTurn = Omit<RunEvent, "id" | "sequence" | "createdAt">;

export const demoTurns: Record<ChallengeSlug, DemoTurn[][]> = {
  "signal-vault": [
    [
      {
        type: "model.message",
        actor: "model",
        title: "I’ll change one thing at a time",
        body: "There’s a cyan diamond, an amber gate, and three controls. I’ll test the symbols before choosing a route.",
        tokenDelta: 438,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Pressed ◇ control",
        body: "The amber gate opened, and the cyan diamond rotated.",
        detail: "action.press({ control: 'diamond' })",
        tokenDelta: 96,
      },
      {
        type: "tool.result",
        actor: "tool",
        title: "State changed",
        body: "A tone sequence played: low, high, low.",
        tokenDelta: 380,
      },
    ],
    [
      {
        type: "model.message",
        actor: "model",
        title: "The tones look like an order",
        body: "The symbols show state; the tones seem to give the safe order. I’ll try that pattern on the gate controls.",
        tokenDelta: 524,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Executed low · high · low",
        body: "Chamber 1 opened. The other two seem to use the same rule with shifted symbols.",
        tokenDelta: 208,
      },
      {
        type: "tool.result",
        actor: "tool",
        title: "2 chambers cleared",
        body: "Action budget: 16 of 24 remaining.",
        tokenDelta: 311,
      },
    ],
    [
      {
        type: "model.message",
        actor: "model",
        title: "No need for another probe",
        body: "Chamber 3 rotates the same mapping. I’ll apply the inverse sequence now.",
        tokenDelta: 486,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Applied inverse sequence",
        body: "All three chamber lights turned green.",
        tokenDelta: 174,
      },
      {
        type: "verifier.result",
        actor: "verifier",
        title: "Vault opened",
        body: "Passed: all 3 chambers opened in 11 actions.",
        tokenDelta: 226,
      },
    ],
  ],
  "clone-the-gremlin": [
    [
      {
        type: "model.message",
        actor: "model",
        title: "I’ll test different kinds of input",
        body: "I’ll spread the probes across empty, numeric, repeated, Unicode, and delimiter-heavy inputs instead of guessing from one example.",
        tokenDelta: 612,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Ran 6 oracle probes",
        body: "The gremlin groups alternating runs, but Unicode changes its checksum behavior.",
        detail: "oracle.run_batch({ cases: 6 })",
        tokenDelta: 391,
      },
      {
        type: "artifact.change",
        actor: "tool",
        title: "Created clone.ts",
        body: "Added a first parser and run encoder.",
        tokenDelta: 537,
      },
    ],
    [
      {
        type: "tool.result",
        actor: "tool",
        title: "Public tests: 8/11",
        body: "Failures cluster around escaped delimiters and empty terminal runs.",
        tokenDelta: 198,
      },
      {
        type: "model.message",
        actor: "model",
        title: "The failures point to two edge cases",
        body: "I’ll probe those boundaries, then switch the checksum to code-point arithmetic.",
        tokenDelta: 689,
      },
      {
        type: "artifact.change",
        actor: "tool",
        title: "Patched clone.ts",
        body: "Handled escaped separators and the final sentinel case.",
        tokenDelta: 616,
      },
    ],
    [
      {
        type: "model.message",
        actor: "model",
        title: "The clone is ready to submit",
        body: "The main behavior groups are covered. Another probe would probably be wasted.",
        tokenDelta: 574,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Submitted clone.ts",
        body: "The hidden checks started in a separate sandbox.",
        tokenDelta: 242,
      },
      {
        type: "verifier.result",
        actor: "verifier",
        title: "Perfect match",
        body: "42/42 private behaviors matched. 11/18 oracle probes used.",
        tokenDelta: 367,
      },
    ],
  ],
  "rigged-race": [
    [
      {
        type: "model.message",
        actor: "model",
        title: "I’ll match the racer names first",
        body: "The standings depend on the sensor data, so I’ll map the aliases before correcting split times.",
        tokenDelta: 508,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Queried racer aliases",
        body: "C7 and CHIP-03 belong to the same transponder owner.",
        detail: "python: join(alias_map, transponders)",
        tokenDelta: 284,
      },
      {
        type: "tool.result",
        actor: "tool",
        title: "Drift detected",
        body: "Sensor S4 gains 0.31 seconds per checkpoint after lap 2.",
        tokenDelta: 273,
      },
    ],
    [
      {
        type: "model.message",
        actor: "model",
        title: "The posted winner is a sensor mistake",
        body: "After correcting the drift, Nova beats Moss. But C7 shows impossible acceleration near E-17.",
        tokenDelta: 646,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Cross-checked pit logs",
        body: "E-17 and E-22 confirm that someone relayed a transponder during the yellow flag.",
        tokenDelta: 296,
      },
      {
        type: "tool.result",
        actor: "tool",
        title: "Advantage estimated",
        body: "Relay advantage: 2.74 seconds ± 0.06.",
        tokenDelta: 244,
      },
    ],
    [
      {
        type: "model.message",
        actor: "model",
        title: "I have the answer",
        body: "I’ll submit the official racer IDs and only the evidence that still holds after correction.",
        tokenDelta: 477,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Submitted findings.json",
        body: "Winner: Nova · Cheater: C7 · Advantage: 2.74 · Evidence: E-17, E-22.",
        tokenDelta: 191,
      },
      {
        type: "verifier.result",
        actor: "verifier",
        title: "Mystery solved",
        body: "The racer IDs and evidence matched. The advantage was within tolerance.",
        tokenDelta: 199,
      },
    ],
  ],
};

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, handle: "tiny_prompt", tokens: 1_907, turns: 2, challengeSlug: "signal-vault", assisted: false },
  {
    rank: 2,
    handle: "loopwhisperer",
    tokens: 2_014,
    turns: 3,
    challengeSlug: "signal-vault",
    assisted: false,
  },
  { rank: 3, handle: "token_tamer", tokens: 2_121, turns: 2, challengeSlug: "signal-vault", assisted: false },
  { rank: 4, handle: "quietcoach", tokens: 2_205, turns: 3, challengeSlug: "signal-vault", assisted: false },
  {
    rank: 5,
    handle: "promptmancer",
    tokens: 2_366,
    turns: 4,
    challengeSlug: "signal-vault",
    assisted: false,
  },
  {
    rank: 42,
    handle: "you",
    tokens: 2_843,
    turns: 3,
    challengeSlug: "signal-vault",
    assisted: false,
    isCurrentUser: true,
  },
];

export const demoResult: AttemptResult = {
  attemptId: "demo-signal-vault",
  challengeSlug: "signal-vault",
  ranked: false,
  solved: true,
  tokens: 2_843,
  cheapestTokens: 1_907,
  rank: 42,
  playerCount: 1_284,
  turns: 3,
  assisted: false,
  usage: {
    input: 1_487,
    cachedInput: 822,
    output: 1_356,
    reasoning: 752,
    total: 2_843,
    actualCostUsd: 0.043,
  },
  verifierMessage: "All 3 chambers reached WIN in 11 actions.",
};

const replayEvents = demoTurns["signal-vault"].flat().map((event, index) => ({
  ...event,
  id: `replay-${index}`,
  sequence: index + 1,
  createdAt: new Date(Date.parse(now) + index * 18_000).toISOString(),
}));

export const demoReplay: Replay = {
  id: "tiny-prompt-signal-vault",
  handle: "tiny_prompt",
  challengeSlug: "signal-vault",
  tokens: 1_907,
  turns: 2,
  events: replayEvents,
  publishedAt: "2026-07-11T19:00:00.000Z",
};
