# Security model

## Spend and identity

- Verified identity, CAPTCHA, one concurrent run, per-account and IP limits, atomic worst-case cost reservation, and global circuit breakers protect the subsidy. ASN-aware controls remain a ranked-release gate.
- Each OpenAI request receives a stable privacy-preserving safety identifier.
- Provider keys and storage credentials never reach the browser, model context, executor, challenge output, or verifier.

## Challenge isolation

- Executor and verifier use distinct identities, images, filesystems, and scoped inputs.
- Hosted execution denies outbound network, cloud metadata, host sockets, shared writable volumes, package installation, and unbounded processes.
- Paths are normalized; symlink traversal, oversized artifacts, unsafe Markdown/HTML, and unrecognized tools are rejected.
- The private service returns only coarse stable failure labels. Hidden assertions and expected values never enter visible events.

## Incident behavior

- A resolved model, tool schema, verifier, sandbox image, or price change must close the current arena. The worker rejects an observed model drift; automated arena-wide closure and verifier/tool-digest pinning remain ranked-release gates.
- Provider calls with ambiguous completion are never automatically retried. The alpha conservatively settles the reservation and closes the attempt; durable provider response-ID reconciliation remains a ranked-release gate.
- Fraud or nondeterminism marks a leaderboard entry provisional and rebuildable from the event ledger.
- Account deletion suppresses future operational use. Buyer-facing tombstone issuance and propagation must pass audit before the first dataset release; already-trained weights are never represented as reversible.
