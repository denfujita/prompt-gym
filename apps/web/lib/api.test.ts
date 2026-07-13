import { describe, expect, it } from "vitest";

import { normalizeChallenge, normalizeEvent, normalizeModelProfile } from "./api";
import { demoModelCatalog } from "./demo-data";

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

describe("model catalog normalization", () => {
  it("mirrors the complete 41-profile demo roster", () => {
    expect(demoModelCatalog.models).toHaveLength(41);
    expect(new Set(demoModelCatalog.models.map((model) => model.id)).size).toBe(41);
  });

  it("preserves the season-pinned profile fields used for model-isolated arenas", () => {
    expect(
      normalizeModelProfile({
        id: "claude-sonnet-4-6",
        schemaVersion: "model-profile.v1",
        designArenaId: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        creator: "Anthropic",
        provider: "openrouter",
        providerModelId: "anthropic/claude-sonnet-4.6",
        availability: "available",
        ranked: true,
        reasoningMode: "standard",
        priceVersion: "openrouter-2026-07",
        sourceSyncedAt: "2026-07-13T00:00:00.000Z",
      }),
    ).toMatchObject({
      id: "claude-sonnet-4-6",
      creator: "Anthropic",
      availability: "available",
      ranked: true,
    });
  });

  it("accepts an older route-status spelling without making it selectable", () => {
    expect(
      normalizeModelProfile({
        id: "future-model",
        displayName: "Future Model",
        providerDisplayName: "Future Lab",
        route: "needs_route",
      }),
    ).toMatchObject({
      creator: "Future Lab",
      availability: "needs-route",
      ranked: false,
    });
  });
});
