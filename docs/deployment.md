# Deployment runbook

## Services

- Vercel hosts `apps/web`.
- Fly.io hosts independent `apps/api` and `apps/worker` processes.
- Neon provides PostgreSQL; Upstash provides Redis; Cloudflare R2 stores immutable event and artifact archives.
- Clerk provides Google and Apple authentication. Cloudflare Turnstile protects live-run creation.
- The private challenge service is deployed from `prompt-gym-challenges`; executor and verifier workloads use separately scoped Modal environments.

The checked-in private Node service is an integration adapter, not the production isolation boundary. Ranked play is fail-closed and defaults off even when OpenAI and an HTTP challenge service are configured. Do not enable it until the Modal executor and verifier identities/images are deployed separately, their actual OCI digests are injected, and the worker receives only the scoped public tool result.

## Required configuration

Set browser-safe variables only in Vercel. Keep provider, database, queue, storage, HMAC, challenge-service, and safety-identifier secrets in server-side stores.

Production must set `ALLOW_DEMO_AUTH=false`, Clerk keys and authorized parties, matching Turnstile site/secret keys, `DATABASE_URL`, `REDIS_URL`, an exact `APP_ORIGIN`, and strong independent values for every signing secret. Enable Google and Apple in the Clerk dashboard, register the production origin and `/sign-in` callback, and verify both provider flows before inviting players. The API and worker must share the same pinned `SANDBOX_IMAGE_DIGEST`, `ARENA_SEASON_ANCHOR`, `MODEL_DEPLOYMENT_DIGEST`, checked-in model catalog, database, queue name, private challenge-service credentials, `RANKED_PLAY_ENABLED`, and `RANKED_ISOLATION_ATTESTATION`; the worker additionally requires `OPENAI_API_KEY`. Set `OPENROUTER_API_KEY` on both API and worker to enable the validated practice roster. `OPENROUTER_BASE_URL` is optional and is pinned to the credential-free HTTPS `openrouter.ai` origin in production. The presence of Redis selects queued dispatch. The worker rejects unknown arenas and any resolved-model drift.

Prepare the shared digest after fixing the season anchor, sandbox image, ranked switch, and enabled providers:

```bash
OPENROUTER_MODELS_ENABLED=true npm run models:digest
```

Set the printed SHA-256 as `MODEL_DEPLOYMENT_DIGEST` on both services. A credential mismatch, catalog drift, image change, endpoint change, or ranked-state mismatch then aborts startup instead of producing API-only arenas. Rotate the anchor and digest only at a drained season boundary; retain the old worker revision until no old-arena attempts remain.

Do not expose either provider key through a `NEXT_PUBLIC_` variable. `DESIGN_ARENA_API_KEY` is maintainer-only and used solely by `npm run models:sync`; it is not needed for player inference.

Keep `RANKED_PLAY_ENABLED=false` through deployment and canary testing. Only after the separate Modal isolation audit passes may an operator set `RANKED_PLAY_ENABLED=true` and set `RANKED_ISOLATION_ATTESTATION` to the exact acknowledgement exported as `RANKED_ISOLATION_ATTESTATION` by `@prompt-gym/core`. A missing, misspelled, or stale acknowledgement aborts startup; configuring OpenAI plus an HTTP challenge URL alone always produces an unranked arena.

## Deployment order

1. Create database and queue projects and apply the checked-in Drizzle migration.
2. Create a private R2 bucket with lifecycle and encryption policies.
3. Build and deploy pinned private challenge, executor, and verifier images; record their digests.
4. Set one season anchor, generate the deployment digest, and apply both values to API and worker.
5. Deploy the worker, then the API, and verify health, queue, budget reservation, challenge-service authentication, and event persistence.
6. Deploy the web app with the public API URL and Clerk publishable key.
7. Run a scripted-provider canary, a live-provider canary, SSE reconnect, deterministic verifier replay, cancellation reconciliation, and account-deletion/tombstone check.
8. Set the initial global daily spend circuit breaker to $100 and enable provider-side budget alerts before inviting users.

## Rollback

Web and API revisions may roll back independently. Never mutate an active arena in place: a rollback that changes model, prompt, price, tool, challenge, verifier, or image configuration closes that arena and starts a new version. Leaderboards are rebuildable from the immutable event ledger.
