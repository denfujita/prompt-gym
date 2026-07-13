# Prompt Gym

Coach an AI. Spend fewer tokens. Climb the board.

Prompt Gym is a mobile-first daily coaching arcade. Players cannot manipulate a challenge directly: they prompt a pinned model, watch its visible actions, and compete to reach an exact verifier using the fewest provider-reported tokens.

This public repository contains the product UI, orchestration API, scoring and accounting rules, shared contracts, and data-governance documentation. Procedural generators, hidden instances, and verifiers live in a separate private repository and are delivered to the worker as pinned challenge-service images.

## What ships in the MVP

- **Signal Vault** — infer hidden visual rules and unlock three chambers.
- **Clone the Gremlin** — reproduce a black-box command-line tool against private behavioral tests.
- **Rigged Race** — investigate synthetic race telemetry and submit an exact evidence-backed answer.
- Prompt-only coaching, live event playback, exact token accounting, per-instance leaderboards, delayed opt-in replays, and separate commercial-data consent.
- A scripted local provider and in-memory persistence so the full experience runs without cloud credentials.
- A real OpenAI Responses API adapter for `gpt-5.6-terra` when `OPENAI_API_KEY` is configured.

## Local development

Requirements: Node.js 22+, npm 10+, and the sibling `prompt-gym-challenges` checkout.

```bash
cd ../prompt-gym-challenges
cp .env.example .env
npm install
npm run dev
```

In a second terminal:

```bash
cp .env.example .env
npm install
npm run dev
```

The web app runs at `http://localhost:3000`, the public API at `http://localhost:4000`, and the private challenge service at `http://localhost:4100`. `ALLOW_DEMO_AUTH=true`, a missing `REDIS_URL`, and a missing `OPENAI_API_KEY` activate the local authenticated-header, inline-runner, and scripted-model fallbacks.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

See [the architecture](docs/architecture.md), [product contract](docs/product-spec.md), [pricing and subsidy policy](docs/pricing-and-subsidy.md), [data governance](docs/data-governance.md), [security model](docs/security.md), [deployment runbook](docs/deployment.md), and [research basis](docs/research-basis.md).

## License

The public Prompt Gym application is licensed under Apache-2.0. Hidden challenge content and private evaluation assets are not part of this repository or license.
