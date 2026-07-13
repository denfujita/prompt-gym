# API pricing and alpha subsidy

The first ranked arena freezes the `terra-2026-07-12` catalog. Changing any rate creates a new arena; historical usage is never repriced.

| Usage category              | Frozen rate | Nano-USD per token |
| --------------------------- | ----------: | -----------------: |
| Input                       |  $2.50 / 1M |              2,500 |
| Cached input                |  $0.25 / 1M |                250 |
| Cache write                 | $3.125 / 1M |              3,125 |
| Output, including reasoning | $15.00 / 1M |             15,000 |

The competition score is the sum of the provider's `usage.total_tokens`. Cached tokens retain their full token count for fair competition. The subsidy ledger separately uses the frozen discounted rates:

```text
actual_cost =
  (input_tokens - cached_input_tokens) * input_rate
  + cached_input_tokens * cached_rate
  + cache_write_tokens * cache_write_rate
  + output_tokens * output_rate
```

Before each call, the server atomically reserves the run's remaining worst-case allowance. It computes a conservative prompt-token ceiling from the complete server-owned request, adds provider-template headroom, and derives that call's maximum output tokens from the reserved balance and frozen route prices. OpenRouter also receives the frozen per-token `max_price`, so a rate above the reviewed ceiling fails closed. The server settles against provider-reported usage and releases unused credit. An ambiguous completion—including an unresolved cancellation—is conservatively charged against the full reservation and closes the covered run. A defensive provider overrun is still recorded in full and trips subsequent budget admission; real spend is never released merely because it exceeded the estimate.

OpenRouter practice profiles record native `prompt_tokens`, `completion_tokens`, cached/cache-write/reasoning details, and total account cost under the frozen `openrouter-reported-2026-07-13` accounting version. Upstream inference cost is not accepted as a substitute for the account charge. Missing cost or usage fails conservatively. These profiles do not enter ranked token boards until provider-call reconciliation is durable; each still has its own exact-model-and-endpoint practice arena because tokenizers and endpoint configurations are not comparable.

Alpha limits are $0.25 per run, three daily energy passes and $0.75 per account per day, plus a $100 global UTC-day circuit breaker. The UI labels actual spend as “covered by Prompt Gym”; players cannot buy additional attempts in v1.

Sources: [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model) and [OpenAI API pricing](https://developers.openai.com/api/docs/pricing).
