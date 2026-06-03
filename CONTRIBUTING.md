# Contributing to llm-errors

Thanks for taking the time to contribute. This project aims to be a small,
dependable, zero-dependency building block, so the bar for changes is clarity
and correctness over breadth.

## Getting started

```sh
git clone https://github.com/slegarraga/llm-errors.git
cd llm-errors
npm install
```

## Development workflow

Every change should keep the full check suite green:

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run build       # tsup (ESM + CJS + types)
npm run format      # prettier --write
```

Run `npm run test:watch` while developing.

## Pull requests

1. Fork the repo and create a branch from `main` (e.g. `fix/gemini-retry-info`).
2. Add or update tests. New behaviour without a test will not be merged.
3. Make sure `typecheck`, `lint`, `test` and `build` all pass.
4. Keep the public API surface small and documented with JSDoc.
5. Open a pull request and describe the provider error shape you are handling.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Examples:

```
feat(gemini): map FAILED_PRECONDITION to invalid_request
fix(openai): prefer retry-after-ms over retry-after
docs: document the retryable categories
test: cover Headers instances as a header container
chore: bump dev dependencies
```

The type drives the next version bump (`fix` -> patch, `feat` -> minor, a
`!` or `BREAKING CHANGE` footer -> major).

## Reporting bugs

Open an issue with a minimal reproduction: the raw error object your client
threw (status, headers, body), which provider it came from, and the
`NormalizedError` you expected. A failing test case is the most useful form a
bug report can take.

## Scope and philosophy

- Zero runtime dependencies. A dependency needs an exceptional justification.
- `normalizeError` is total: it never throws, on any input. Unrecognized values
  return `{ provider: 'unknown', category: 'unknown', retryable: false }`.
- Classification is grounded in official provider documentation and SDK error
  shapes. When you add or change a rule, link the source in the PR.
