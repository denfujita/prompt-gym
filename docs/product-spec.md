# Prompt Gym MVP product contract

## Promise

Prompt Gym measures how efficiently a person can steer a fixed model to a deterministically verified outcome. The player can prompt, stop a running turn, inspect visible activity, and request another turn. The player cannot directly modify challenge state.

## Daily loop

1. An anonymous scripted tutorial teaches the prompt-only mechanic without spending API credits.
2. A signed-in adult chooses a **Puzzle** or **Build** lane and receives one ranked daily start for each featured task.
3. Starting a challenge fixes the arena, model configuration, hidden instance, price catalog, and six-turn budget.
4. Each model call streams visible messages and tool activity. Provider-reported usage increases the token odometer.
5. The first successful verification locks the ranked score. A hint places the run on the assisted board.
6. The player receives a deterministic **Case Cracked** or **Verified Build** reward and sees their exact-seed rank and delta from the cheapest verified solve.
7. Consented public replays unlock only after the seven-day season closes, the instance retires, and the replay passes the redaction pipeline. Until that pipeline ships, alpha replays stay owner-only.

## Score

`competition_tokens` is the sum of `usage.total_tokens` for eligible provider calls before the first successful verification. It includes system context, user prompts, history, image input, model output, reasoning, and tool-continuation calls. Cached input retains its full token count for competition; actual discounted cost is tracked separately.

Rankings never compare different challenge versions, instance seeds, resolved model snapshots, reasoning settings, tool schemas, or sandbox images. Equal token totals share rank; elapsed time is not a tie-breaker.

## Limits

- Six coaching prompts per ranked run.
- Eight model tool actions per turn.
- 20,000 competition tokens, ten minutes, or $0.25 actual API cost per run.
- One concurrent live run and three ranked starts per account per day.
- $0.75 per-account and $100 global daily alpha spend ceilings.

## Accessibility and healthy use

The product targets WCAG 2.2 AA, keyboard control, visible focus, semantic alternatives for every visual board, color-plus-symbol state, reduced motion, and batched screen-reader announcements. It has no cash prizes, loot boxes, punitive streaks, payment loop, infinite feed, or default notifications.
