import { describe, expect, it } from "vitest";
import { OpenAIResponsesProvider, ScriptedModelProvider } from "./provider.js";

describe("OpenAIResponsesProvider", () => {
  it("uses stateless Responses settings and carries the complete within-turn transcript", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      const output =
        call === 1
          ? [
              { type: "reasoning", encrypted_content: "opaque" },
              { type: "function_call", call_id: "call-1", name: "observe", arguments: "{}" },
            ]
          : [{ type: "message", content: [{ type: "output_text", text: "Done." }] }];
      return new Response(
        JSON.stringify({
          id: `resp-${call}`,
          model: "gpt-5.6-terra",
          output,
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
            input_tokens_details: { cached_tokens: 10 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const provider = new OpenAIResponsesProvider("test-key", "gpt-5.6-terra", undefined, fetchImpl);
    const base = {
      requestId: "request-1",
      attemptId: "attempt-1",
      instructions: "Complete the task.",
      messages: [{ role: "user" as const, content: "Inspect first." }],
      tools: [
        {
          name: "observe",
          description: "Observe",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
      safetyIdentifier: "safe-user",
    };
    const first = await provider.respond(base);
    await provider.respond({
      ...base,
      requestId: "request-2",
      continuation: first.continuation,
      toolOutputs: [{ callId: "call-1", output: { clue: "triangle" } }],
    });

    expect(bodies[0]).toMatchObject({
      model: "gpt-5.6-terra",
      store: false,
      reasoning: { effort: "medium" },
      text: { verbosity: "low" },
    });
    const secondInput = bodies[1]?.input as Array<Record<string, unknown>>;
    expect(secondInput).toContainEqual({ type: "reasoning", encrypted_content: "opaque" });
    expect(secondInput).toContainEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: JSON.stringify({ clue: "triangle" }),
    });
  });
});

describe("ScriptedModelProvider", () => {
  it("solves a vault chamber by differencing visible scans instead of brute force", async () => {
    const provider = new ScriptedModelProvider();
    const base = {
      requestId: "vault-request",
      attemptId: "vault-attempt",
      instructions: "Solve it.",
      messages: [{ role: "user" as const, content: "Probe efficiently." }],
      safetyIdentifier: "safe",
      tools: [{ name: "vault_action", description: "Act", inputSchema: { type: "object" } }],
    };
    let response = await provider.respond(base);
    expect(response.toolCalls[0]?.arguments).toEqual({ action: "scan" });
    response = await provider.respond({
      ...base,
      toolOutputs: [
        {
          callId: response.toolCalls[0]!.callId,
          output: {
            chamber: 1,
            panelColor: { color: "cyan" },
            gate: "closed/locked",
            glyphs: [
              { symbol: "circle", pulses: 1 },
              { symbol: "triangle", pulses: 0 },
              { symbol: "square", pulses: 2 },
            ],
          },
        },
      ],
    });
    expect(response.toolCalls[0]?.arguments).toEqual({ action: "toggle_gate" });
    response = await provider.respond({
      ...base,
      toolOutputs: [
        { callId: response.toolCalls[0]!.callId, output: { outcome: "gate-toggled", gate: "open/unlocked" } },
      ],
    });
    expect(response.toolCalls[0]?.arguments).toEqual({ action: "scan" });
    response = await provider.respond({
      ...base,
      toolOutputs: [
        {
          callId: response.toolCalls[0]!.callId,
          output: {
            chamber: 1,
            panelColor: { color: "cyan" },
            gate: "open/unlocked",
            glyphs: [
              { symbol: "circle", pulses: 2 },
              { symbol: "triangle", pulses: 0 },
              { symbol: "square", pulses: 2 },
            ],
          },
        },
      ],
    });
    expect(response.toolCalls[0]?.arguments).toEqual({ action: "cycle_color" });
    response = await provider.respond({
      ...base,
      toolOutputs: [
        {
          callId: response.toolCalls[0]!.callId,
          output: { outcome: "color-cycled", panelColor: { color: "amber" } },
        },
      ],
    });
    expect(response.toolCalls[0]?.arguments).toEqual({ action: "scan" });
    response = await provider.respond({
      ...base,
      toolOutputs: [
        {
          callId: response.toolCalls[0]!.callId,
          output: {
            chamber: 1,
            panelColor: { color: "amber" },
            gate: "open/unlocked",
            glyphs: [
              { symbol: "circle", pulses: 3 },
              { symbol: "triangle", pulses: 0 },
              { symbol: "square", pulses: 2 },
            ],
          },
        },
      ],
    });
    expect(response.toolCalls[0]?.arguments).toEqual({ action: "press_circle" });
  });

  it("recovers the final Gremlin oracle output from visible history at a turn boundary", async () => {
    const provider = new ScriptedModelProvider();
    const spec = {
      version: 1,
      whitespace: "collapse",
      caseMode: "swap",
      rotateBy: 4,
      reverseMode: "words",
      affix: "~",
      emptyToken: "GREMLIN",
    } as const;
    const transform = (input: string) => {
      const normalized = input.trim().replace(/\s+/gu, " ");
      if (!normalized) return `~${spec.emptyToken}~`;
      const cased = Array.from(normalized, (character) => {
        const upper = character.toUpperCase();
        const lower = character.toLowerCase();
        return character === upper && character !== lower
          ? lower
          : character === lower && character !== upper
            ? upper
            : character;
      }).join("");
      const units = cased.split(" ");
      const offset = spec.rotateBy % units.length;
      return `~${[...units.slice(offset), ...units.slice(0, offset)].reverse().join(" ")}~`;
    };
    const base = {
      requestId: "gremlin-request",
      attemptId: "gremlin-attempt",
      instructions: "Solve it.",
      messages: [{ role: "user" as const, content: "Inspect efficiently." }],
      safetyIdentifier: "safe",
      tools: ["read_file", "oracle", "submit_clone"].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object" },
      })),
    };
    let response = await provider.respond(base);
    expect(response.toolCalls[0]?.name).toBe("read_file");
    response = await provider.respond({
      ...base,
      toolOutputs: [
        { callId: response.toolCalls[0]!.callId, output: { path: "README.md", content: "guide" } },
      ],
    });

    let oracleCalls = 0;
    while (response.toolCalls[0]?.name === "oracle" && oracleCalls < 7) {
      const call = response.toolCalls[0]!;
      const input = String(call.arguments.input ?? "");
      const output = transform(input);
      oracleCalls += 1;
      response =
        oracleCalls === 5
          ? await provider.respond({
              ...base,
              requestId: "gremlin-request-2",
              messages: [
                ...base.messages,
                {
                  role: "assistant" as const,
                  content: `[Visible tool result: oracle] ${JSON.stringify({ output })}`,
                },
              ],
            })
          : await provider.respond({ ...base, toolOutputs: [{ callId: call.callId, output: { output } }] });
    }
    expect(oracleCalls).toBeLessThanOrEqual(7);
    expect(response.toolCalls[0]?.name).toBe("submit_clone");
    expect(JSON.parse(String(response.toolCalls[0]?.arguments.source))).toEqual(spec);
  });
});
