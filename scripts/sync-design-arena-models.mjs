#!/usr/bin/env node

const DESIGN_ARENA_API_KEY = process.env.DESIGN_ARENA_API_KEY;
if (!DESIGN_ARENA_API_KEY) {
  console.error("DESIGN_ARENA_API_KEY is required; request one from Design Arena before syncing routes.");
  process.exit(1);
}

const CODE_ARENAS = new Set(["website", "3d", "dataviz", "gamedev", "uicomponent"]);
const REQUIRED_PARAMETERS = ["tools", "tool_choice", "max_tokens"];

async function readJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

const [registry, authenticated, openRouter] = await Promise.all([
  readJson("https://www.designarena.ai/api/registry"),
  readJson("https://www.designarena.ai/api/v1/models", {
    authorization: `Bearer ${DESIGN_ARENA_API_KEY}`,
  }),
  readJson("https://openrouter.ai/api/v1/models"),
]);

const authenticatedModels =
  authenticated.data?.models ?? authenticated.models ?? authenticated.data ?? authenticated;
const routedById = new Map(values(authenticatedModels).map((model) => [model.id, model]));
const openRouterById = new Map(values(openRouter.data).map((model) => [model.id, model]));

const candidates = values(registry.models)
  .filter((model) => {
    const arenas = model.arenas?.models ?? [];
    return model.active === true && arenas.some((arena) => CODE_ARENAS.has(arena));
  })
  .map((model) => {
    const routed = routedById.get(model.id);
    const providerModelId = routed?.openRouterId ?? null;
    const openRouterModel = providerModelId ? openRouterById.get(providerModelId) : undefined;
    return {
      designArenaId: model.id,
      displayName: model.displayName,
      creator: model.provider,
      providerModelId,
      openRouterModel,
    };
  })
  .sort((a, b) => a.designArenaId.localeCompare(b.designArenaId));

const snapshot = await Promise.all(
  candidates.map(async ({ openRouterModel, ...model }) => {
    const providerModelId = model.providerModelId;
    const modelSupportsRequest =
      openRouterModel &&
      REQUIRED_PARAMETERS.every((parameter) => openRouterModel.supported_parameters?.includes(parameter));
    let endpoint;
    if (providerModelId && modelSupportsRequest) {
      const endpointPayload = await readJson(
        `https://openrouter.ai/api/v1/models/${providerModelId}/endpoints`,
      );
      endpoint = values(endpointPayload.data?.endpoints)
        .filter(
          (candidate) =>
            candidate.status === 0 &&
            candidate.tag &&
            REQUIRED_PARAMETERS.every((parameter) => candidate.supported_parameters?.includes(parameter)) &&
            Number.isFinite(Number(candidate.pricing?.prompt)) &&
            Number.isFinite(Number(candidate.pricing?.completion)),
        )
        .sort(
          (a, b) =>
            Number(a.pricing.prompt) +
              Number(a.pricing.completion) -
              (Number(b.pricing.prompt) + Number(b.pricing.completion)) || a.tag.localeCompare(b.tag),
        )[0];
    }
    const availability = endpoint ? "available" : "needs-route";
    return {
      ...model,
      availability,
      providerEndpoint: endpoint?.tag ?? null,
      priceCeiling: endpoint
        ? {
            inputNanoUsdPerToken: Math.ceil(
              (Number(endpoint.pricing.prompt) +
                Math.max(
                  Number(endpoint.pricing.input_cache_write ?? 0),
                  Number(endpoint.pricing.input_cache_write_1h ?? 0),
                )) *
                1_000_000_000,
            ),
            outputNanoUsdPerToken: Math.ceil(Number(endpoint.pricing.completion) * 1_000_000_000),
          }
        : null,
      requiredParameters: REQUIRED_PARAMETERS,
      routeCheck: !providerModelId
        ? "design-arena-route-null"
        : !openRouterModel
          ? "openrouter-model-missing"
          : !modelSupportsRequest
            ? "openrouter-model-missing-required-parameters"
            : endpoint
              ? "openrouter-endpoint-pinned"
              : "openrouter-endpoint-missing-required-parameters",
    };
  }),
);

console.log(
  JSON.stringify(
    {
      schemaVersion: "design-arena-route-snapshot.v1",
      syncedAt: new Date().toISOString(),
      source: "https://www.designarena.ai/api/v1/models",
      count: snapshot.length,
      models: snapshot,
    },
    null,
    2,
  ),
);
