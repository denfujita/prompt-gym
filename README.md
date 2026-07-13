# Prompt Gym

Coach an AI. Spend fewer tokens. Climb the board.

Prompt Gym is a mobile-first AI coaching arcade. Players cannot manipulate a challenge directly: they prompt a pinned model and watch its visible actions. Daily Gym ranks exact solves by the fewest provider-reported tokens; Benchmark Lab ranks the highest verified performance band, then token efficiency.

This public repository contains the product UI, orchestration API, scoring and accounting rules, shared contracts, and data-governance documentation. Procedural generators, hidden instances, and verifiers live in a separate private repository and are delivered to the worker as pinned challenge-service images.

## What ships in the MVP

- **Crack the Signal Vault** — infer hidden visual rules and unlock three chambers.
- **Copy the Gremlin** — reproduce a black-box command-line tool against private behavioral tests.
- **Who Rigged the Race?** — investigate synthetic race telemetry and submit an exact evidence-backed answer.
- Prompt-only coaching, live event playback, exact token accounting, per-instance leaderboards, delayed opt-in replays, and separate commercial-data consent.
- A scripted **Kernel Sprint** Benchmark Lab walkthrough showing iterative, correctness-gated GPU optimization. It uses no API or GPU; the ranked evaluator is a documented release gate.
- A scripted local provider and in-memory persistence so the full experience runs without cloud credentials.
- A frozen 41-model Design Arena-derived code roster: direct OpenAI Responses for ranked GPT-5.6 Terra, exact OpenRouter chat/tool harnesses for 39 practice models, and an explicit unrouted state for AGI-01 Swift.

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

The web app runs at `http://localhost:3000`, the public API at `http://localhost:4000`, and the private challenge service at `http://localhost:4100`. Sign in with the clearly labeled local demo account; its session and eligibility check stay in browser storage. `ALLOW_DEMO_AUTH=true`, a missing `REDIS_URL`, and a missing `OPENAI_API_KEY` activate the local signed-in header, inline runner, and scripted-model fallbacks.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

See [the architecture](docs/architecture.md), [model harnesses](docs/model-harnesses.md), [Puzzle and Build gameplay](docs/gameplay-v2.md), [Benchmark Lab contract](docs/benchmark-lab.md), [prompt storage](docs/prompt-storage.md), [product contract](docs/product-spec.md), [pricing and subsidy policy](docs/pricing-and-subsidy.md), [data governance](docs/data-governance.md), [security model](docs/security.md), [deployment runbook](docs/deployment.md), and [research basis](docs/research-basis.md).

## License

The public Prompt Gym application is licensed under Apache-2.0. Hidden challenge content and private evaluation assets are not part of this repository or license.
