import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_PROFILE_ID,
  DESIGN_ARENA_MODEL_CATALOG,
  createModelArenas,
  defaultModelArena,
  deploymentModelCatalog,
} from "./model-catalog.js";

describe("Design Arena model catalog", () => {
  it("freezes the reviewed 41-model, 16-creator code roster", () => {
    expect(DESIGN_ARENA_MODEL_CATALOG).toHaveLength(41);
    expect(new Set(DESIGN_ARENA_MODEL_CATALOG.map((profile) => profile.id)).size).toBe(41);
    expect(new Set(DESIGN_ARENA_MODEL_CATALOG.map((profile) => profile.creator)).size).toBe(16);
    expect(
      DESIGN_ARENA_MODEL_CATALOG.filter((profile) => profile.availability === "available").every(
        (profile) =>
          profile.priceCeiling &&
          profile.priceCeiling.inputNanoUsdPerToken > 0 &&
          profile.priceCeiling.outputNanoUsdPerToken > 0 &&
          (profile.provider === "openai" || Boolean(profile.providerEndpoint)),
      ),
    ).toBe(true);
    expect(
      DESIGN_ARENA_MODEL_CATALOG.filter((profile) => profile.ranked).map((profile) => profile.id),
    ).toEqual([DEFAULT_MODEL_PROFILE_ID]);
    const unrouted = DESIGN_ARENA_MODEL_CATALOG.find((profile) => profile.id === "agi-01-swift");
    expect(unrouted).toMatchObject({ availability: "needs-route" });
    expect(unrouted).not.toHaveProperty("providerModelId");
    expect(DESIGN_ARENA_MODEL_CATALOG.find((profile) => profile.id === "yoda")?.providerModelId).toBe(
      "x-ai/grok-4.5",
    );
    expect(DESIGN_ARENA_MODEL_CATALOG.find((profile) => profile.id === "coconut")?.providerModelId).toBe(
      "z-ai/glm-5.1",
    );
  });

  it("turns missing credentials into a fail-closed public availability state", () => {
    const local = deploymentModelCatalog({ openAiEnabled: true, openRouterEnabled: false });
    expect(local.find((profile) => profile.id === DEFAULT_MODEL_PROFILE_ID)?.availability).toBe("available");
    expect(local.find((profile) => profile.id === "claude-sonnet-5")?.availability).toBe("needs-route");
  });

  it("creates a separate immutable arena per routed profile", () => {
    const profiles = deploymentModelCatalog({ openAiEnabled: true, openRouterEnabled: true });
    const arenas = createModelArenas({
      profiles,
      now: new Date("2026-07-13T12:00:00.000Z"),
      rankedTerra: true,
      sandboxImageDigest: `sha256:${"a".repeat(64)}`,
    });

    expect(arenas).toHaveLength(40);
    expect(new Set(arenas.map((arena) => arena.id)).size).toBe(40);
    expect(defaultModelArena(arenas)).toMatchObject({
      modelAlias: DEFAULT_MODEL_PROFILE_ID,
      resolvedModel: "gpt-5.6-terra",
      ranked: true,
    });
    expect(arenas.filter((arena) => arena.ranked)).toHaveLength(1);
    expect(arenas.find((arena) => arena.modelAlias === "claude-opus-4-6-thinking")).toMatchObject({
      resolvedModel: "anthropic/claude-opus-4.6",
      reasoningEffort: "medium",
      ranked: false,
    });
    expect(arenas.find((arena) => arena.modelAlias === "claude-opus-4-6")).toMatchObject({
      reasoningEffort: "default",
      ranked: false,
    });
    expect(arenas.find((arena) => arena.modelAlias === "claude-opus-4-6")?.id).toMatch(
      /^season-2026-07-13:claude-opus-4-6:[a-f0-9]{20}$/,
    );
  });
});
