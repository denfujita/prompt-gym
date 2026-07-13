import { PromptGymError } from "./errors.js";
import type { ModelProvider, ProviderRequest, ProviderResponse } from "./provider.js";

/** Server-owned exact arena routing. Queue payloads contain only a turn id. */
export class ModelProviderRouter implements ModelProvider {
  readonly name = "router" as const;
  private readonly providers: ReadonlyMap<string, ModelProvider>;

  constructor(providers: ReadonlyMap<string, ModelProvider> | Record<string, ModelProvider>) {
    this.providers = providers instanceof Map ? new Map(providers) : new Map(Object.entries(providers));
  }

  async respond(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.arenaId) {
      throw new PromptGymError("PROVIDER_ERROR", "The model arena was not pinned", 500);
    }
    const provider = this.providers.get(request.arenaId);
    if (!provider) {
      throw new PromptGymError("PROVIDER_ERROR", "The selected model is not enabled on this worker", 503);
    }
    return provider.respond(request);
  }
}
