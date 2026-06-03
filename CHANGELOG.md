# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Header parsing for `Headers` instances, plain objects, `Map`s and `[k, v]`
  pair arrays.
- Zero runtime dependencies; ESM + CJS builds with type declarations.

[0.1.0]: https://github.com/slegarraga/llm-errors/releases/tag/v0.1.0
