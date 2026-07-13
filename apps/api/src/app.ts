import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  consentRequestSchema,
  createAttemptRequestSchema,
  createTurnRequestSchema,
  eligibilityRequestSchema,
  leaderboardQuerySchema,
} from "@prompt-gym/contracts";
import {
  InlineRunDispatcher,
  LocalDemoChallengeService,
  ModelProviderRouter,
  OpenAIResponsesProvider,
  OpenRouterChatProvider,
  PromptGymError,
  PromptGymService,
  RunEngine,
  RunEventHub,
  createModelArenas,
  defaultModelArena,
  deploymentModelCatalog,
  assertModelDeploymentDigest,
  resolveArenaSeasonAnchor,
  resolveRankedPlayEnabled,
  ScriptedModelProvider,
  HttpChallengeServiceClient,
  InMemoryPromptGymRepository,
  type ModelProvider,
  type RunDispatcher,
} from "@prompt-gym/core";
import { PostgresPromptGymRepository } from "@prompt-gym/db";
import { ClerkAuthResolver, HeaderAuthResolver, type AuthResolver } from "./auth.js";
import { BullMqRunDispatcher } from "./dispatcher.js";

export interface AppDependencies {
  service: PromptGymService;
  engine: RunEngine;
  dispatcher: RunDispatcher;
  auth: AuthResolver;
  appOrigin?: string;
  turnstileSecret?: string;
  fetchImpl?: typeof fetch;
  logger?: boolean;
}

const parse = <T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } },
  value: unknown,
): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new PromptGymError("INVALID_INPUT", "Request did not match the public contract", 400);
  return parsed.data;
};

export function validateProductionEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const required = [
    "APP_ORIGIN",
    "CLERK_SECRET_KEY",
    "CLERK_AUTHORIZED_PARTIES",
    "TURNSTILE_SECRET_KEY",
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "CHALLENGE_SERVICE_URL",
    "CHALLENGE_SERVICE_TOKEN",
    "INSTANCE_ASSIGNMENT_SECRET",
    "PUBLIC_HANDLE_SECRET",
    "SAFETY_IDENTIFIER_SECRET",
    "SANDBOX_IMAGE_DIGEST",
    "ARENA_SEASON_ANCHOR",
    "MODEL_DEPLOYMENT_DIGEST",
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Production configuration is missing: ${missing.join(", ")}`);
  if (env.ALLOW_DEMO_AUTH === "true") throw new Error("ALLOW_DEMO_AUTH must be false in production");
  if (!/^sha256:[a-f0-9]{64}$/u.test(env.SANDBOX_IMAGE_DIGEST!))
    throw new Error("SANDBOX_IMAGE_DIGEST must be a pinned sha256 digest");
  resolveArenaSeasonAnchor(env.ARENA_SEASON_ANCHOR);
  const origins = env.APP_ORIGIN!.split(",").map((origin) => origin.trim());
  if (origins.some((origin) => !origin.startsWith("https://")))
    throw new Error("Production APP_ORIGIN values must use HTTPS");
  if (env.OPENROUTER_BASE_URL) {
    let openRouterUrl: URL;
    try {
      openRouterUrl = new URL(env.OPENROUTER_BASE_URL);
    } catch {
      throw new Error("OPENROUTER_BASE_URL must be a valid URL");
    }
    if (openRouterUrl.protocol !== "https:") {
      throw new Error("OPENROUTER_BASE_URL must use HTTPS in production");
    }
    if (openRouterUrl.hostname !== "openrouter.ai" || openRouterUrl.username || openRouterUrl.password) {
      throw new Error("OPENROUTER_BASE_URL must use the credential-free openrouter.ai origin");
    }
  }
  resolveRankedPlayEnabled({
    enabled: env.RANKED_PLAY_ENABLED,
    isolationAttestation: env.RANKED_ISOLATION_ATTESTATION,
  });
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
  });
  const allowedOrigins =
    deps.appOrigin
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  await app.register(cors, { origin: allowedOrigins, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute", keyGenerator: (request) => request.ip });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PromptGymError)
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.publicMessage, retryable: error.retryable } });
    app.log.error({ err: error }, "request failed");
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL", message: "Something went wrong", retryable: false } });
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/v1/models", async () => {
    const arenasByProfile = new Map(deps.service.arenas.map((arena) => [arena.modelAlias, arena]));
    return {
      models: deps.service.modelProfiles.map((profile) => {
        const arena = arenasByProfile.get(profile.id);
        return {
          ...profile,
          availability:
            profile.availability === "available" && arena ? ("available" as const) : ("needs-route" as const),
          ranked: Boolean(profile.ranked && arena?.ranked),
        };
      }),
      defaultModelId: deps.service.defaultModelProfileId,
    };
  });
  app.get("/v1/challenges", async (request) => {
    const auth = await deps.auth.optional(request);
    return deps.service.listChallenges(auth?.userId);
  });
  app.get<{ Params: { slug: string } }>("/v1/challenges/:slug", async (request) => ({
    challenge: await deps.service.getChallenge(request.params.slug),
    arena: deps.service.arena,
  }));

  app.post(
    "/v1/attempts",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const auth = await deps.auth.required(request);
      if (!auth.eligible && !(await deps.service.isEligible(auth.userId)))
        throw new PromptGymError(
          "AUTH_REQUIRED",
          "Confirm the 18+ US eligibility statement before live play",
          403,
        );
      const body = parse(createAttemptRequestSchema, request.body);
      const attempt = await deps.service.createAttempt(
        { id: auth.userId, ...(auth.publicHandle ? { publicHandle: auth.publicHandle } : {}) },
        body.challengeSlug,
        body.ranked,
        body.modelProfileId,
      );
      return reply
        .status(201)
        .send({ attempt, events: await deps.service.repository.listEvents(attempt.id) });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/attempts/:id/turns",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const auth = await deps.auth.required(request);
      const body = parse(createTurnRequestSchema, request.body);
      const turn = await deps.service.queueTurn(auth.userId, request.params.id, body.prompt);
      try {
        await deps.dispatcher.dispatchTurn(turn.id);
      } catch {
        throw new PromptGymError("PROVIDER_ERROR", "The model queue is temporarily unavailable", 503, true);
      }
      return reply.status(202).send({ turn });
    },
  );

  app.get<{ Params: { id: string }; Querystring: { after?: string; once?: string } }>(
    "/v1/attempts/:id/events",
    async (request, reply) => {
      const auth = await deps.auth.required(request);
      await deps.service.requireOwnedAttempt(request.params.id, auth.userId);
      const fromHeader = request.headers["last-event-id"];
      const afterRaw = request.query.after ?? (typeof fromHeader === "string" ? fromHeader : "0");
      const after = Number.isSafeInteger(Number(afterRaw)) && Number(afterRaw) >= 0 ? Number(afterRaw) : 0;
      const requestOrigin = request.headers.origin;
      const corsHeaders =
        typeof requestOrigin === "string" && allowedOrigins.includes(requestOrigin)
          ? {
              "access-control-allow-origin": requestOrigin,
              "access-control-allow-credentials": "true",
              vary: "Origin",
            }
          : {};
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        ...corsHeaders,
      });
      let lastSent = after;
      let buffering = true;
      const pending: Awaited<ReturnType<typeof deps.service.repository.listEvents>> = [];
      const send = (event: (typeof pending)[number]) => {
        if (event.sequence <= lastSent) return;
        lastSent = event.sequence;
        reply.raw.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const unsubscribe = deps.service.eventHub.subscribe(request.params.id, (event) => {
        if (buffering) pending.push(event);
        else send(event);
      });
      const backlog = await deps.service.repository.listEvents(request.params.id, after);
      for (const event of [...backlog, ...pending].sort((a, b) => a.sequence - b.sequence)) send(event);
      buffering = false;
      if (request.query.once === "1") {
        unsubscribe();
        reply.raw.end();
        return;
      }
      const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
      let polling = false;
      const durablePoll = setInterval(() => {
        if (polling) return;
        polling = true;
        void deps.service.repository
          .listEvents(request.params.id, lastSent)
          .then((events) => {
            for (const event of events) send(event);
          })
          .catch(() => undefined)
          .finally(() => {
            polling = false;
          });
      }, 1_000);
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        clearInterval(durablePoll);
        unsubscribe();
      });
    },
  );

  app.get<{ Params: { id: string } }>("/v1/attempts/:id/result", async (request) => {
    const auth = await deps.auth.required(request);
    return deps.service.result(auth.userId, request.params.id);
  });

  app.post<{ Params: { id: string } }>("/v1/attempts/:id/cancel", async (request) => {
    const auth = await deps.auth.required(request);
    await deps.service.requireOwnedAttempt(request.params.id, auth.userId);
    const stopped = await deps.engine.stopTurn(request.params.id);
    if (!stopped) throw new PromptGymError("CONFLICT", "There is no active model turn to stop", 409);
    return { attempt: await deps.service.requireOwnedAttempt(request.params.id, auth.userId), stopped };
  });

  app.post<{ Params: { id: string } }>("/v1/attempts/:id/hint", async (request) => {
    const auth = await deps.auth.required(request);
    return deps.service.unlockHint(auth.userId, request.params.id);
  });

  app.get<{ Params: { arena: string } }>("/v1/leaderboards/:arena", async (request) => {
    const arena =
      request.params.arena === "current"
        ? deps.service.arena
        : (deps.service.getArena(request.params.arena) ??
          deps.service.arenas.find((candidate) => candidate.modelAlias === request.params.arena));
    if (!arena) throw new PromptGymError("NOT_FOUND", "Arena not found", 404);
    const query = parse(leaderboardQuerySchema, request.query);
    if (!query.challengeSlug || !query.instanceId) {
      throw new PromptGymError(
        "INVALID_INPUT",
        "Choose an exact challenge instance before loading a leaderboard",
        400,
      );
    }
    return {
      arena,
      entries: await deps.service.listLeaderboard(
        {
          challengeSlug: query.challengeSlug,
          instanceId: query.instanceId,
          assisted: query.assisted === undefined ? undefined : query.assisted === "true",
        },
        arena.id,
      ),
      scope: { challengeSlug: query.challengeSlug, instanceId: query.instanceId },
    };
  });

  app.get<{ Params: { id: string } }>("/v1/replays/:id", async (request) => {
    const auth = await deps.auth.optional(request);
    return deps.service.replay(auth?.userId ?? "anonymous-public-replay", request.params.id);
  });
  app.get("/v1/consents", async (request) => {
    const auth = await deps.auth.required(request);
    return { consent: (await deps.service.repository.getConsent(auth.userId)) ?? null };
  });
  app.post("/v1/consents", async (request) => {
    const auth = await deps.auth.required(request);
    return {
      consent: await deps.service.saveConsent(auth.userId, parse(consentRequestSchema, request.body)),
    };
  });
  app.post("/v1/eligibility", async (request) => {
    const auth = await deps.auth.required(request);
    const body = parse(eligibilityRequestSchema, request.body);
    if (deps.turnstileSecret) {
      if (!body.turnstileToken) throw new PromptGymError("INVALID_INPUT", "Complete the anti-bot check", 400);
      const form = new URLSearchParams({
        secret: deps.turnstileSecret,
        response: body.turnstileToken,
        remoteip: request.ip,
      });
      const result = await (deps.fetchImpl ?? fetch)(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
        },
      );
      const decision = (await result.json()) as { success?: boolean };
      if (!result.ok || decision.success !== true)
        throw new PromptGymError("INVALID_INPUT", "The anti-bot check could not be verified", 400);
    }
    return { eligibility: await deps.service.saveEligibility(auth.userId, body.version) };
  });
  app.delete("/v1/account/data", async (request, reply) => {
    const auth = await deps.auth.required(request);
    await deps.service.deleteAccount(auth.userId);
    return reply.status(204).send();
  });

  return app;
}

export async function dependenciesFromEnvironment(): Promise<
  AppDependencies & { close?: () => Promise<void> }
> {
  const env = process.env;
  validateProductionEnvironment(env);
  const challengeService =
    env.CHALLENGE_SERVICE_URL && env.CHALLENGE_SERVICE_TOKEN
      ? new HttpChallengeServiceClient(env.CHALLENGE_SERVICE_URL, env.CHALLENGE_SERVICE_TOKEN)
      : new LocalDemoChallengeService();
  const scriptedLocal = !env.OPENAI_API_KEY && env.NODE_ENV !== "production";
  const deployableProfiles = deploymentModelCatalog({
    openAiEnabled: Boolean(env.OPENAI_API_KEY) || scriptedLocal,
    openRouterEnabled: Boolean(env.OPENROUTER_API_KEY),
  }).map((profile) =>
    scriptedLocal && profile.provider === "openai" ? { ...profile, ranked: false } : profile,
  );
  const arenas = createModelArenas({
    profiles: deployableProfiles,
    now: resolveArenaSeasonAnchor(env.ARENA_SEASON_ANCHOR),
    sandboxImageDigest: env.SANDBOX_IMAGE_DIGEST,
    rankedTerra:
      Boolean(env.OPENAI_API_KEY) &&
      resolveRankedPlayEnabled({
        enabled: env.RANKED_PLAY_ENABLED,
        isolationAttestation: env.RANKED_ISOLATION_ATTESTATION,
      }),
  });
  const modelProfiles = deployableProfiles.map((profile) => ({
    ...profile,
    ranked: arenas.find((candidate) => candidate.modelAlias === profile.id)?.ranked ?? false,
  }));
  assertModelDeploymentDigest(env.MODEL_DEPLOYMENT_DIGEST, modelProfiles, arenas);
  const arena = defaultModelArena(arenas);
  const challenges = await challengeService.listChallenges();
  const durableRepository = env.DATABASE_URL
    ? new PostgresPromptGymRepository({ databaseUrl: env.DATABASE_URL, arenas, challenges })
    : undefined;
  await durableRepository?.initialize();
  const repository = durableRepository ?? new InMemoryPromptGymRepository();
  const eventHub = new RunEventHub();
  const service = new PromptGymService(
    repository,
    challengeService,
    arena,
    eventHub,
    env.INSTANCE_ASSIGNMENT_SECRET ?? "local-assignment-only",
    env.PUBLIC_HANDLE_SECRET ?? "local-handles-only",
    undefined,
    { modelProfiles, arenas },
  );
  const providers = new Map<string, ModelProvider>();
  for (const modelArena of arenas) {
    const profile = modelProfiles.find((candidate) => candidate.id === modelArena.modelAlias);
    if (!profile?.providerModelId) continue;
    if (profile.provider === "openai") {
      providers.set(
        modelArena.id,
        env.OPENAI_API_KEY
          ? new OpenAIResponsesProvider(env.OPENAI_API_KEY, profile.providerModelId)
          : new ScriptedModelProvider(),
      );
      continue;
    }
    if (env.OPENROUTER_API_KEY) {
      providers.set(
        modelArena.id,
        new OpenRouterChatProvider({
          apiKey: env.OPENROUTER_API_KEY,
          profile,
          baseUrl: env.OPENROUTER_BASE_URL,
          appUrl: env.APP_ORIGIN?.split(",")[0]?.trim(),
          appName: env.OPENROUTER_APP_NAME ?? "Prompt Gym",
        }),
      );
    }
  }
  const provider = new ModelProviderRouter(providers);
  const engine = new RunEngine(service, provider, {
    safetySecret: env.SAFETY_IDENTIFIER_SECRET ?? "local-safety-only",
    globalDailyCostLimitNanoUsd: env.GLOBAL_DAILY_COST_USD
      ? Number(env.GLOBAL_DAILY_COST_USD) * 1_000_000_000
      : undefined,
  });
  const auth = env.CLERK_SECRET_KEY
    ? new ClerkAuthResolver(env.CLERK_SECRET_KEY, env.CLERK_AUTHORIZED_PARTIES?.split(",").filter(Boolean))
    : new HeaderAuthResolver(env.ALLOW_DEMO_AUTH === "true");
  if (env.REDIS_URL) {
    const queued = new BullMqRunDispatcher(env.REDIS_URL, env.RUN_QUEUE_NAME);
    const recoverQueuedTurns = async () => {
      const turns = await repository.listQueuedTurns(250);
      await Promise.all(turns.map((turn) => queued.dispatchTurn(turn.id).catch(() => undefined)));
    };
    await recoverQueuedTurns();
    const recoveryTimer = setInterval(() => {
      void recoverQueuedTurns();
    }, 5_000);
    recoveryTimer.unref();
    return {
      service,
      engine,
      dispatcher: queued,
      auth,
      appOrigin: env.APP_ORIGIN ?? "http://localhost:3000",
      turnstileSecret: env.TURNSTILE_SECRET_KEY,
      logger: env.NODE_ENV !== "test",
      close: async () => {
        clearInterval(recoveryTimer);
        await queued.close();
        await durableRepository?.close();
      },
    };
  }
  return {
    service,
    engine,
    dispatcher: new InlineRunDispatcher(engine),
    auth,
    appOrigin: env.APP_ORIGIN ?? "http://localhost:3000",
    turnstileSecret: env.TURNSTILE_SECRET_KEY,
    logger: env.NODE_ENV !== "test",
    close: durableRepository ? () => durableRepository.close() : undefined,
  };
}
