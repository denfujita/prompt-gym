# Research basis for challenge design

Prompt Gym borrows evaluation patterns, not benchmark questions, fixtures, or solutions.

## Interactive hidden dynamics

ARC-AGI-3 uses unfamiliar interactive environments, exact win states, and action-efficiency scoring. Official July 2026 results report GPT-5.6 Sol Max at 7.8% on ARC-AGI-3 versus 92.5% on ARC-AGI-2. Signal Vault adapts the exploration and hidden-dynamics pattern using entirely original mechanics and assets.

- [ARC-AGI-3 paper](https://arxiv.org/abs/2603.24621)
- [Official GPT-5.6 results](https://arcprize.org/results/openai-gpt-5-6)

## Multi-turn hidden rules

TurnBench-MS requires sequential guesses and structured feedback to uncover hidden rules. The paper reports 17.8% on its hardest mode versus 100% human performance. Prompt Gym uses the dynamic, feedback-driven pattern but does not use TurnBench's tasks or board-game materials.

- [TurnBench-MS](https://aclanthology.org/2025.findings-emnlp.1084/)

## Black-box behavioral recreation

ProgramBench evaluates whether agents can reproduce observable CLI behavior through an execution-only oracle and hidden tests. Clone the Gremlin uses an original program, interface, behavior family, and verifier.

- [ProgramBench](https://arxiv.org/abs/2605.03546)

## Synthetic ground truth

GeneBench-Pro demonstrates that synthetic data-generating processes can support deterministic evaluation of complex analysis while rejecting plausible but incorrect explanations. Rigged Race uses an original fictional domain and generator.

- [GeneBench-Pro](https://openai.com/index/introducing-genebench-pro/)

## Admission rule

Every challenge version must be procedurally original, commercially owned, deterministically verifiable, and empirically calibrated. A copied public brief should solve only 5–15% of at least 100 unguided target-model trials, while coached pilots should reach at least 60% within five prompts.
