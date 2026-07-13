# Data governance and lab exports

## Separate permissions

Prompt Gym records three independently versioned choices:

1. Required operational processing to execute and score a run.
2. Optional, unchecked commercial research and training contribution.
3. Optional, unchecked public replay and profile publication.

The free subsidy is not conditional on either optional choice. Withdrawal is as easy as opt-in.

## Lifecycle

The lifecycle below is the ranked-release policy. The current alpha has consent-aware account deletion and export redaction, but raw prompts are still duplicated in PostgreSQL and do not yet have application-level field encryption or automated 30-day expiry. Public replay is therefore owner-only even with publication consent. The prompt vault and replay redaction pipeline in [prompt-storage.md](prompt-storage.md) are ranked-release gates.

- Raw trajectories enter encrypted quarantine for no more than 30 days.
- Secret, PII, path, URL, and near-duplicate scanners produce explicit redaction and quality records.
- Only consented Grade-A episodes with complete event chains, deterministic replay, clean task rights, and no unresolved integrity flags enter a release.
- Gameplay, internal-development, and sealed-evaluation pools are split by generator-template cluster at 60/20/20.
- Exposed gameplay instances are never later claimed as sealed evaluation. Public replays and training exports permanently retire the instance.
- Sealed evaluation instances are hosted, never delivered, and are burned and replaced after external exposure.

## EpisodeV1

An export carries task/version hashes, arena configuration, ordered human/model/tool/verifier events, provider usage, frozen cost, artifacts, outcome, baseline linkage, provenance, quality flags, consent, and deletion state. It excludes account identifiers, IP/device data, hidden seeds, private fixtures, verifier source, and private reasoning.

Releases are immutable JSONL and Parquet snapshots with checksums, manifests, data cards, provenance and contamination reports, rights memos, and additive tombstone files. Prompt Gym describes results as observed human steering lift, not causal uplift or guaranteed human authorship.

## Benchmark practice data

Any benchmark task, prompt, artifact, result, or replay exposed through gameplay is labeled `public_benchmark_practice`. It may be useful for studying human steering on known tasks, but it is never described as sealed, uncontaminated, or Grade-A evaluation data and does not enter the initial Puzzle/Build design-partner package by default.

Sealed benchmark-compatible instances, templates, and pool classification remain private and are offered only through hosted evaluation. Public manifests never advertise sealed membership. Benchmark trajectory exports use a versioned `EpisodeV2` schema with candidate hashes, evaluation lineage, token checkpoints, exact environment and measurement digests, selected-best linkage, and task-license provenance.
