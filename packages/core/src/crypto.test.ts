import type { RunEvent } from "@prompt-gym/contracts";
import { describe, expect, it } from "vitest";
import { GENESIS_EVENT_HASH, createVisibleRunEvent, sha256, stableJson, verifyEventChain } from "./crypto.js";

describe("verifyEventChain", () => {
  it("accepts a matching legacy turn backfill but rejects mutated lineage", () => {
    const turnId = "00000000-0000-4000-8000-000000000002";
    const legacyUnsigned = {
      attemptId: "00000000-0000-4000-8000-000000000001",
      sequence: 1,
      actor: "player" as const,
      type: "turn.queued" as const,
      payload: { turnId, prompt: "Inspect the gate." },
      createdAt: "2026-07-12T12:00:00.000Z",
      previousHash: GENESIS_EVENT_HASH,
    };
    const backfilled: RunEvent = {
      id: "00000000-0000-4000-8000-000000000003",
      ...legacyUnsigned,
      turnId,
      hash: sha256(stableJson(legacyUnsigned)),
    };

    expect(verifyEventChain([backfilled])).toBe(true);
    expect(verifyEventChain([{ ...backfilled, turnId: "other-turn" }])).toBe(false);

    const current = createVisibleRunEvent({
      ...legacyUnsigned,
      turnId,
    });
    expect(verifyEventChain([current])).toBe(true);
    expect(verifyEventChain([{ ...current, turnId: "other-turn" }])).toBe(false);
  });
});
