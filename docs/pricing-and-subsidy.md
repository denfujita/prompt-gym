# API pricing and alpha subsidy

The first arena freezes the `terra-2026-07-12` catalog. Changing any rate creates a new arena; historical usage is never repriced.

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

Before each call, the server atomically reserves the run's remaining worst-case allowance. It settles against provider-reported usage and releases unused credit. An ambiguous completion is conservatively charged against the full reservation until reconciled; it can never produce a ranked score.

Alpha limits are $0.25 per run, three daily energy passes and $0.75 per account per day, plus a $100 global UTC-day circuit breaker. The UI labels actual spend as “covered by Prompt Gym”; players cannot buy additional attempts in v1.

Sources: [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model) and [OpenAI API pricing](https://developers.openai.com/api/docs/pricing).
