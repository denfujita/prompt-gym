import { describe, expect, it } from "vitest";
import { consentRequestSchema, createAttemptRequestSchema, createTurnRequestSchema } from "./index.js";

describe("public request contracts", () => {
  it("rejects fields that could smuggle server-owned instance state", () => {
    expect(
      createAttemptRequestSchema.safeParse({ challengeSlug: "signal-vault", ranked: true, seed: "pick-me" })
        .success,
    ).toBe(false);
  });
  it("trims and bounds player prompts", () => {
    expect(createTurnRequestSchema.parse({ prompt: "  try the circle gate  " }).prompt).toBe(
      "try the circle gate",
    );
    expect(createTurnRequestSchema.safeParse({ prompt: " ".repeat(10) }).success).toBe(false);
  });
  it("keeps research and public replay consent separate", () => {
    expect(
      consentRequestSchema.parse({ research: true, publicReplay: false, version: "2026-07-12" }),
    ).toMatchObject({ research: true, publicReplay: false });
  });
});
