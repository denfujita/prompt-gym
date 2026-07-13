import { describe, expect, it } from "vitest";
import {
  InlineRunDispatcher,
  LocalDemoChallengeService,
  PromptGymService,
  RunEngine,
  RunEventHub,
  ScriptedModelProvider,
  createDefaultArena,
  InMemoryPromptGymRepository,
} from "@prompt-gym/core";
import { HeaderAuthResolver } from "./auth.js";
import { buildApp, validateProductionEnvironment } from "./app.js";

async function fixture() {
  const repository = new InMemoryPromptGymRepository();
  const eventHub = new RunEventHub();
  const service = new PromptGymService(
    repository,
    new LocalDemoChallengeService(),
    createDefaultArena(new Date("2026-07-12T12:00:00Z")),
    eventHub,
    "assign",
    "handles",
  );
  const engine = new RunEngine(service, new ScriptedModelProvider(), { safetySecret: "safe" });
  const app = await buildApp({
    service,
    engine,
    dispatcher: new InlineRunDispatcher(engine, true),
    auth: new HeaderAuthResolver(true),
    appOrigin: "https://app.prompt.gym",
    logger: false,
  });
  return app;
}

async function multiModelFixture() {
  const repository = new InMemoryPromptGymRepository();
  const eventHub = new RunEventHub();
  const directProfile = {
    schemaVersion: "model-profile.v1",
    id: "gpt-5.6-terra",
    designArenaId: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    creator: "OpenAI",
    provider: "openai",
    providerModelId: "gpt-5.6-terra",
    availability: "available",
    ranked: true,
    reasoningMode: "standard",
    priceVersion: "terra-2026-07-12",
    sourceSyncedAt: "2026-07-13T00:00:00.000Z",
  } as const;
  const practiceProfile = {
    schemaVersion: "model-profile.v1",
    id: "claude-opus-4.6",
    designArenaId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    creator: "Anthropic",
    provider: "openrouter",
    providerModelId: "anthropic/claude-opus-4.6",
    availability: "available",
    ranked: false,
    reasoningMode: "standard",
    priceVersion: "openrouter-reported-v1",
    sourceSyncedAt: "2026-07-13T00:00:00.000Z",
  } as const;
  const unroutedProfile = {
    ...practiceProfile,
    id: "agi-01-swift",
    designArenaId: "agi-01-swift",
    displayName: "AGI-01 Swift",
    creator: "LucidQuery",
    availability: "needs-route",
    providerModelId: undefined,
  } as const;
  const baseArena = createDefaultArena(new Date("2026-07-12T12:00:00Z"));
  const directArena = {
    ...baseArena,
    id: `${baseArena.seasonId}:${directProfile.id}:openai-responses-v1`,
    modelAlias: directProfile.id,
    resolvedModel: directProfile.providerModelId,
    ranked: true,
  };
  const practiceArena = {
    ...baseArena,
    id: `${baseArena.seasonId}:${practiceProfile.id}:openrouter-chat-v1`,
    modelAlias: practiceProfile.id,
    resolvedModel: practiceProfile.providerModelId,
    priceVersion: practiceProfile.priceVersion,
    ranked: false,
  };
  const service = new PromptGymService(
    repository,
    new LocalDemoChallengeService(),
    directArena,
    eventHub,
    "assign",
    "handles",
    undefined,
    {
      modelProfiles: [directProfile, practiceProfile, unroutedProfile],
      arenas: [directArena, practiceArena],
    },
  );
  const engine = new RunEngine(service, new ScriptedModelProvider(), { safetySecret: "safe" });
  const app = await buildApp({
    service,
    engine,
    dispatcher: new InlineRunDispatcher(engine, true),
    auth: new HeaderAuthResolver(true),
    appOrigin: "https://app.prompt.gym",
    logger: false,
  });
  return { app, directArena, directProfile, practiceArena, practiceProfile };
}

describe("Prompt Gym API", () => {
  it("publishes the model roster and pins a selected practice model to its own arena", async () => {
    const { app, directProfile, practiceArena, practiceProfile } = await multiModelFixture();
    const roster = await app.inject({ method: "GET", url: "/v1/models" });
    expect(roster.statusCode).toBe(200);
    expect(roster.json()).toMatchObject({
      defaultModelId: directProfile.id,
      models: [
        { id: directProfile.id, provider: "openai", availability: "available", ranked: true },
        { id: practiceProfile.id, provider: "openrouter", availability: "available", ranked: false },
        { id: "agi-01-swift", availability: "needs-route" },
      ],
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: { "x-prompt-gym-user": "model-user" },
      payload: { challengeSlug: "signal-vault", ranked: true, modelProfileId: practiceProfile.id },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().attempt).toMatchObject({
      arenaId: practiceArena.id,
      modelProfileId: practiceProfile.id,
      ranked: false,
    });
    await app.close();
  });

  it("rejects unknown model profiles and resolves leaderboards only for known arenas", async () => {
    const { app, practiceArena } = await multiModelFixture();
    const headers = { "x-prompt-gym-user": "model-user-2" };
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers,
      payload: { challengeSlug: "signal-vault", ranked: false, modelProfileId: "made-up-model" },
    });
    expect(rejected.statusCode).toBe(400);

    const known = await app.inject({
      method: "GET",
      url: `/v1/leaderboards/${encodeURIComponent(practiceArena.id)}?challengeSlug=signal-vault&instanceId=i1`,
    });
    expect(known.statusCode).toBe(200);
    expect(known.json()).toMatchObject({ arena: { id: practiceArena.id }, entries: [] });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/leaderboards/not-an-arena?challengeSlug=signal-vault&instanceId=i1",
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it("fails closed when a production deployment is missing protected dependencies", () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: "production", ALLOW_DEMO_AUTH: "true" })).toThrow(
      /Production configuration is missing/,
    );
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        ALLOW_DEMO_AUTH: "false",
        APP_ORIGIN: "https://app.prompt.gym",
        CLERK_SECRET_KEY: "x",
        CLERK_AUTHORIZED_PARTIES: "https://app.prompt.gym",
        TURNSTILE_SECRET_KEY: "x",
        OPENAI_API_KEY: "x",
        DATABASE_URL: "x",
        REDIS_URL: "x",
        CHALLENGE_SERVICE_URL: "x",
        CHALLENGE_SERVICE_TOKEN: "x",
        INSTANCE_ASSIGNMENT_SECRET: "x",
        PUBLIC_HANDLE_SECRET: "x",
        SAFETY_IDENTIFIER_SECRET: "x",
        SANDBOX_IMAGE_DIGEST: "latest",
        ARENA_SEASON_ANCHOR: "2026-07-13T00:00:00.000Z",
        MODEL_DEPLOYMENT_DIGEST: "x",
      }),
    ).toThrow(/pinned sha256 digest/);
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        ALLOW_DEMO_AUTH: "false",
        APP_ORIGIN: "https://app.prompt.gym",
        CLERK_SECRET_KEY: "x",
        CLERK_AUTHORIZED_PARTIES: "https://app.prompt.gym",
        TURNSTILE_SECRET_KEY: "x",
        OPENAI_API_KEY: "x",
        OPENROUTER_API_KEY: "server-only",
        OPENROUTER_BASE_URL: "http://openrouter.invalid/api/v1",
        DATABASE_URL: "x",
        REDIS_URL: "x",
        CHALLENGE_SERVICE_URL: "x",
        CHALLENGE_SERVICE_TOKEN: "x",
        INSTANCE_ASSIGNMENT_SECRET: "x",
        PUBLIC_HANDLE_SECRET: "x",
        SAFETY_IDENTIFIER_SECRET: "x",
        SANDBOX_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
        ARENA_SEASON_ANCHOR: "2026-07-13T00:00:00.000Z",
        MODEL_DEPLOYMENT_DIGEST: "x",
      }),
    ).toThrow(/OPENROUTER_BASE_URL must use HTTPS/);
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        ALLOW_DEMO_AUTH: "false",
        APP_ORIGIN: "https://app.prompt.gym",
        CLERK_SECRET_KEY: "x",
        CLERK_AUTHORIZED_PARTIES: "https://app.prompt.gym",
        TURNSTILE_SECRET_KEY: "x",
        OPENAI_API_KEY: "x",
        OPENROUTER_API_KEY: "server-only",
        OPENROUTER_BASE_URL: "https://openrouter.example/api/v1",
        DATABASE_URL: "x",
        REDIS_URL: "x",
        CHALLENGE_SERVICE_URL: "x",
        CHALLENGE_SERVICE_TOKEN: "x",
        INSTANCE_ASSIGNMENT_SECRET: "x",
        PUBLIC_HANDLE_SECRET: "x",
        SAFETY_IDENTIFIER_SECRET: "x",
        SANDBOX_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
        ARENA_SEASON_ANCHOR: "2026-07-13T00:00:00.000Z",
        MODEL_DEPLOYMENT_DIGEST: "x",
      }),
    ).toThrow(/credential-free openrouter.ai origin/);
  });

  it("runs the prompt-only Signal Vault flow and supports resumable SSE", async () => {
    const app = await fixture();
    const headers = { "x-prompt-gym-user": "u1" };
    const created = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers,
      payload: { challengeSlug: "signal-vault", ranked: true },
    });
    expect(created.statusCode).toBe(201);
    const attemptId = created.json().attempt.id as string;
    expect(created.json().attempt.ranked).toBe(false);
    const turned = await app.inject({
      method: "POST",
      url: `/v1/attempts/${attemptId}/turns`,
      headers,
      payload: { prompt: "Follow the signal rail." },
    });
    expect(turned.statusCode).toBe(202);
    const events = await app.inject({
      method: "GET",
      url: `/v1/attempts/${attemptId}/events?after=1&once=1`,
      headers: { ...headers, origin: "https://app.prompt.gym" },
    });
    expect(events.statusCode).toBe(200);
    expect(events.headers["access-control-allow-origin"]).toBe("https://app.prompt.gym");
    expect(events.headers["access-control-allow-credentials"]).toBe("true");
    expect(events.body).toContain("event: attempt.completed");
    expect(events.body).not.toContain("privateResultRef");
    await app.close();
  });

  it("rejects client-selected seeds and unauthenticated play", async () => {
    const app = await fixture();
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: { "x-prompt-gym-user": "u1" },
      payload: { challengeSlug: "signal-vault", seed: 2 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(
      (await app.inject({ method: "POST", url: "/v1/attempts", payload: { challengeSlug: "signal-vault" } }))
        .statusCode,
    ).toBe(401);
    await app.close();
  });

  it("resumes the same active challenge without consuming another start", async () => {
    const app = await fixture();
    const headers = { "x-prompt-gym-user": "resume-user" };
    const first = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers,
      payload: { challengeSlug: "signal-vault", ranked: true },
    });
    const resumed = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers,
      payload: { challengeSlug: "signal-vault", ranked: true },
    });
    expect(resumed.statusCode).toBe(201);
    expect(resumed.json().attempt.id).toBe(first.json().attempt.id);
    expect(resumed.json().attempt.promptsUsed).toBe(0);
    await app.close();
  });

  it("reads back independent consent choices and deletes account data", async () => {
    const app = await fixture();
    const headers = { "x-prompt-gym-user": "consent-user" };
    expect((await app.inject({ method: "GET", url: "/v1/consents", headers })).json().consent).toBeNull();
    const saved = await app.inject({
      method: "POST",
      url: "/v1/consents",
      headers,
      payload: { research: true, publicReplay: false, version: "2026-07-12.v1" },
    });
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/consents", headers })).json().consent).toMatchObject({
      operational: true,
      research: true,
      publicReplay: false,
      version: "2026-07-12.v1",
    });
    expect((await app.inject({ method: "DELETE", url: "/v1/account/data", headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/v1/consents", headers })).json().consent).toBeNull();
    await app.close();
  });

  it("fails closed when demo authentication is disabled", async () => {
    const resolver = new HeaderAuthResolver(false);
    await expect(
      resolver.required({ headers: { "x-prompt-gym-user": "forged" } } as never),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
