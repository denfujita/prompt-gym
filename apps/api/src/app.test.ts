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

describe("Prompt Gym API", () => {
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
      }),
    ).toThrow(/pinned sha256 digest/);
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
