import { describe, expect, it, vi } from "vitest";
import { assignSeedSlot, publicHandleForUser } from "./assignment.js";
import { OpenAIResponsesProvider } from "./provider.js";
import { calculateActualCostNanoUsd, competitionTokens, TERRA_PRICE_2026_07_12 } from "./pricing.js";

describe("competition primitives", () => {
  it("assigns a stable hidden slot and pseudonymous handle", () => {
    const input = {
      secret: "secret",
      userId: "user",
      challengeSlug: "signal-vault",
      date: new Date("2026-07-12T23:59:59Z"),
    };
    expect(assignSeedSlot(input)).toBe(assignSeedSlot(input));
    expect(assignSeedSlot(input)).toBeGreaterThanOrEqual(0);
    expect(assignSeedSlot(input)).toBeLessThan(3);
    expect(publicHandleForUser("handles", "user")).not.toContain("user");
  });

  it("discounts cached input for actual cost but not competition tokens", () => {
    const actual = calculateActualCostNanoUsd(
      { inputTokens: 1_000, cachedInputTokens: 800, cacheWriteTokens: 0, outputTokens: 100 },
      TERRA_PRICE_2026_07_12,
    );
    expect(actual).toBe(200 * 2_500 + 800 * 250 + 100 * 15_000);
    expect(competitionTokens([{ totalTokens: 1_100 }, { totalTokens: 200 }])).toBe(1_300);
  });

  it("sends a non-stored Responses API call and normalizes provider usage", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(request.store).toBe(false);
      expect(request.safety_identifier).toBe("safe-id");
      expect(request.max_output_tokens).toBe(2_048);
      return new Response(
        JSON.stringify({
          id: "resp_1",
          model: "gpt-5.6-terra",
          output: [
            { type: "message", content: [{ type: "output_text", text: "Checking." }] },
            { type: "function_call", name: "observe", call_id: "call_1", arguments: "{}" },
          ],
          usage: {
            input_tokens: 100,
            input_tokens_details: { cached_tokens: 40 },
            output_tokens: 20,
            output_tokens_details: { reasoning_tokens: 5 },
            total_tokens: 120,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const provider = new OpenAIResponsesProvider("key", "gpt-5.6-terra", TERRA_PRICE_2026_07_12, fetchImpl);
    const response = await provider.respond({
      requestId: "req",
      attemptId: "a",
      instructions: "brief",
      messages: [{ role: "user", content: "look" }],
      tools: [
        {
          name: "observe",
          description: "look",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
      safetyIdentifier: "safe-id",
    });
    expect(response.visibleText).toBe("Checking.");
    expect(response.toolCalls[0]?.name).toBe("observe");
    expect(response.usage).toMatchObject({ totalTokens: 120, cachedInputTokens: 40, reasoningTokens: 5 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
