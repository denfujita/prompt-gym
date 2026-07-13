import type { Attempt, RunEvent } from "./types";

export interface ArenaRunState {
  turnsUsed: number;
  competitionTokens: number;
  assisted: boolean;
  solved: boolean;
  running: boolean;
  thinking: boolean;
}

/** Rebuilds client controls from the server snapshot plus its ordered event log. */
export function deriveArenaRunState(attempt: Attempt, events: readonly RunEvent[]): ArenaRunState {
  let turnsUsed = attempt.turnsUsed;
  let competitionTokens = attempt.competitionTokens;
  let assisted = attempt.assisted;
  let solved = attempt.status === "solved";
  let running = attempt.status === "running" || attempt.status === "thinking";
  let thinking = running;

  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.competitionTokens !== undefined)
      competitionTokens = Math.max(competitionTokens, event.competitionTokens);
    if (event.turnOrdinal !== undefined) turnsUsed = Math.max(turnsUsed, event.turnOrdinal);
    if (event.assisted === true || event.sourceType === "hint.unlocked") assisted = true;
    if (event.verifierPassed === true || event.sourceType === "attempt.completed") solved = true;

    switch (event.sourceType) {
      case "turn.queued":
      case "turn.started":
        running = true;
        break;
      case "model.thinking":
        if (event.thinkingActive === true) running = true;
        if (event.thinkingActive !== undefined) thinking = event.thinkingActive;
        break;
      case "turn.completed":
      case "turn.cancelled":
      case "turn.failed":
      case "attempt.cancelled":
      case "attempt.failed":
      case "attempt.budget_exhausted":
        running = false;
        thinking = false;
        break;
    }
  }

  if (solved) {
    running = false;
    thinking = false;
  }
  return { turnsUsed, competitionTokens, assisted, solved, running, thinking };
}
