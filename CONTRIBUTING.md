# Contributing

Open an issue before large product or protocol changes. Work on an `agent/<description>` branch and open a draft pull request.

Public changes must not contain hidden fixtures, generator parameters, expected answers, verifier logic, production secrets, or private challenge image references beyond immutable digests.

Before requesting review, run:

```bash
npm run typecheck
npm test
npm run build
```
