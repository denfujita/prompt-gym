# Repository guidance

- Keep all hidden fixtures, seeds, expected answers, and verifier implementation out of this public repository.
- Treat provider-reported usage as authoritative for competition scoring; never estimate leaderboard tokens in the browser.
- Preserve strict server authority: user text is always a user-role input and the browser never calls verifiers directly.
- Store visible messages, tool activity, and encrypted continuity only. Never persist or display private chain-of-thought.
- Every model, challenge, verifier, tool schema, sandbox image, and price change creates a new arena version.
- Run `npm run typecheck`, `npm test`, and `npm run build` before publishing changes.
