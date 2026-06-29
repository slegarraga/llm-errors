# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.8] - 2026-06-29

### Fixed

- The npm package page showed a broken "resource not found" downloads badge after the self-hosted badge JSON was removed. The README now uses shields.io's native `npm/dm` badge, which renders the live download count directly on npm.

## [0.1.7] - 2026-06-12

### Fixed

- Header probing no longer fails when a header container's `get` method or
  iterator throws; lookup falls through to the remaining container shapes.
- A deliberate caller cancellation (the OpenAI SDK's `APIUserAbortError`) is
  no longer classified as a retryable timeout.

## [0.1.6] - 2026-06-11

### Changed

- Published README download badge updates so the npm package page shows the refreshed 30-day download badge.

## [0.1.5] - 2026-06-07

### Added

- Added fixtures for direct provider error bodies, generic HTTP `Retry-After`
  handling, OpenAI billing hard-limit errors, Anthropic billing errors and
  Gemini quota/billing exhaustion.
- Added fixtures for mixed billing/rate-limit signals, generic non-retryable
  `Retry-After` headers and Gemini rate-bucket quota exhaustion.

### Changed

- Preserve `Retry-After` / `retry-after-ms` delays for provider-unknown HTTP
  errors.
- Detect direct provider error bodies, case-insensitive `Map` headers and common
  Node-style numeric or array header values.
- Classify more provider code/type strings without requiring an HTTP status,
  including quota, permission, not-found, timeout, overload and server failures.
- Only expose provider retry delays on retryable normalized errors, validate
  HTTP status candidates and reject invalid retry delay values.

## [0.1.4] - 2026-06-05

### Added

- Added a public provider error fixture corpus for OpenAI, Anthropic, Gemini and
  transport-level failures, covering SDK-like objects, parsed fetch responses
  and expected normalized outputs.
- Added fixture-driven regression tests and published `fixtures/` in the npm
  package.

## [0.1.3] - 2026-06-04

### Changed

- Updated vulnerable development tooling and added CodeQL, OpenSSF Scorecard,
  pinned GitHub Actions, least-privilege workflow permissions, Dependabot config
  and a Scorecard README badge.

## [0.1.2] - 2026-06-04

### Changed

- Published README package-status badges, download visibility and release notes
  to the npm package page.

## [0.1.1] - 2026-06-03

### Changed

- Added OpenAI-compatible provider keywords for DeepSeek, Groq and OpenRouter
  discovery in npm and package metadata.

## [0.1.0] - 2026-06-03

### Added

- `normalizeError(error, options?)` — classify OpenAI, Anthropic and Gemini
  errors into a single `NormalizedError` shape with `provider`, `category`,
  `retryable` and `retryAfterMs`.
- `isRetryableError(error, options?)` convenience wrapper.
- `getRetryDelayMs(error, attempt, options?)` — respects provider-supplied
  `Retry-After` and otherwise applies exponential backoff with jitter.
- `parseRetryAfter` and `parseGoogleRetryDelay` low-level helpers.
- Provider auto-detection with an explicit `{ provider }` override.
- Transport-level error detection (timeouts, `ECONNRESET`, `AbortError`, DNS
  failures) classified as retryable `timeout` / `server_error`.
- Header parsing for `Headers` instances, plain objects, `Map`s and `[k, v]`
  pair arrays.
- Zero runtime dependencies; ESM + CJS builds with type declarations.

[Unreleased]: https://github.com/slegarraga/llm-errors/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/slegarraga/llm-errors/releases/tag/v0.1.4
[0.1.3]: https://github.com/slegarraga/llm-errors/releases/tag/v0.1.3
[0.1.2]: https://github.com/slegarraga/llm-errors/releases/tag/v0.1.2
[0.1.1]: https://github.com/slegarraga/llm-errors/releases/tag/v0.1.1
[0.1.0]: https://github.com/slegarraga/llm-errors/releases/tag/v0.1.0
