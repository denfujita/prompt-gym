import { randomUUID } from "node:crypto";
import type { JsonValue, ToolDefinition, UsageV1 } from "@prompt-gym/contracts";
import { PromptGymError } from "./errors.js";
import { calculateActualCostNanoUsd, TERRA_PRICE_2026_07_12, type PriceTable } from "./pricing.js";

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ProviderToolOutput {
  callId: string;
  output: Record<string, JsonValue>;
}
export interface ProviderToolCall {
  callId: string;
  name: string;
  arguments: Record<string, JsonValue>;
}
export interface ProviderRequest {
  requestId: string;
  attemptId: string;
  /** Server-owned arena identity used by provider routers. Never take this value from the browser. */
  arenaId?: string;
  /** Server-owned immutable profile identity, included for provider diagnostics only. */
  modelProfileId?: string;
  instructions: string;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
  safetyIdentifier: string;
  /** Server-owned upper bound already reserved for this exact provider call. */
  maxCostNanoUsd?: number;
  continuation?: unknown[];
  toolOutputs?: ProviderToolOutput[];
  signal?: AbortSignal;
}
export interface ProviderResponse {
  providerResponseId: string;
  resolvedModel: string;
  visibleText: string;
  toolCalls: ProviderToolCall[];
  usage: UsageV1;
  /** Opaque and ephemeral. May include encrypted reasoning; never persist or emit it. */
  continuation?: unknown[];
}
export interface ModelProvider {
  readonly name: "openai" | "openrouter" | "router" | "scripted";
  respond(request: ProviderRequest): Promise<ProviderResponse>;
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const MAX_OUTPUT_TOKENS = 2_048;
const PROVIDER_TEMPLATE_TOKEN_HEADROOM = 4_096;

/**
 * JSON bytes are a deliberately conservative upper bound for content tokens
 * across byte-backed tokenizers. Extra headroom covers provider chat
 * templates and model-specific control tokens that are not present in JSON.
 */
export function budgetedOutputTokens(input: {
  requestBody: unknown;
  maxCostNanoUsd?: number;
  inputNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
}): number {
  if (input.maxCostNanoUsd === undefined) return MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(input.maxCostNanoUsd) || input.maxCostNanoUsd <= 0) {
    throw new PromptGymError("COST_BUDGET", "This run has reached its covered API budget", 402);
  }
  const serializedBytes = new TextEncoder().encode(JSON.stringify(input.requestBody)).byteLength;
  const inputTokenCeiling = serializedBytes + PROVIDER_TEMPLATE_TOKEN_HEADROOM;
  const inputCostCeiling = inputTokenCeiling * input.inputNanoUsdPerToken;
  const availableForOutput = input.maxCostNanoUsd - inputCostCeiling;
  const outputTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.floor(availableForOutput / input.outputNanoUsdPerToken),
  );
  if (outputTokens < 1) {
    throw new PromptGymError(
      "COST_BUDGET",
      "The remaining covered budget is too small for another model call",
      402,
    );
  }
  return outputTokens;
}

export class OpenAIResponsesProvider implements ModelProvider {
  readonly name = "openai" as const;
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-5.6-terra",
    private readonly price: PriceTable = TERRA_PRICE_2026_07_12,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  async respond(request: ProviderRequest): Promise<ProviderResponse> {
    const input: unknown[] = request.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const priorContinuation = request.continuation ?? [];
    const encodedToolOutputs = (request.toolOutputs ?? []).map((output) => ({
      type: "function_call_output",
      call_id: output.callId,
      output: JSON.stringify(output.output),
    }));
    input.push(...priorContinuation, ...encodedToolOutputs);
    const body = {
      model: this.model,
      instructions: request.instructions,
      input,
      tools: request.tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        strict: true,
      })),
      reasoning: { effort: "medium" },
      text: { verbosity: "low" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      include: ["reasoning.encrypted_content"],
      safety_identifier: request.safetyIdentifier,
      store: false,
    };
    body.max_output_tokens = budgetedOutputTokens({
      requestBody: body,
      maxCostNanoUsd: request.maxCostNanoUsd,
      inputNanoUsdPerToken: this.price.inputNanoUsdPerToken + this.price.cacheWriteNanoUsdPerToken,
      outputNanoUsdPerToken: this.price.outputNanoUsdPerToken,
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": request.requestId,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      throw new PromptGymError(
        "PROVIDER_AMBIGUOUS",
        "The model call ended before its result could be confirmed",
        502,
        false,
        { clientRequestId: request.requestId, cause: String(error) },
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok || !isRecord(payload)) {
      const providerRequestId = response.headers.get("x-request-id") ?? undefined;
      const code = response.status >= 500 ? "PROVIDER_AMBIGUOUS" : "PROVIDER_ERROR";
      throw new PromptGymError(
        code,
        response.status >= 500
          ? "The model result could not be confirmed"
          : "The model provider rejected the request",
        502,
        false,
        { clientRequestId: request.requestId, providerRequestId, status: response.status },
      );
    }
    const output = Array.isArray(payload.output) ? payload.output.filter(isRecord) : [];
    const visibleText = output
      .flatMap((item) =>
        Array.isArray(item.content)
          ? item.content
              .filter(isRecord)
              .filter((part) => part.type === "output_text" && typeof part.text === "string")
              .map((part) => String(part.text))
          : [],
      )
      .join("\n");
    const toolCalls: ProviderToolCall[] = output
      .filter(
        (item) =>
          item.type === "function_call" && typeof item.name === "string" && typeof item.call_id === "string",
      )
      .map((item) => {
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(typeof item.arguments === "string" ? item.arguments : "{}");
        } catch {
          parsed = {};
        }
        return {
          callId: String(item.call_id),
          name: String(item.name),
          arguments: isRecord(parsed) ? (parsed as Record<string, JsonValue>) : {},
        };
      });
    const rawUsage = isRecord(payload.usage) ? payload.usage : {};
    const inputDetails = isRecord(rawUsage.input_tokens_details) ? rawUsage.input_tokens_details : {};
    const outputDetails = isRecord(rawUsage.output_tokens_details) ? rawUsage.output_tokens_details : {};
    const inputTokens = number(rawUsage.input_tokens);
    const outputTokens = number(rawUsage.output_tokens);
    const cachedInputTokens = number(inputDetails.cached_tokens);
    const cacheWriteTokens = number(inputDetails.cache_write_tokens);
    const usageBase = { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens };
    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openai",
      providerResponseId: typeof payload.id === "string" ? payload.id : request.requestId,
      resolvedModel: typeof payload.model === "string" ? payload.model : this.model,
      ...usageBase,
      reasoningTokens: number(outputDetails.reasoning_tokens),
      totalTokens: number(rawUsage.total_tokens) || inputTokens + outputTokens,
      imageTokens: number(inputDetails.image_tokens),
      toolUnits: toolCalls.length,
      priceVersion: this.price.version,
      actualCostNanoUsd: calculateActualCostNanoUsd(usageBase, this.price),
      createdAt: new Date().toISOString(),
    };
    return {
      providerResponseId: usage.providerResponseId,
      resolvedModel: usage.resolvedModel,
      visibleText,
      toolCalls,
      usage,
      // Carry the complete stateless within-turn transcript forward. It is kept only
      // in RunEngine memory and discarded as soon as the turn finishes.
      continuation: [...priorContinuation, ...encodedToolOutputs, ...output],
    };
  }
}

/** Deterministic no-cost provider for local UX and integration tests. */
export class ScriptedModelProvider implements ModelProvider {
  readonly name = "scripted" as const;
  private readonly taskState = new Map<
    string,
    {
      raceFiles: Map<string, JsonValue>;
      signal?: {
        chamber?: number;
        observations: Array<{ color: string; gate: "open" | "closed"; pulses: Record<string, number> }>;
        targetSymbol?: string;
        targetGate?: "open" | "closed";
        currentColor?: string;
        currentGate?: "open" | "closed";
      };
      gremlin?: { readGuide: boolean; lastProbe?: string; observations: Map<string, string> };
    }
  >();
  async respond(request: ProviderRequest): Promise<ProviderResponse> {
    const names = new Set(request.tools.map((tool) => tool.name));
    const lastOutput = request.toolOutputs?.at(-1)?.output;
    let call: ProviderToolCall | undefined;
    let visibleText = "I’ll inspect the task, then make one verifiable move.";
    if (names.has("observe")) {
      if (!lastOutput) call = this.call("observe", {});
      else if (typeof lastOutput.nextSymbol === "string")
        call = this.call("vault_action", { symbol: lastOutput.nextSymbol });
      else if (typeof lastOutput.nextChamber === "number") call = this.call("observe", {});
    } else if (names.has("vault_action")) {
      const state = this.state(request.attemptId);
      state.signal ??= { observations: [] };
      const signal = state.signal;
      if (!lastOutput) {
        call = this.call("vault_action", { action: "scan" });
      } else if (lastOutput.accepted === true) {
        state.signal = { observations: [] };
        call = this.call("vault_action", { action: "scan" });
      } else if (
        Array.isArray(lastOutput.glyphs) &&
        isRecord(lastOutput.panelColor) &&
        typeof lastOutput.gate === "string"
      ) {
        const chamber = typeof lastOutput.chamber === "number" ? lastOutput.chamber : signal.chamber;
        if (chamber !== signal.chamber) {
          signal.chamber = chamber;
          signal.observations = [];
          signal.targetSymbol = undefined;
          signal.targetGate = undefined;
        }
        const color = String(lastOutput.panelColor.color ?? "unknown");
        const gate: "open" | "closed" = lastOutput.gate.startsWith("open") ? "open" : "closed";
        const pulses = Object.fromEntries(
          lastOutput.glyphs.flatMap((glyph) =>
            isRecord(glyph) && typeof glyph.symbol === "string" && typeof glyph.pulses === "number"
              ? [[glyph.symbol, glyph.pulses] as const]
              : [],
          ),
        );
        signal.currentColor = color;
        signal.currentGate = gate;
        signal.observations.push({ color, gate, pulses });

        if (!signal.targetSymbol) {
          const counterpart = signal.observations.find(
            (observation) => observation.color === color && observation.gate !== gate,
          );
          const changed =
            counterpart &&
            Object.keys(pulses).find((symbol) => pulses[symbol] !== counterpart.pulses[symbol]);
          if (counterpart && changed) {
            signal.targetSymbol = changed;
            signal.targetGate =
              (pulses[changed] ?? 0) > (counterpart.pulses[changed] ?? 0) ? gate : counterpart.gate;
          }
        }

        if (!signal.targetSymbol || !signal.targetGate) {
          call = this.call("vault_action", { action: "toggle_gate" });
        } else if (gate !== signal.targetGate) {
          call = this.call("vault_action", { action: "toggle_gate" });
        } else if (pulses[signal.targetSymbol] === 3) {
          call = this.call("vault_action", { action: `press_${signal.targetSymbol}` });
        } else {
          call = this.call("vault_action", { action: "cycle_color" });
        }
      } else if (lastOutput.outcome === "gate-toggled" && typeof lastOutput.gate === "string") {
        signal.currentGate = lastOutput.gate.startsWith("open") ? "open" : "closed";
        if (
          signal.targetSymbol &&
          signal.targetGate &&
          signal.currentGate === signal.targetGate &&
          signal.currentColor
        ) {
          const configured = signal.observations.find(
            (observation) =>
              observation.color === signal.currentColor && observation.gate === signal.targetGate,
          );
          call =
            configured?.pulses[signal.targetSymbol] === 3
              ? this.call("vault_action", { action: `press_${signal.targetSymbol}` })
              : this.call("vault_action", { action: "cycle_color" });
        } else {
          call = this.call("vault_action", { action: "scan" });
        }
      } else if (lastOutput.outcome === "color-cycled" && isRecord(lastOutput.panelColor)) {
        signal.currentColor = String(lastOutput.panelColor.color ?? "unknown");
        call = this.call("vault_action", { action: "scan" });
      } else {
        call = this.call("vault_action", { action: "scan" });
      }
    } else if (names.has("read_file") && names.has("oracle")) {
      call = this.privateGremlinCall(request, lastOutput);
    } else if (names.has("probe") || names.has("oracle")) {
      if (!lastOutput) call = this.call("probe", { input: "  Gremlin42  " });
      else if (names.has("write_file") && typeof lastOutput.output === "string") {
        call = this.call("write_file", {
          path: "/workspace/solution.ts",
          content: "export const run=(s:string)=>s.trim().split('').reverse().join('').toUpperCase();",
        });
      } else if (names.has("write_file") && lastOutput.saved === true) {
        call = this.call("submit_clone", {});
      } else if (typeof lastOutput.output === "string") {
        const specification = this.inferGremlin("  Gremlin42  ", lastOutput.output);
        call = specification
          ? this.call("submit_clone", specification)
          : this.call("probe", { input: "abcdefg" });
      }
    } else if (names.has("read_evidence")) {
      const state = this.state(request.attemptId);
      if (typeof lastOutput?.file === "string" && lastOutput.data !== undefined)
        state.raceFiles.set(lastOutput.file, lastOutput.data);
      const nextFile = ["race.csv", "sensors.json", "marshal.log"].find((file) => !state.raceFiles.has(file));
      if (nextFile) call = this.call("read_evidence", { file: nextFile });
      else {
        call = this.call("submit_finding", this.inferRace(state.raceFiles));
        this.taskState.delete(request.attemptId);
      }
    }
    if (call) visibleText = `I’m using ${call.name.replaceAll("_", " ")} to test the current hypothesis.`;
    else visibleText = "I need another coaching prompt before I can make a reliable move.";
    // Scripted play is an explicitly unranked, zero-cost product harness. Keep
    // its synthetic usage bounded by the latest coaching prompt so long local
    // task transcripts cannot trip the paid-arena competition budget.
    const latestPlayerPrompt =
      request.messages
        .filter((message) => message.role === "user" && !message.content.startsWith("[Visible tool result:"))
        .at(-1)?.content ?? "";
    const inputTokens = 120 + Math.ceil(latestPlayerPrompt.length / 4);
    const outputTokens = 32;
    const providerResponseId = `scripted-${randomUUID()}`;
    const usageBase = { inputTokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens };
    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "scripted",
      providerResponseId,
      resolvedModel: "prompt-gym-scripted-demo",
      ...usageBase,
      reasoningTokens: 8,
      totalTokens: inputTokens + outputTokens,
      imageTokens: 0,
      toolUnits: call ? 1 : 0,
      priceVersion: TERRA_PRICE_2026_07_12.version,
      actualCostNanoUsd: 0,
      createdAt: new Date().toISOString(),
    };
    return {
      providerResponseId,
      resolvedModel: usage.resolvedModel,
      visibleText,
      toolCalls: call ? [call] : [],
      usage,
    };
  }
  private call(name: string, args: Record<string, JsonValue>): ProviderToolCall {
    return { callId: randomUUID(), name, arguments: args };
  }

  private state(attemptId: string) {
    const state = this.taskState.get(attemptId) ?? { raceFiles: new Map<string, JsonValue>() };
    this.taskState.set(attemptId, state);
    return state;
  }

  private privateGremlinCall(
    request: ProviderRequest,
    lastOutput: Record<string, JsonValue> | undefined,
  ): ProviderToolCall {
    const state = this.state(request.attemptId);
    state.gremlin ??= { readGuide: false, observations: new Map<string, string>() };
    const gremlin = state.gremlin;
    if (!gremlin.readGuide) {
      gremlin.readGuide = true;
      return this.call("read_file", { path: "README.md" });
    }
    // The eighth tool output ends a model turn and therefore arrives through
    // visible history, not the within-turn toolOutputs array. Recover it so a
    // scripted local run never burns the private oracle budget by re-probing.
    const completedOutput = lastOutput ?? this.latestVisibleToolOutput(request.messages, "oracle");
    if (gremlin.lastProbe !== undefined && typeof completedOutput?.output === "string") {
      gremlin.observations.set(gremlin.lastProbe, completedOutput.output);
      gremlin.lastProbe = undefined;
    }
    const candidates = this.gremlinCandidates().filter((candidate) =>
      [...gremlin.observations].every(
        ([input, output]) => this.gremlinTransform(input, candidate) === output,
      ),
    );
    if (candidates.length === 1) {
      this.taskState.delete(request.attemptId);
      return this.call("submit_clone", { source: `${JSON.stringify(candidates[0], null, 2)}\n` });
    }
    const probes = ["", "  Ab c  ", "a  b c", "AbC dE", "one two three four five", "a\t b", "🙂aB"];
    const next =
      probes.find((probe) => !gremlin.observations.has(probe) && gremlin.lastProbe !== probe) ?? "x y z";
    gremlin.lastProbe = next;
    return this.call("oracle", { input: next });
  }

  private latestVisibleToolOutput(
    messages: ProviderMessage[],
    toolName: string,
  ): Record<string, JsonValue> | undefined {
    const marker = `[Visible tool result: ${toolName}] `;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const content = messages[index]?.content;
      if (!content?.startsWith(marker)) continue;
      try {
        const parsed: unknown = JSON.parse(content.slice(marker.length));
        if (isRecord(parsed)) return parsed as Record<string, JsonValue>;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private gremlinCandidates(): Array<Record<string, JsonValue>> {
    const candidates: Array<Record<string, JsonValue>> = [];
    for (const whitespace of ["trim", "collapse"])
      for (const caseMode of ["upper", "lower", "swap"])
        for (const rotateBy of [1, 2, 3, 4])
          for (const reverseMode of ["codepoints", "words"])
            for (const affix of ["!", "?", "#", "~"])
              for (const emptyToken of ["VOID", "EMPTY", "GREMLIN"])
                candidates.push({
                  version: 1,
                  whitespace,
                  caseMode,
                  rotateBy,
                  reverseMode,
                  affix,
                  emptyToken,
                });
    return candidates;
  }

  private gremlinTransform(input: string, spec: Record<string, JsonValue>): string {
    const normalized = spec.whitespace === "collapse" ? input.trim().replace(/\s+/gu, " ") : input.trim();
    if (!normalized) return `${spec.affix}${spec.emptyToken}${spec.affix}`;
    const swapped = Array.from(normalized, (character) => {
      const upper = character.toUpperCase();
      const lower = character.toLowerCase();
      return character === upper && character !== lower
        ? lower
        : character === lower && character !== upper
          ? upper
          : character;
    }).join("");
    const cased =
      spec.caseMode === "upper"
        ? normalized.toUpperCase()
        : spec.caseMode === "lower"
          ? normalized.toLowerCase()
          : swapped;
    const units = spec.reverseMode === "codepoints" ? Array.from(cased) : cased.split(" ");
    const offset = Number(spec.rotateBy) % units.length;
    const rotated = [...units.slice(offset), ...units.slice(0, offset)].reverse();
    return `${spec.affix}${rotated.join(spec.reverseMode === "codepoints" ? "" : " ")}${spec.affix}`;
  }

  private inferGremlin(input: string, observed: string): Record<string, JsonValue> | undefined {
    for (const caseMode of ["upper", "lower"] as const) {
      for (const rotateBy of [1, 2, 3]) {
        for (const affix of ["!", "?", "#", "~"]) {
          const normalized = input.trim();
          const cased = caseMode === "upper" ? normalized.toUpperCase() : normalized.toLowerCase();
          const offset = cased.length === 0 ? 0 : rotateBy % cased.length;
          const rotated = cased.slice(offset) + cased.slice(0, offset);
          if (`${affix}${rotated.split("").reverse().join("")}${affix}` === observed)
            return { caseMode, rotateBy, affix };
        }
      }
    }
    return undefined;
  }

  private inferRace(files: Map<string, JsonValue>): Record<string, JsonValue> {
    const race = files.get("race.csv");
    const sensors = files.get("sensors.json");
    const marshal = files.get("marshal.log");
    if (
      isRecord(race) &&
      Array.isArray(race.rows) &&
      isRecord(sensors) &&
      Array.isArray(sensors.calibrations) &&
      isRecord(marshal) &&
      Array.isArray(marshal.entries) &&
      Array.isArray(marshal.aliasRegistry) &&
      Array.isArray(marshal.photoFinish)
    ) {
      const aliases = new Map(
        marshal.aliasRegistry
          .filter((item): item is Record<string, JsonValue> => isRecord(item))
          .flatMap((item) =>
            typeof item.alias === "string" && typeof item.canonicalRacer === "string"
              ? [[item.alias, item.canonicalRacer] as const]
              : [],
          ),
      );
      const incident = marshal.entries
        .filter((item): item is Record<string, JsonValue> => isRecord(item))
        .find(
          (item) =>
            item.level === "verified" &&
            typeof item.finding === "string" &&
            item.finding.includes("advanced"),
        );
      const alias = typeof incident?.alias === "string" ? incident.alias : "";
      const raceRow = race.rows
        .filter((item): item is Record<string, JsonValue> => isRecord(item))
        .find((item) => item.bibAlias === alias);
      const sensor = typeof raceRow?.sensor === "string" ? raceRow.sensor : "";
      const calibration = sensors.calibrations
        .filter((item): item is Record<string, JsonValue> => isRecord(item))
        .find((item) => item.sensor === sensor);
      const recorded =
        typeof raceRow?.recordedMs === "number"
          ? raceRow.recordedMs
          : Array.isArray(raceRow?.sectorMs)
            ? raceRow.sectorMs.reduce<number>(
                (sum, value) => sum + (typeof value === "number" ? value : 0),
                0,
              )
            : 0;
      const corrected =
        recorded + (typeof calibration?.addToRecordedMs === "number" ? calibration.addToRecordedMs : 0);
      const photos = marshal.photoFinish.filter((item): item is Record<string, JsonValue> => isRecord(item));
      const cheaterPhoto = photos.find((item) => item.alias === alias);
      const winnerPhoto = photos
        .filter((item) => typeof item.independentMs === "number")
        .sort((a, b) => Number(a.independentMs) - Number(b.independentMs))[0];
      if (
        typeof cheaterPhoto?.independentMs === "number" &&
        typeof winnerPhoto?.alias === "string" &&
        typeof calibration?.evidenceId === "string" &&
        typeof incident?.evidenceId === "string"
      ) {
        return {
          winner: aliases.get(winnerPhoto.alias) ?? winnerPhoto.alias,
          cheater: aliases.get(alias) ?? alias,
          advantage: Number(((cheaterPhoto.independentMs - corrected) / 1_000).toFixed(3)),
          evidenceIds: [calibration.evidenceId, incident.evidenceId],
        };
      }
    }
    if (
      isRecord(race) &&
      Array.isArray(race.rows) &&
      isRecord(sensors) &&
      isRecord(marshal) &&
      Array.isArray(marshal.entries)
    ) {
      const rows = race.rows.filter((row): row is Record<string, JsonValue> => isRecord(row));
      const sensor = typeof sensors.sensor === "string" ? sensors.sensor : "";
      const adjustment = typeof sensors.adjustmentSeconds === "number" ? sensors.adjustmentSeconds : 0;
      const corrected = rows
        .map((row) => ({
          racer: typeof row.racer === "string" ? row.racer : "",
          time:
            (typeof row.recordedMs === "number" ? row.recordedMs : Number.POSITIVE_INFINITY) +
            (row.sensor === sensor ? adjustment * 1_000 : 0),
        }))
        .sort((a, b) => a.time - b.time);
      const incident = marshal.entries
        .filter((entry): entry is Record<string, JsonValue> => isRecord(entry))
        .find((entry) => typeof entry.finding === "string" && entry.finding.includes("unauthorized"));
      if (
        corrected[0]?.racer &&
        incident &&
        typeof incident.racer === "string" &&
        typeof sensors.evidenceId === "string" &&
        typeof incident.evidenceId === "string"
      ) {
        return {
          winner: corrected[0].racer,
          cheater: incident.racer,
          advantage: adjustment,
          evidenceIds: [sensors.evidenceId, incident.evidenceId],
        };
      }
    }
    // Local public demo fixture.
    return { winner: "MOTH", cheater: "RAVEN", advantage: 1.2, evidenceIds: ["CAL-7", "E-19"] };
  }
}
