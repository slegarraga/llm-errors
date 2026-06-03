import {
  baseCategoryFromStatus,
  isRetryableCategory,
  type Classification,
  type ProviderContext,
} from './classify.ts';
import {
  firstString,
  readErrorBody,
  readHeaders,
  readMessage,
  readStatus,
} from './internal.ts';
import * as anthropic from './providers/anthropic.ts';
import * as gemini from './providers/gemini.ts';
import * as openai from './providers/openai.ts';
import type { NormalizedError, NormalizeOptions, Provider } from './types.ts';

/**
 * Detection order is deliberate: Gemini's canonical RPC status string is the
 * most distinctive signal, then Anthropic's typed errors / headers, then
 * OpenAI (whose `param` field and headers are the remaining tell).
 */
const DETECTORS: ReadonlyArray<{
  name: Provider;
  matches: (ctx: ProviderContext) => boolean;
}> = [
  { name: 'gemini', matches: gemini.matches },
  { name: 'anthropic', matches: anthropic.matches },
  { name: 'openai', matches: openai.matches },
];

function detectProvider(ctx: ProviderContext): Provider {
  for (const detector of DETECTORS) {
    if (detector.matches(ctx)) {
      return detector.name;
    }
  }
  return 'unknown';
}

function classifyFor(provider: Provider, ctx: ProviderContext): Classification {
  switch (provider) {
    case 'openai':
      return openai.classify(ctx);
    case 'anthropic':
      return anthropic.classify(ctx);
    case 'gemini':
      return gemini.classify(ctx);
    default:
      return {
        category: baseCategoryFromStatus(ctx.status),
        code: firstString(ctx.body?.type, ctx.body?.code),
      };
  }
}

/**
 * Normalize an error thrown by an OpenAI, Anthropic or Gemini client into a
 * single consistent {@link NormalizedError} shape.
 *
 * Accepts SDK error objects, raw `fetch` responses with a parsed body, or
 * plain JSON. It never throws: anything unrecognized comes back as
 * `{ provider: 'unknown', category: 'unknown', retryable: false }`.
 *
 * @example
 * ```ts
 * try {
 *   await client.messages.create(params);
 * } catch (err) {
 *   const e = normalizeError(err);
 *   if (e.retryable) await sleep(e.retryAfterMs ?? 1000);
 * }
 * ```
 */
export function normalizeError(
  error: unknown,
  options: NormalizeOptions = {},
): NormalizedError {
  const ctx: ProviderContext = {
    status: readStatus(error),
    headers: readHeaders(error),
    body: readErrorBody(error),
  };

  const provider = options.provider ?? detectProvider(ctx);
  const classification = classifyFor(provider, ctx);

  return {
    provider,
    category: classification.category,
    message: readMessage(error, ctx.body),
    status: ctx.status,
    code: classification.code,
    retryable: isRetryableCategory(classification.category),
    retryAfterMs: classification.retryAfterMs,
    raw: error,
  };
}

/**
 * Convenience wrapper around {@link normalizeError} that returns only whether
 * the error is worth retrying.
 */
export function isRetryableError(
  error: unknown,
  options: NormalizeOptions = {},
): boolean {
  return normalizeError(error, options).retryable;
}
