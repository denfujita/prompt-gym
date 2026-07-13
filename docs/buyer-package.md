# Design-partner data package

Prompt Gym does not market a prompt dump. A pilot package is a reproducible set of consented human-steering episodes paired with objective outcomes and model-only baselines.

## Pilot contents

- 1,000–3,000 non-exclusive Grade-A episodes across all three challenge families.
- Canonical JSONL and normalized Parquet tables.
- Derived SFT conversations, same-instance preference pairs, and objective-reward trajectories with source lineage.
- Same-instance no-human baselines for every released instance; five replicates plus a generic iterative-agent baseline for a stratified 20% sample.
- Immutable manifest, checksums, schema, data dictionary, data card, provenance and contamination reports, consent-rights memo, redaction report, and tombstone delta.
- Hosted access to a separate sealed evaluator; private fixtures and verifier internals are never delivered.

Public benchmark-practice trajectories are excluded from the initial three-family Grade-A package by default. If a design partner requests them, they ship as a separately labeled `EpisodeV2` collection with task rights, upstream provenance, environment digests, and an explicit contamination report; they are never substituted for hosted sealed evaluation.

## Measurement language

Reports include observed steering lift, success-adjusted tokens to solve, turn-by-turn repair rate, conditional token savings, confidence intervals, and known selection effects. They do not claim causal uplift, guaranteed human authorship, anonymity, contamination-free exposed instances, guaranteed model improvement, or reversibility after model training.

## Commercial hypothesis

The initial discovery range is $50,000–$100,000 for a four-to-eight-week design-partner pilot, with inference compute passed through at cost. Any production pricing, exclusivity, or refresh commitment requires buyer discovery and legal review.
