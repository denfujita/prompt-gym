import { describe, expect, it, vi } from "vitest";
import type { ModelProfileV1 } from "@prompt-gym/contracts";
import { PromptGymError } from "./errors.js";
import { OpenRouterChatProvider } from "./openrouter-provider.js";
import { ModelProviderRouter } from "./provider-router.js";
import type { ModelProvider, ProviderRequest } from "./provider.js";

const profile: ModelProfileV1 = {
  schemaVersion: "model-profile.v1",
  id: "claude-opus-4-6-thinking",
  designArenaId: "claude-opus-4-6-thinking",
  displayName: "Claude Opus 4.6 (Thinking)",
  creator: "Anthropic",
  provider: "openrouter",
  providerModelId: "anthropic/claude-opus-4.6",
  providerEndpoint: "anthropic",
  availability: "available",
  ranked: false,
  reasoningMode: "thinking",
  priceVersion: "openrouter-reported-2026-07-13",
  priceCeiling: { inputNanoUsdPerToken: 15_000, outputNanoUsdPerToken: 25_000 },
  sourceSyncedAt: "2026-07-13T00:00:00.000Z",
};

const request = (): ProviderRequest => ({
  requestId: "client-request-1",
  attemptId: "attempt-1",
  arenaId: "arena-claude",
  modelProfileId: profile.id,
  instructions: "System-owned task brief",
  messages: [{ role: "user", content: "Coach message" }],
  tools: [
    {
      name: "inspect_panel",
      description: "Inspect one panel",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ],
  safetyIdentifier: "safe_hmac_identifier",
  maxCostNanoUsd: 250_000_000,
});

describe("OpenRouterChatProvider", () => {
  it("pins routing, preserves role boundaries, normalizes tools and provider usage", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "gen-1",
          model: "anthropic/claude-opus-4.6",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: "I will inspect first.",
                reasoning: "private reasoning must not be emitted",
                reasoning_details: [{ type: "reasoning.encrypted", data: "opaque-signature" }],
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: { name: "inspect_panel", arguments: '{"panel":"north"}' },
                  },
                ],
              },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150,
            prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 4 },
            completion_tokens_details: { reasoning_tokens: 11 },
            cost: 0.00125,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new OpenRouterChatProvider({
      apiKey: "test-key",
      profile,
      fetchImpl,
      appName: "Prompt Gym",
      appUrl: "https://prompt-gym.example",
    });

    const result = await provider.respond(request());
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(body).toMatchObject({
      model: profile.providerModelId,
      messages: [
        { role: "system", content: "System-owned task brief" },
        { role: "user", content: "Coach message" },
      ],
      tool_choice: "auto",
      reasoning: { effort: "medium", exclude: false },
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        only: ["anthropic"],
        max_price: { prompt: 15, completion: 25 },
      },
      user: "safe_hmac_identifier",
    });
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeLessThanOrEqual(2_048);
    expect(body).not.toHaveProperty("parallel_tool_calls");
    expect(body.tools[0]).toMatchObject({
      type: "function",
      function: { name: "inspect_panel", strict: true },
    });
    expect(result).toMatchObject({
      providerResponseId: "gen-1",
      resolvedModel: profile.providerModelId,
      visibleText: "I will inspect first.",
      toolCalls: [{ callId: "call-1", name: "inspect_panel", arguments: { panel: "north" } }],
      usage: {
        provider: "openrouter",
        inputTokens: 120,
        cachedInputTokens: 20,
        cacheWriteTokens: 4,
        outputTokens: 30,
        reasoningTokens: 11,
        totalTokens: 150,
        actualCostNanoUsd: 1_250_000,
      },
    });
    expect(result.continuation).toEqual([
      expect.objectContaining({
        role: "assistant",
        tool_calls: expect.any(Array),
        reasoning_details: [{ type: "reasoning.encrypted", data: "opaque-signature" }],
        reasoning: "private reasoning must not be emitted",
      }),
    ]);
    expect(JSON.stringify({ visibleText: result.visibleText, toolCalls: result.toolCalls })).not.toContain(
      "private reasoning must not be emitted",
    );
  });

  it("echoes opaque reasoning only inside the ephemeral native tool continuation", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "gen-first",
            model: profile.providerModelId,
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  reasoning_details: [{ type: "reasoning.encrypted", data: "signed-block" }],
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: { name: "inspect_panel", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.001 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "gen-second",
            model: profile.providerModelId,
            choices: [{ message: { role: "assistant", content: "continued" } }],
            usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23, cost: 0.001 },
          }),
        ),
      );
    const provider = new OpenRouterChatProvider({ apiKey: "key", profile, fetchImpl });

    const first = await provider.respond(request());
    await provider.respond({
      ...request(),
      continuation: first.continuation,
      toolOutputs: [{ callId: "call-1", output: { panel: "north" } }],
    });

    const secondBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(secondBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          reasoning_details: [{ type: "reasoning.encrypted", data: "signed-block" }],
        }),
        expect.objectContaining({ role: "tool", tool_call_id: "call-1" }),
      ]),
    );
  });

  it("fails before inference when the reserved balance cannot cover the request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new OpenRouterChatProvider({ apiKey: "key", profile, fetchImpl });

    await expect(provider.respond({ ...request(), maxCostNanoUsd: 1_000 })).rejects.toMatchObject({
      code: "COST_BUDGET",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies an aborted in-flight request as unresolved spend", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const provider = new OpenRouterChatProvider({ apiKey: "key", profile, fetchImpl });

    await expect(provider.respond(request())).rejects.toMatchObject({ code: "PROVIDER_AMBIGUOUS" });
  });

  it.each([
    [400, "PROVIDER_ERROR"],
    [429, "PROVIDER_ERROR"],
    [503, "PROVIDER_AMBIGUOUS"],
  ])("maps HTTP %i to %s without retrying", async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    const provider = new OpenRouterChatProvider({ apiKey: "key", profile, fetchImpl });

    await expect(provider.respond(request())).rejects.toMatchObject({ code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails conservatively when auditable cost is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "gen-no-cost",
          model: profile.providerModelId,
          choices: [{ message: { role: "assistant", content: "done" } }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenRouterChatProvider({ apiKey: "key", profile, fetchImpl });

    await expect(provider.respond(request())).rejects.toMatchObject({ code: "PROVIDER_AMBIGUOUS" });
  });
});

describe("ModelProviderRouter", () => {
  it("dispatches only through the server-owned arena id", async () => {
    const response = {
      providerResponseId: "response",
      resolvedModel: "model",
      visibleText: "",
      toolCalls: [],
      usage: {
        schemaVersion: "usage.v1" as const,
        provider: "scripted" as const,
        providerResponseId: "response",
        resolvedModel: "model",
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
        reasoningTokens: 0,
        totalTokens: 2,
        imageTokens: 0,
        toolUnits: 0,
        priceVersion: "test",
        actualCostNanoUsd: 0,
        createdAt: "2026-07-13T00:00:00.000Z",
      },
    };
    const provider: ModelProvider = { name: "scripted", respond: vi.fn().mockResolvedValue(response) };
    const router = new ModelProviderRouter({ "arena-claude": provider });

    await expect(router.respond(request())).resolves.toBe(response);
    await expect(router.respond({ ...request(), arenaId: "unknown" })).rejects.toBeInstanceOf(PromptGymError);
    expect(provider.respond).toHaveBeenCalledTimes(1);
  });
});
