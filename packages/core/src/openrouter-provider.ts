import type { JsonValue, ModelProfileV1, UsageV1 } from "@prompt-gym/contracts";
import { PromptGymError } from "./errors.js";
import {
  budgetedOutputTokens,
  type ModelProvider,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderToolCall,
} from "./provider.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const tokenCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

function visibleContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .filter(isRecord)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n");
}

export interface OpenRouterProviderOptions {
  apiKey: string;
  profile: ModelProfileV1;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  appUrl?: string;
  appName?: string;
}

/**
 * Exact-model, non-streaming OpenRouter adapter for practice arenas.
 *
 * This adapter never retries. Native assistant/tool messages are returned only
 * as ephemeral continuation state and are discarded after the active turn.
 */
export class OpenRouterChatProvider implements ModelProvider {
  readonly name = "openrouter" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly options: OpenRouterProviderOptions) {
    if (!options.apiKey) throw new Error("OpenRouter apiKey is required");
    if (options.profile.provider !== "openrouter" || !options.profile.providerModelId) {
      throw new Error("OpenRouter profiles require an exact providerModelId");
    }
    this.model = options.profile.providerModelId;
    if (options.profile.availability !== "available") {
      throw new Error("An unrouted model profile cannot create an OpenRouter provider");
    }
    if (!options.profile.priceCeiling) {
      throw new Error("OpenRouter profiles require a reviewed provider price ceiling");
    }
    if (!options.profile.providerEndpoint) {
      throw new Error("OpenRouter profiles require a frozen provider endpoint");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/u, "");
  }

  async respond(request: ProviderRequest): Promise<ProviderResponse> {
    const priorContinuation = request.continuation ?? [];
    const toolMessages = (request.toolOutputs ?? []).map((result) => ({
      role: "tool",
      tool_call_id: result.callId,
      content: JSON.stringify(result.output),
    }));
    const messages = [
      { role: "system", content: request.instructions },
      ...request.messages.map((message) => ({ role: message.role, content: message.content })),
      ...priorContinuation,
      ...toolMessages,
    ];
    const priceCeiling = this.options.profile.priceCeiling!;
    const body = {
      model: this.model,
      messages,
      tools: request.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: true,
        },
      })),
      tool_choice: "auto",
      max_tokens: 2_048,
      ...(this.options.profile.reasoningMode === "thinking"
        ? { reasoning: { effort: "medium", exclude: false } }
        : {}),
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        only: [this.options.profile.providerEndpoint],
        max_price: {
          prompt: priceCeiling.inputNanoUsdPerToken / 1_000,
          completion: priceCeiling.outputNanoUsdPerToken / 1_000,
        },
      },
      // Already an HMAC-derived, privacy-preserving value created by core.
      user: request.safetyIdentifier,
    };
    body.max_tokens = budgetedOutputTokens({
      requestBody: body,
      maxCostNanoUsd: request.maxCostNanoUsd,
      inputNanoUsdPerToken: priceCeiling.inputNanoUsdPerToken,
      outputNanoUsdPerToken: priceCeiling.outputNanoUsdPerToken,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": request.requestId,
          ...(this.options.appUrl ? { "http-referer": this.options.appUrl } : {}),
          ...(this.options.appName ? { "x-title": this.options.appName } : {}),
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
        { clientRequestId: request.requestId, provider: "openrouter", cause: String(error) },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok || !isRecord(payload)) {
      const ambiguous = response.status >= 500;
      throw new PromptGymError(
        ambiguous ? "PROVIDER_AMBIGUOUS" : "PROVIDER_ERROR",
        ambiguous ? "The model result could not be confirmed" : "The model provider rejected the request",
        502,
        false,
        {
          clientRequestId: request.requestId,
          providerRequestId: response.headers.get("x-request-id") ?? undefined,
          provider: "openrouter",
          status: response.status,
        },
      );
    }

    const providerResponseId = typeof payload.id === "string" ? payload.id : undefined;
    const choices = Array.isArray(payload.choices) ? payload.choices.filter(isRecord) : [];
    const choice = choices[0];
    const message = choice && isRecord(choice.message) ? choice.message : undefined;
    const rawUsage = isRecord(payload.usage) ? payload.usage : undefined;
    if (!providerResponseId || !message || !rawUsage || typeof rawUsage.total_tokens !== "number") {
      throw new PromptGymError(
        "PROVIDER_AMBIGUOUS",
        "The provider response was incomplete, so its score could not be confirmed",
        502,
        false,
        { clientRequestId: request.requestId, provider: "openrouter", providerResponseId },
      );
    }

    const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls.filter(isRecord) : [];
    const toolCalls: ProviderToolCall[] = rawCalls.flatMap((call) => {
      const fn = isRecord(call.function) ? call.function : undefined;
      if (!fn || typeof call.id !== "string" || typeof fn.name !== "string") return [];
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(typeof fn.arguments === "string" ? fn.arguments : "{}");
      } catch {
        parsed = {};
      }
      return [
        {
          callId: call.id,
          name: fn.name,
          arguments: isRecord(parsed) ? (parsed as Record<string, JsonValue>) : {},
        },
      ];
    });

    const promptDetails = isRecord(rawUsage.prompt_tokens_details) ? rawUsage.prompt_tokens_details : {};
    const completionDetails = isRecord(rawUsage.completion_tokens_details)
      ? rawUsage.completion_tokens_details
      : {};
    const cost = typeof rawUsage.cost === "number" ? rawUsage.cost : undefined;
    if (cost === undefined || !Number.isFinite(cost) || cost < 0) {
      throw new PromptGymError(
        "PROVIDER_AMBIGUOUS",
        "The provider did not return auditable cost accounting",
        502,
        false,
        { provider: "openrouter", providerResponseId },
      );
    }

    const usage: UsageV1 = {
      schemaVersion: "usage.v1",
      provider: "openrouter",
      providerResponseId,
      resolvedModel: typeof payload.model === "string" ? payload.model : this.model,
      inputTokens: tokenCount(rawUsage.prompt_tokens),
      cachedInputTokens: tokenCount(promptDetails.cached_tokens),
      cacheWriteTokens: tokenCount(promptDetails.cache_write_tokens),
      outputTokens: tokenCount(rawUsage.completion_tokens),
      reasoningTokens: tokenCount(completionDetails.reasoning_tokens),
      totalTokens: tokenCount(rawUsage.total_tokens),
      imageTokens: tokenCount(promptDetails.image_tokens) + tokenCount(completionDetails.image_tokens),
      toolUnits: toolCalls.length,
      priceVersion: this.options.profile.priceVersion,
      actualCostNanoUsd: Math.round(cost * 1_000_000_000),
      createdAt: new Date().toISOString(),
    };

    const nativeMessage = {
      role: "assistant",
      content: message.content ?? null,
      ...(rawCalls.length > 0 ? { tool_calls: rawCalls } : {}),
      // Some reasoning providers require signed opaque blocks for a valid tool
      // continuation. Keep them only in RunEngine memory; never emit or persist.
      ...(Array.isArray(message.reasoning_details) ? { reasoning_details: message.reasoning_details } : {}),
      ...(typeof message.reasoning === "string" ? { reasoning: message.reasoning } : {}),
    };
    return {
      providerResponseId,
      resolvedModel: usage.resolvedModel,
      visibleText: visibleContent(message.content),
      toolCalls,
      usage,
      continuation: [...priorContinuation, ...toolMessages, nativeMessage],
    };
  }
}
