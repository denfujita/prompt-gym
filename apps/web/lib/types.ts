export type ChallengeSlug = "signal-vault" | "clone-the-gremlin" | "rigged-race";

export type ChallengeAccent = "volt" | "coral" | "sky";

export interface Challenge {
  id: string;
  slug: ChallengeSlug;
  playMode: "puzzle" | "build";
  name: string;
  category: string;
  brief: string;
  objective: string;
  accent: ChallengeAccent;
  symbol: string;
  difficulty: "Hard" | "Very hard";
  parTokens: number;
  cheapestTokens: number | null;
  playersToday: number | null;
  energyCost: number;
  timeLimitMinutes: number;
  actionLimit: number;
  actionBudgetLabel: string;
}

export type AttemptStatus = "ready" | "running" | "thinking" | "solved" | "failed" | "cancelled";

export interface Attempt {
  id: string;
  challengeSlug: ChallengeSlug;
  status: AttemptStatus;
  mode: "ranked" | "practice";
  competitionTokens: number;
  turnsUsed: number;
  maxTurns: number;
  assisted: boolean;
  seedCommitment?: string;
  createdAt: string;
}

export type RunEventType =
  | "player.prompt"
  | "model.status"
  | "model.message"
  | "tool.action"
  | "tool.result"
  | "artifact.change"
  | "verifier.result"
  | "attempt.interrupted";

export interface RunEvent {
  id: string;
  sequence: number;
  type: RunEventType;
  actor: "player" | "model" | "tool" | "verifier" | "system";
  title: string;
  body: string;
  detail?: string;
  tokenDelta?: number;
  /** Original server event semantics used to resume an arena without guessing from display copy. */
  sourceType?: string;
  turnOrdinal?: number;
  thinkingActive?: boolean;
  competitionTokens?: number;
  assisted?: boolean;
  verifierPassed?: boolean;
  /** Authoritative public task state carried by task.state events. */
  taskState?: Record<string, unknown>;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  tokens: number;
  turns: number;
  challengeSlug: ChallengeSlug;
  assisted: boolean;
  isCurrentUser?: boolean;
}

export interface Replay {
  id: string;
  handle: string;
  challengeSlug: ChallengeSlug;
  tokens: number;
  turns: number;
  events: RunEvent[];
  publishedAt: string;
}

export interface UsageBreakdown {
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
  total: number;
  actualCostUsd: number;
}

export interface AttemptResult {
  attemptId: string;
  challengeSlug: ChallengeSlug;
  ranked: boolean;
  solved: boolean;
  tokens: number;
  cheapestTokens?: number;
  rank?: number;
  playerCount: number;
  turns: number;
  assisted: boolean;
  usage: UsageBreakdown;
  verifierMessage: string;
}

export interface ConsentPreferences {
  operational: true;
  research: boolean;
  publicReplay: boolean;
  version: string;
}
