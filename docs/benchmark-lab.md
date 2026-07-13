# Benchmark Lab product and system contract

## Status

The `/benchmarks` experience is currently a scripted product preview. It calls no model or GPU, and the text a visitor enters is displayed only; each turn advances a fixed walkthrough. The contracts in this repository are forward-compatible scaffolding. No result in the preview is a real KernelBench or Prompt Gym benchmark result.

## Why this is a separate mode

Daily Gym asks a model to reach one exact terminal reward and ranks a solve by fewer provider-reported tokens. Benchmark Lab allows repeated artifact evaluations and asks how far a coach can push a pinned model under a fixed budget.

The first collection is **Kernel Sprint**:

- The model receives the complete task brief and is the only actor allowed to edit or run code.
- The player can only coach, inspect visible activity, and choose whether another iteration is worth its tokens.
- A frozen candidate must compile and pass every hidden correctness case before performance is measured.
- The best eligible candidate remains available if a later experiment is worse.
- Ranked runs end when the player finalizes or reaches the prompt, token, time, evaluation, or spend limit.

Patch Sprint and Bot Arena are research tracks only. They do not launch until task rights, deterministic graders, calibration, and anti-cheat reviews pass.

## Daily Kernel Sprint score

Prompt Gym uses stable single-task bands so tiny timing variance does not decide the board:

| Result     | Requirement                                     |
| ---------- | ----------------------------------------------- |
| Ineligible | Any correctness case fails                      |
| Bronze     | Correct and below `1.00x` reference performance |
| Silver     | Correct and at least `1.00x`                    |
| Gold       | Correct and at least `2.00x`                    |

Rank the highest band first, then fewer cumulative provider-reported tokens at the candidate checkpoint. Equal band and token totals share rank. Exact speedup is shown as diagnostic information, not used as a hidden tie-breaker. A separate exact-performance exhibition board can be added later if measurement stability supports it.

These are Prompt Gym bands, not official KernelBench metrics. KernelBench's `fast_p` measures the share of a task suite that is correct and faster than a threshold, so Prompt Gym should report `fast_0`, `fast_1`, and `fast_2` only for a complete season or suite aggregate. See the [official KernelBench repository](https://github.com/ScalingIntelligence/KernelBench), [paper](https://arxiv.org/abs/2502.10517), and [evaluation guidance](https://github.com/ScalingIntelligence/KernelBench/blob/main/EVAL.md).

## Evaluation lifecycle

1. A model turn produces or modifies a candidate artifact.
2. `evaluate_kernel` canonicalizes the candidate, rejects unsafe files, stores it immutably, and enqueues an evaluation. This is non-terminal.
3. A fresh GPU job compiles it, runs hidden randomized correctness cases, and only then times reference and candidate.
4. The worker appends visible `evaluation.queued`, `evaluation.started`, and `evaluation.completed` events and records the token checkpoint at which that candidate existed.
5. The player may coach another turn. The server retains the best eligible evaluation by the published comparator.
6. `finalize_kernel`, or automatic budget exhaustion, independently reruns the selected candidate in a fresh environment before creating the terminal leaderboard entry.

Provider calls keep the existing no-blind-retry rule. GPU evaluation jobs are safe to retry after preemption because they use the evaluation ID, frozen candidate hash, purpose, and evaluator profile as an idempotency key. A final or audit rerun receives a new evaluation ID so it never overwrites the original measurement.

## Operational storage

Existing `attempt`, `turn`, `run_event`, `usage_item`, consent, and replay records remain authoritative for human/model lineage. Ranked release also depends on the target prompt vault in [prompt-storage.md](prompt-storage.md). The benchmark storage target adds two projections:

The evaluator may return only a schema-validated, correctness-discriminated measurement. It cannot supply the turn ID, evaluation ID, eligibility, tier, or token checkpoint; trusted core code derives and stamps those fields from persisted provider usage. Until that core state machine exists, public challenge listing filters benchmark manifests, attempt creation rejects them, and the `EpisodeV1` exporter fails closed.

```text
benchmark_evaluation
  id, attempt_id, turn_id, candidate_artifact_id
  purpose (candidate | final | audit), job_key UNIQUE
  status, eligible, tier, correctness_passed, correctness_total
  score_metric, score_value_int, reference_latency_ns, candidate_latency_ns
  competition_tokens_at_candidate
  evaluator_profile_digest, environment_digest, measurement_digest
  public_feedback, private_result_key, created_at, completed_at
  INDEX(attempt_id, candidate_artifact_id, evaluator_profile_digest)

benchmark_leaderboard_entry
  attempt_id PRIMARY KEY, evaluation_id, arena_id, challenge_slug, instance_id
  public_handle, tier_sort_key, competition_tokens, assisted, provisional
  finalized_at
```

Candidate source archives and public reports go to immutable object storage by SHA-256. Raw samples, hidden inputs, compiler logs that leak fixtures, and independent rerun details remain private. PostgreSQL stores references and digests, not large artifact bodies.

The leaderboard query must scope entries to the exact model, reasoning/tool configuration, benchmark source commit and task, challenge version, workload instance, evaluator/executor images, GPU model, driver, CUDA, PyTorch, Triton, precision, baseline method, and scoring-spec digest. Any change creates a new arena.

## Dedicated GPU path

Benchmark evaluation does not share the model-call worker queue:

```text
prompt-gym-runs      -> model/tool worker
prompt-gym-gpu-evals -> private evaluator coordinator -> networkless GPU sandbox
```

The API reserves token spend before model calls and GPU spend before evaluation admission. A ranked run starts only when its pinned GPU capacity is available, so queue delay does not consume the player's clock.

Every evaluation uses a secretless image, no outbound network, an ephemeral filesystem, a fresh process, synchronized launches, warmups, interleaved reference/candidate batches, and median-of-batches timing. The coordinator fails closed if the resolved GPU, driver, or software digest differs from the arena. Top and suspicious scores remain provisional until an independent rerun passes.

Release tests must cover input mutation, output aliasing, deferred asynchronous work, guard-buffer corruption, harness patching, reference imports, package installation, network/cloud metadata access, cross-evaluation state, excessive memory, crashes, and timeouts.

## Provenance and data use

An upstream KernelBench task must record its pinned commit, task identifier, and license and must be reported as an unofficial Prompt Gym run. A product-owned task that only follows the harness pattern must be labeled KernelBench-inspired, never presented as an upstream score.

Public challenge manifests use only `public_benchmark_practice`. Exposed tasks, prompts, artifacts, or replays are contaminated practice data and never become sealed evaluation. Sealed compatible tasks and their classification live only in private systems and are offered through hosted evaluation.

Benchmark research exports use `EpisodeV2`, adding candidate hashes, every evaluation and token checkpoint, exact environment and measurement digests, the selected final candidate, rights/provenance fields, and correctness/performance trajectory. They remain separate from the initial Grade-A Puzzle/Build package unless a buyer explicitly requests public-practice data and its data card makes that limitation clear.

## Ranked-launch gate

Do not enable live ranked play until the GPU queue, durable evaluation tables, immutable artifact store, hidden-case service, independent final rerun, spend reservation, prompt-vault migration, environment attestation, and security suite are implemented and audited.
