# Model harnesses

Prompt Gym uses Design Arena's breadth as a discovery signal, not as an arena or
score source. The frozen bootstrap roster was read from Design Arena's
[public registry](https://www.designarena.ai/api/registry) on 2026-07-13 and
filtered to active, text-output foundation models used in its code-design
categories. The catalog contains 41 profiles across 16 creators.

The catalog deliberately keeps three identities separate:

- `designArenaId`: the external roster identifier. It is provenance, never a
  provider request value.
- `providerModelId`: the exact, validated API route sent to the provider.
- `id`: Prompt Gym's immutable model profile. Thinking and non-thinking
  configurations have different ids even if they share an upstream model.

Design Arena aliases such as `yoda`, `coconut`, and `deepocto` are therefore
never sent to an inference API. Its authenticated API can supply an
`openRouterId` (or `null`); see the
[official API documentation](https://docs.designarena.ai/api-reference/overview).
The public bootstrap routes are independently checked against OpenRouter's
model and endpoint catalogs before being enabled. A reviewed profile freezes an
endpoint tag, input/output price ceilings, and support for `tools`,
`tool_choice`, and `max_tokens`.

## Current roster

| Creator     | Prompt Gym profiles                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Alibaba     | Qwen3.6 Plus, Qwen3.7 Max, Qwen3.7 Plus                                                                                |
| Anthropic   | Claude Fable 5, Opus 4.6, Opus 4.6 Thinking, Opus 4.7, Opus 4.8, Sonnet 4.5, Sonnet 4.5 Thinking, Sonnet 4.6, Sonnet 5 |
| DeepSeek    | DeepSeek V4 Flash, DeepSeek V4 Pro                                                                                     |
| Google      | Gemini 3.1 Pro Preview, Gemini 3.5 Flash                                                                               |
| Inception   | Mercury 2                                                                                                              |
| LucidQuery  | AGI-01 Swift                                                                                                           |
| MiniMax     | MiniMax M2.7, MiniMax M3                                                                                               |
| Moonshot AI | Kimi K2.5 Thinking, Kimi K2.6, Kimi K2.7 Code                                                                          |
| Nex AGI     | Nex N2 Pro                                                                                                             |
| NVIDIA      | Nemotron 3 Ultra                                                                                                       |
| OpenAI      | GPT-5.5, GPT-5.6 Luna, GPT-5.6 Sol, GPT-5.6 Terra                                                                      |
| StepFun     | Step 3.7 Flash                                                                                                         |
| Tencent     | Hy3                                                                                                                    |
| xAI         | Grok 4.20, Grok 4.20 Reasoning, Grok 4.3, Grok 4.5                                                                     |
| Xiaomi      | MiMo V2.5, MiMo V2.5 Pro                                                                                               |
| Zhipu AI    | GLM 5 Turbo, GLM 5.1, GLM 5.2, GLM 5V Turbo                                                                            |

AGI-01 Swift is visible as `needs-route` until a provider route is published
and validated. The other profiles have exact OpenRouter routes in the bootstrap
snapshot. At startup, credentials still determine whether those routes are
playable. An unavailable route must fail closed; the application never silently
substitutes another model.

SVG-only generators and Design Arena's Builders/Agents are intentionally not
fed through the text-and-tool harness. They require different artifacts,
actions, accounting, and verifiers. Design Arena itself separates Models,
Builders, and Agents in its [product model](https://docs.designarena.ai/introduction).

## Fairness boundary

Each model profile creates a separate arena containing the exact provider,
model route, reasoning mode, tool contract, adapter version, price version, and
sandbox digest. Scores from different model tokenizers are never placed on the
same leaderboard.

The direct GPT-5.6 Terra profile is the only ranked profile in this release.
OpenRouter profiles are practice-only until Prompt Gym has a durable
provider-call reconciliation journal, cancellation-without-usage quarantine,
and a stored provider/config digest. This is a scoring-integrity gate, not a UI
restriction.

The OpenRouter harness:

- pins one exact model and one exact provider endpoint and disables fallback routing;
- requires the complete request parameter set and executes returned tool calls sequentially;
- derives `max_tokens` from the remaining covered balance and sends frozen `max_price` ceilings;
- asks upstream providers to deny data collection;
- sends only a privacy-preserving user identifier;
- keeps native tool continuations ephemeral;
- records provider-reported native token counts and total account cost; and
- treats network, cancellation, and upstream server failures as ambiguous, without blind
  retries.

Thinking profiles request medium reasoning and retain returned raw or signed
reasoning blocks only in the in-memory native continuation required for a tool
result. Those blocks are never written to events, prompts, usage rows, replays,
or exports. Standard profiles record provider-default reasoning rather than
claiming that reasoning was disabled when a model makes it mandatory.

Design Arena changes often, as its
[changelog](https://www.designarena.ai/changelog) demonstrates. Catalog updates
must create reviewed, dated snapshots. A changed route or resolved model creates
a new Prompt Gym arena rather than mutating an existing season.
