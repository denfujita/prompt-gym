import type { AttemptState, AttemptStatus } from "@prompt-gym/contracts";
import { PromptGymError } from "./errors.js";

const ALLOWED: Record<AttemptStatus, readonly AttemptStatus[]> = {
  created: ["ready", "cancelled", "failed", "expired"],
  ready: ["running", "cancelled", "expired", "budget_exhausted"],
  running: ["awaiting_player", "solved", "failed", "cancelled", "expired", "budget_exhausted"],
  awaiting_player: ["running", "cancelled", "expired", "budget_exhausted"],
  solved: [],
  failed: [],
  cancelled: [],
  expired: [],
  budget_exhausted: [],
};

export function transitionAttempt(attempt: AttemptState, next: AttemptStatus, now: Date): AttemptState {
  if (!ALLOWED[attempt.status].includes(next)) {
    throw new PromptGymError("CONFLICT", `Cannot transition attempt from ${attempt.status} to ${next}`, 409);
  }
  return {
    ...attempt,
    status: next,
    ...(new Set<AttemptStatus>(["solved", "failed", "cancelled", "expired", "budget_exhausted"]).has(next)
      ? { completedAt: now.toISOString() }
      : {}),
  };
}

export function isTerminalStatus(status: AttemptStatus): boolean {
  return ["solved", "failed", "cancelled", "expired", "budget_exhausted"].includes(status);
}
