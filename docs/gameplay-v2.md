# Gameplay v2: Puzzle and Build

Prompt Gym should begin with one decision, not a list of benchmark formats:

> **Same AI. Same challenge. Different coaches. Fewer tokens wins.**

The daily game has two lanes.

## Puzzle: solve a mystery with your AI

The player chooses what to investigate; the AI opens evidence, runs experiments, and submits the answer. The task surface should look like a case board rather than a tool log.

The first public Puzzle can use **Who Rigged the Race?** while the stronger narrative template is developed:

- Story hook: a result everyone accepts is wrong.
- Player verb: investigate.
- Visible progress: evidence inspected, hypotheses tested, answer slots still unknown.
- Exact win: submit the true winner, cheater, corrected advantage, and supporting evidence IDs.
- Finish: reveal the completed evidence chain and award a **Case Cracked** card.

The next generator template should be **The Museum Heist**: product-owned witness notes, access logs, camera gaps, and object records with generator-owned culprit, method, and evidence ground truth.

## Build: coach your AI to recreate something

The player compares a reference with a live artifact and tells the AI what to probe, build, or fix. The AI alone edits files, runs tests, and submits.

The existing **Copy the Gremlin** task remains a useful behavior-cloning Build. The first mass-consumer visual Build should be **Storefront Sprint**:

- Use a generated, product-owned marketplace reference rather than copying Amazon assets or branding.
- Desktop shows `Reference | Live build`; mobile uses tabs.
- Human-readable checks report facts such as `search works`, `cart works`, and `mobile header differs`.
- Exact win requires all interaction, DOM, accessibility, responsive, and anti-overlay checks plus a visual-difference score below a frozen threshold.
- Render in a pinned Chromium image with bundled fonts and fixed viewports so the visual result is reproducible.
- Finish with a reference/result wipe and a **Verified Build** card.

## Screen hierarchy

1. **Choose Puzzle or Build.** Each door explains the fantasy in one sentence.
2. **Understand the win.** Show `Your role`, `The AI can`, and `Verified when` before entry.
3. **See the task first.** Evidence or the artifact is the primary surface; technical activity is secondary and expandable.
4. **Coach one next move.** The composer asks what the AI should investigate or fix next.
5. **Watch truthful progress.** Show evidence viewed, checks passed, prompts remaining, and token spend without leaking correctness.
6. **Close the session.** Display the exact verifier, reward card, personal-best delta, and same-instance rank.

Challenge manifests keep the three audiences separate: `playerBrief` tells the story, `winCondition` states the exact badge condition, `actionBudgetLabel` names the real total task budget, and `brief` is the complete model instruction. The UI must never relabel the model brief as the player's win condition or infer a total budget from a per-turn tool cap.

## Competition and rewards

Prompt Gym pits coaches against coaches, not models against models. Every ranked comparison uses the same model, challenge version, hidden instance, tools, and sandbox image.

- Before entry, show one closed-season ghost score: `Score to beat: 2,489 tokens`.
- During play, show token spend against that target without revealing the other coach's prompts.
- After verification, show personal best first, exact-seed cohort second, and global placement third.
- Replays stay hidden until season close.
- Rewards are status-only and deterministic: **Case Cracked**, **Verified Build**, **Under Par**, and **Heat Leader**.

## DesignArena lessons

[DesignArena](https://www.designarena.ai/) succeeds by moving directly from a simple creative choice to a visible result. Its [documented tournament](https://www.designarena.ai/about) creates immediate closure and makes each action affect a public benchmark.

Prompt Gym borrows the short path to spectacle, clear categories, and visible session closure. It does not copy subjective voting, Elo or Bradley-Terry scoring, four simultaneous generations, prompt enhancement during ranked play, or immediate public prompts. Deterministic verification and iterative human coaching remain the product's core.
