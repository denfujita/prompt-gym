import type { AttemptResult, Challenge, ChallengeSlug, LeaderboardEntry, Replay, RunEvent } from "./types";

export const challenges: Challenge[] = [
  {
    id: "challenge_signal_vault_v1",
    slug: "signal-vault",
    name: "Signal Vault",
    category: "Hidden-rule control room",
    brief:
      "Guide the model through three locked chambers. Buttons, gates, and colors obey rules it must discover by acting.",
    objective: "Reach WIN in all three chambers before the action budget runs out.",
    accent: "volt",
    symbol: "◇",
    difficulty: "Hard",
    parTokens: 3_200,
    cheapestTokens: 1_907,
    playersToday: 1_284,
    energyCost: 1,
    timeLimitMinutes: 10,
    actionLimit: 24,
  },
  {
    id: "challenge_gremlin_v1",
    slug: "clone-the-gremlin",
    name: "Clone the Gremlin",
    category: "Black-box code mystery",
    brief:
      "An undocumented command-line gremlin transforms inputs in peculiar ways. Coach the model to probe it, infer the rules, and build a perfect clone.",
    objective: "Match every hidden behavior test with no more than 18 oracle probes.",
    accent: "coral",
    symbol: "✦",
    difficulty: "Very hard",
    parTokens: 5_400,
    cheapestTokens: 3_611,
    playersToday: 892,
    energyCost: 1,
    timeLimitMinutes: 10,
    actionLimit: 18,
  },
  {
    id: "challenge_race_v1",
    slug: "rigged-race",
    name: "Rigged Race",
    category: "Data forensics",
    brief:
      "A race result looks obvious. It is not. Coach the model through messy telemetry, aliases, drift, and planted clues to expose what really happened.",
    objective: "Name the true winner, the cheater, their advantage, and exact evidence IDs.",
    accent: "sky",
    symbol: "◎",
    difficulty: "Hard",
    parTokens: 4_100,
    cheapestTokens: 2_489,
    playersToday: 1_041,
    energyCost: 1,
    timeLimitMinutes: 10,
    actionLimit: 20,
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
      body: "The model can see Chamber 1 and use six control actions.",
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
        title: "I’ll test one variable at a time",
        body: "I see a cyan diamond, an amber gate, and three controls. I’ll probe the symbols before committing to a route.",
        tokenDelta: 438,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Pressed ◇ control",
        body: "The amber gate opened; the cyan diamond rotated.",
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
        title: "The tones encode order",
        body: "The visual symbols are state, while the tones are the safe traversal order. I’ll repeat the pattern on the gate controls.",
        tokenDelta: 524,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Executed low · high · low",
        body: "Chamber 1 unlocked. Chambers 2 and 3 share the same rule with shifted symbols.",
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
        title: "I can finish without another probe",
        body: "Chamber 3 is a rotation of the same mapping. Applying the inverse sequence now.",
        tokenDelta: 486,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Applied inverse sequence",
        body: "All three chamber indicators turned green.",
        tokenDelta: 174,
      },
      {
        type: "verifier.result",
        actor: "verifier",
        title: "Vault opened",
        body: "Exact verifier passed: 3/3 chambers in 11 actions.",
        tokenDelta: 226,
      },
    ],
  ],
  "clone-the-gremlin": [
    [
      {
        type: "model.message",
        actor: "model",
        title: "I’ll map input classes",
        body: "I’ll spend probes across empty, numeric, repeated, Unicode, and delimiter-heavy inputs rather than guessing from one example.",
        tokenDelta: 612,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Ran 6 oracle probes",
        body: "The gremlin groups alternating runs, but its checksum changes at Unicode boundaries.",
        detail: "oracle.run_batch({ cases: 6 })",
        tokenDelta: 391,
      },
      {
        type: "artifact.change",
        actor: "tool",
        title: "Created clone.ts",
        body: "Added a first-pass parser and run encoder.",
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
        title: "The failures reveal two branches",
        body: "I’ll probe only the boundary cases, then replace the checksum with code-point arithmetic.",
        tokenDelta: 689,
      },
      {
        type: "artifact.change",
        actor: "tool",
        title: "Patched clone.ts",
        body: "Handled escaped separators and terminal sentinel behavior.",
        tokenDelta: 616,
      },
    ],
    [
      {
        type: "model.message",
        actor: "model",
        title: "Submitting the behavioral clone",
        body: "The remaining probe budget is better preserved; all inferred partitions are now covered.",
        tokenDelta: 574,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Submitted clone.ts",
        body: "Private verifier started in a separate sandbox.",
        tokenDelta: 242,
      },
      {
        type: "verifier.result",
        actor: "verifier",
        title: "Perfect clone",
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
        title: "I’ll reconcile identities first",
        body: "The leaderboard is downstream of the sensor data. I’ll map aliases before comparing corrected split times.",
        tokenDelta: 508,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Queried racer aliases",
        body: "Racer C7 and CHIP-03 resolve to the same transponder owner.",
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
        title: "The obvious winner is a measurement artifact",
        body: "After drift correction, Nova beats Moss. But racer C7 has impossible acceleration near evidence marker E-17.",
        tokenDelta: 646,
      },
      {
        type: "tool.action",
        actor: "tool",
        title: "Cross-checked pit logs",
        body: "E-17 and E-22 confirm a transponder relay during the yellow flag.",
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
        title: "Submitting the causal account",
        body: "I’ll use canonical racer IDs and only evidence that survives the counterfactual correction.",
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
        body: "All identities, evidence IDs, and numeric tolerances passed.",
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
    output: 604,
    reasoning: 752,
    total: 2_843,
    actualCostUsd: 0.043,
  },
  verifierMessage: "Exact verifier passed: 3/3 chambers reached WIN in 11 actions.",
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
