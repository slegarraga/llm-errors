# Provider Error Fixtures

This corpus contains redacted, synthetic examples of provider error shapes that
`llm-errors` supports. The files are intentionally small JSON fixtures so they
can be reused by downstream test suites without importing any provider SDK.

## Layout

- `cases/` contains raw SDK-like, fetch-like and transport-level inputs.
- `expected/` contains the normalized output for the matching case path.

For example, `cases/openai/sdk-rate-limit.json` is paired with
`expected/openai/sdk-rate-limit.json`.

## Scope

The corpus covers:

- OpenAI SDK `APIError`-style objects and parsed fetch responses.
- Anthropic SDK envelopes and parsed fetch responses.
- Gemini / Google RPC error envelopes.
- Transport failures such as Node timeout codes and browser abort errors.

The fixtures are not recordings of private traffic and do not contain API keys,
request IDs, account IDs or user content.
