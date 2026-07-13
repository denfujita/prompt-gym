import { describe, expect, it } from "vitest";

import { normalizeChallenge, normalizeEvent } from "./api";

const manifest = {
  slug: "signal-vault",
  title: "Crack the Signal Vault",
  shortDescription: "Open it.",
  playerBrief: "Three chambers.",
  winCondition: "Open all three chambers.",
  brief: "Complete model brief.",
  kind: "visual" as const,
  playMode: "puzzle" as const,
  difficulty: "hard" as const,
  estimatedMinutes: 8,
  actionBudgetLabel: "24 control actions",
  maxToolActionsPerTurn: 8,
};

describe("live challenge normalization", () => {
  it("uses explicit player budgets and rejects unsupported challenge slugs", () => {
    expect(normalizeChallenge(manifest)).toMatchObject({
      slug: "signal-vault",
      actionBudgetLabel: "24 control actions",
    });
    expect(normalizeChallenge({ ...manifest, slug: "future-unknown-task" })).toBeUndefined();
  });
});

describe("live event normalization", () => {
  it("preserves authoritative task.state payloads for the task viewport", () => {
    const payload = {
      chambersOpened: 2,
      actionsRemaining: 9,
      panelColor: { color: "cyan", symbol: "diamond", meaning: "position" },
    };
    const event = normalizeEvent({
      id: "event-7",
      sequence: 7,
      type: "task.state",
      actor: "system",
      payload,
      createdAt: "2026-07-12T00:00:00.000Z",
    });

    expect(event.type).toBe("artifact.change");
    expect(event.taskState).toEqual(payload);
  });

  it("does not mark ordinary activity as task state", () => {
    const event = normalizeEvent({
      id: "event-8",
      sequence: 8,
      type: "model.message",
      actor: "model",
      payload: { text: "I will inspect the next file." },
      createdAt: "2026-07-12T00:00:01.000Z",
    });

    expect(event.taskState).toBeUndefined();
  });
});
