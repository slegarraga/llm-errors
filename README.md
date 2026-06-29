# llm-errors

[![npm version](https://img.shields.io/npm/v/llm-errors.svg)](https://www.npmjs.com/package/llm-errors)
[![npm downloads](https://img.shields.io/npm/dm/llm-errors?logo=npm&label=downloads)](https://www.npmjs.com/package/llm-errors)
[![CI](https://github.com/slegarraga/llm-errors/actions/workflows/ci.yml/badge.svg)](https://github.com/slegarraga/llm-errors/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/slegarraga/llm-errors/badge)](https://scorecard.dev/viewer/?uri=github.com/slegarraga/llm-errors)
[![license](https://img.shields.io/npm/l/llm-errors.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![install size](https://packagephobia.com/badge?p=llm-errors)](https://packagephobia.com/result?p=llm-errors)
[![bundle size](https://img.shields.io/bundlephobia/minzip/llm-errors?label=min%2Bgzip)](https://bundlephobia.com/package/llm-errors)

> One normalized error shape for OpenAI, Anthropic, Gemini and Vercel AI SDK: category, retryable flag, and provider-supplied retry delay. Zero dependencies.

Every LLM provider fails differently. OpenAI nests `{ error: { type, code, param } }`, Anthropic wraps `{ type: "error", error: { type } }`, Gemini speaks Google RPC status strings, and each puts retry hints in a different place. Generic HTTP failures add their own wrinkles with status-only errors and `Retry-After` headers. `llm-errors` collapses all of that into a single, predictable object so your retry and error-handling code stays provider-agnostic.

```ts
import { normalizeError, getRetryDelayMs } from 'llm-errors';

try {
  await client.chat.completions.create(params);
} catch (err) {
  const e = normalizeError(err);
  // -> { provider: 'openai', category: 'rate_limit', retryable: true, retryAfterMs: 2000, ... }

  if (e.category === 'context_length_exceeded') trimHistory();
  else if (e.retryable) await sleep(getRetryDelayMs(e, attempt));
  else throw err;
}
```

## Why

- **One `switch`, not three.** A `rate_limit` is a `rate_limit` whether it came from OpenAI's `code`, Anthropic's `type`, or Gemini's `RESOURCE_EXHAUSTED`.
- **Correct retry decisions.** `insufficient_quota` and `context_length_exceeded` look like other 4xx/429s but are _not_ worth retrying. `llm-errors` separates them out.
- **Honours `Retry-After` safely.** Reads the `Retry-After` header (seconds _or_ HTTP date), `retry-after-ms`, and Google's `RetryInfo.retryDelay` for retryable errors, then falls back to exponential backoff with jitter when none is given.
- **Never throws.** Feed it an SDK error, a raw `fetch` response, plain JSON, `null`, or a string, and it always returns a `NormalizedError`.
- **Transport errors too.** Connection timeouts, resets and DNS failures (`ETIMEDOUT`, `ECONNRESET`, `AbortError`, ...) have no HTTP status, yet they are retryable. `llm-errors` classifies them as `timeout` / `server_error` instead of dropping them.
- **Zero dependencies**, ESM + CJS, fully typed.

## Why not X?

**axios-retry / got / p-retry:** These retry HTTP calls generically. They know nothing about `insufficient_quota` (billing exhausted, never retryable) vs `rate_limit` (transient, should retry), so they will happily burn your quota retrying deterministic failures. `llm-errors` makes that distinction explicit, per provider.

**SDK built-in retries (openai `maxRetries`, Anthropic SDK auto-retry):** These help for simple cases but cannot be turned off per-error-type and do not give you the normalized error object for logging, alerting, or custom branching (`context_length_exceeded` needs to trim history, not retry).

**Rolling your own:** You end up writing the same per-provider shape inspection three times, getting the `Retry-After` parsing edge cases wrong (HTTP date format, millisecond header, Google proto format), and missing transport-level errors that carry no status code at all.

## Install

```sh
npm install llm-errors
```

## Integrations

Drop `normalizeError` into your existing SDK calls with no structural change. The three snippets below show the pattern once each; the branching logic is identical across all of them.

### OpenAI SDK

```ts
import OpenAI from 'openai';
import { normalizeError, getRetryDelayMs } from 'llm-errors';

const client = new OpenAI();

async function chat(prompt: string, attempt = 0): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content ?? '';
  } catch (err) {
    const e = normalizeError(err); // provider auto-detected as 'openai'
    if (e.category === 'context_length_exceeded')
      throw new Error('Prompt too long');
    if (e.retryable && attempt < 4) {
      await new Promise((r) => setTimeout(r, getRetryDelayMs(e, attempt)));
      return chat(prompt, attempt + 1);
    }
    throw err;
  }
}
```

### Anthropic SDK

```ts
import Anthropic from '@anthropic-ai/sdk';
import { normalizeError, getRetryDelayMs } from 'llm-errors';

const client = new Anthropic();

async function generate(prompt: string, attempt = 0): Promise<string> {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return msg.content.find((b) => b.type === 'text')?.text ?? '';
  } catch (err) {
    const e = normalizeError(err); // provider auto-detected as 'anthropic'
    if (e.retryable && attempt < 4) {
      await new Promise((r) => setTimeout(r, getRetryDelayMs(e, attempt)));
      return generate(prompt, attempt + 1);
    }
    throw err;
  }
}
```

### Vercel AI SDK

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { normalizeError, getRetryDelayMs } from 'llm-errors';

async function run(prompt: string, attempt = 0): Promise<string> {
  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
    });
    return text;
  } catch (err) {
    const e = normalizeError(err, { provider: 'openai' }); // hint the provider when wrapping Vercel AI SDK errors
    if (e.retryable && attempt < 4) {
      await new Promise((r) => setTimeout(r, getRetryDelayMs(e, attempt)));
      return run(prompt, attempt + 1);
    }
    throw err;
  }
}
```

> When using the Vercel AI SDK, the underlying SDK error shape may differ from the raw OpenAI/Anthropic SDK shape. Passing `{ provider }` as a hint improves detection accuracy.

Security posture is tracked in [docs/security-posture.md](./docs/security-posture.md),
including CodeQL, OpenSSF Scorecard, Dependabot and branch rules.

## Fixture corpus

The npm package includes a public fixture corpus under
[`fixtures/`](./fixtures/README.md). It pairs raw SDK-like, fetch-like and
transport-level provider errors with the normalized output expected from
`normalizeError`.

These fixtures are useful for downstream regression tests when you want to
verify provider-portable retry and error handling without importing OpenAI,
Anthropic or Gemini SDKs.

## API

### `normalizeError(error, options?) => NormalizedError`

Classifies any value into:

```ts
interface NormalizedError {
  provider: 'openai' | 'anthropic' | 'gemini' | 'unknown';
  category: ErrorCategory;
  message: string;
  status?: number; // HTTP status, when available
  code?: string; // provider-specific code / type
  retryable: boolean;
  retryAfterMs?: number; // provider-supplied delay for retryable errors, if any
  raw: unknown; // the original input
}
```

The provider is auto-detected from SDK errors, parsed fetch envelopes and direct provider error bodies. Pass `{ provider }` to force it when you already know which client threw or the shape is ambiguous:

```ts
normalizeError(err, { provider: 'anthropic' });
```

Unknown providers still get safe status-based behavior. For example, a plain
`{ status: 503, headers: { "Retry-After": "4" } }` normalizes to
`provider: "unknown"`, `category: "overloaded"`, `retryable: true` and
`retryAfterMs: 4000`. A non-retryable unknown status ignores the same header.

### `ErrorCategory`

| Category                  | Retryable | Typical cause                               |
| ------------------------- | :-------: | ------------------------------------------- |
| `authentication`          |    no     | Missing / invalid API key (401)             |
| `permission`              |    no     | Key valid but not allowed (403)             |
| `rate_limit`              |  **yes**  | Too many requests (429)                     |
| `insufficient_quota`      |    no     | Billing / credits exhausted (429)           |
| `context_length_exceeded` |    no     | Prompt + completion over the context window |
| `request_too_large`       |    no     | Payload too large (413)                     |
| `invalid_request`         |    no     | Malformed request (400 / 422)               |
| `not_found`               |    no     | Unknown model or resource (404)             |
| `content_filter`          |    no     | Blocked by a safety policy                  |
| `timeout`                 |  **yes**  | Request / upstream timeout (504)            |
| `server_error`            |  **yes**  | Upstream failure (500)                      |
| `overloaded`              |  **yes**  | Provider temporarily overloaded (503 / 529) |
| `unknown`                 |    no     | Could not be classified                     |

Only `rate_limit`, `server_error`, `overloaded` and `timeout` are retryable.
`unknown` is deliberately not retryable, so unrecognized shapes fail closed
instead of causing accidental retry storms.

### `isRetryableError(error, options?) => boolean`

Shorthand for `normalizeError(error).retryable`.

### `getRetryDelayMs(error, attempt, options?) => number`

Returns the delay to wait before the next attempt. Non-retryable errors return `0`. If the provider supplied a valid `retryAfterMs`, that wins. Otherwise it computes exponential backoff `baseMs * 2 ** attempt`, capped at `maxMs`, with full jitter by default.

```ts
getRetryDelayMs(e, attempt, { baseMs: 500, maxMs: 60_000, jitter: 'full' });
```

### `parseRetryAfter` / `parseGoogleRetryDelay`

The low-level helpers, exported for advanced use.

## Example: a provider-agnostic retry loop

```ts
import { normalizeError, getRetryDelayMs } from 'llm-errors';

async function withRetries<T>(call: () => Promise<T>, max = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const e = normalizeError(err);
      if (!e.retryable || attempt >= max) throw err;
      await new Promise((r) => setTimeout(r, getRetryDelayMs(e, attempt)));
    }
  }
}
```

## Related

- [`json-from-llm`](https://www.npmjs.com/package/json-from-llm): extract valid JSON from an LLM response, even inside reasoning tags, fenced blocks or prose
- [`tool-schema`](https://www.npmjs.com/package/tool-schema): convert a JSON Schema into a provider tool / function-calling schema for OpenAI, Anthropic, Gemini and MCP
- [`llm-sse`](https://www.npmjs.com/package/llm-sse): parse streaming SSE from LLM providers into typed, provider-agnostic events
- [`llm-messages`](https://www.npmjs.com/package/llm-messages): convert chat messages between OpenAI, Anthropic and Gemini formats

## License

MIT © Sebastian Legarraga
