import { describe, expect, it } from "vitest";

import { deriveArenaRunState } from "./arena-state";
import type { Attempt, RunEvent } from "./types";

const attempt: Attempt = {
  id: "attempt-1",
  challengeSlug: "signal-vault",
  status: "ready",
  mode: "ranked",
  competitionTokens: 900,
  turnsUsed: 2,
  maxTurns: 6,
  assisted: false,
  createdAt: "2026-07-13T00:00:00.000Z",
};

const event = (sequence: number, sourceType: string, extra: Partial<RunEvent> = {}): RunEvent => ({
  id: `event-${sequence}`,
  sequence,
  sourceType,
  type: "model.status",
  actor: "system",
  title: sourceType,
  body: "Activity recorded.",
  createdAt: `2026-07-13T00:00:0${sequence}.000Z`,
  ...extra,
});

describe("arena resume state", () => {
  it("locks a resumed queued/running turn and restores counters and assistance", () => {
    const state = deriveArenaRunState(attempt, [
      event(1, "usage.recorded", { competitionTokens: 1_200 }),
      event(2, "hint.unlocked", { assisted: true }),
      event(3, "turn.queued", { turnOrdinal: 3 }),
      event(4, "turn.started"),
      event(5, "model.thinking", { thinkingActive: true }),
    ]);

    expect(state).toEqual({
      turnsUsed: 3,
      competitionTokens: 1_200,
      assisted: true,
      solved: false,
      running: true,
      thinking: true,
    });
  });

  it("keeps input locked after thinking ends until the turn itself completes", () => {
    const beforeCompletion = deriveArenaRunState(attempt, [
      event(1, "turn.queued", { turnOrdinal: 3 }),
      event(2, "model.thinking", { thinkingActive: false }),
    ]);
    expect(beforeCompletion.running).toBe(true);
    expect(beforeCompletion.thinking).toBe(false);

    const completed = deriveArenaRunState(attempt, [
      event(1, "turn.queued", { turnOrdinal: 3 }),
      event(2, "model.thinking", { thinkingActive: false }),
      event(3, "turn.completed"),
    ]);
    expect(completed.running).toBe(false);
  });

  it("uses cumulative usage and exact verifier fields without double counting", () => {
    const state = deriveArenaRunState({ ...attempt, competitionTokens: 1_500 }, [
      event(1, "usage.recorded", { competitionTokens: 900, tokenDelta: 900 }),
      event(2, "verification.completed", { verifierPassed: true }),
    ]);
    expect(state.competitionTokens).toBe(1_500);
    expect(state.solved).toBe(true);
    expect(state.running).toBe(false);
  });
});
