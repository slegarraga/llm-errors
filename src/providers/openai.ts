import {
  baseCategoryFromStatus,
  firstHeader,
  type Classification,
  type ProviderContext,
} from '../classify.ts';
import { firstString } from '../internal.ts';
import { parseRetryAfter } from '../retry.ts';
import type { ErrorCategory } from '../types.ts';

/** Heuristic: does this error look like it came from the OpenAI API? */
export function matches(ctx: ProviderContext): boolean {
  if (
    firstHeader(
      ctx.headers,
      'openai-organization',
      'openai-version',
      'openai-processing-ms',
    ) !== undefined
  ) {
    return true;
  }
  const body = ctx.body;
  if (!body) {
    return false;
  }
  // OpenAI error objects carry a `param` field; Anthropic and Gemini do not.
  if ('param' in body) {
    return true;
  }
  const code = firstString(body.code);
  return (
    code === 'context_length_exceeded' ||
    code === 'insufficient_quota' ||
    code === 'invalid_api_key'
  );
}

export function classify(ctx: ProviderContext): Classification {
  const body = ctx.body ?? {};
  const type = firstString(body.type);
  const code = firstString(body.code);
  const identifier = `${type ?? ''} ${code ?? ''}`.toLowerCase();

  let category: ErrorCategory = baseCategoryFromStatus(ctx.status);

  if (
    identifier.includes('context_length') ||
    identifier.includes('context window')
  ) {
    category = 'context_length_exceeded';
  } else if (identifier.includes('insufficient_quota')) {
    category = 'insufficient_quota';
  } else if (
    identifier.includes('content_filter') ||
    identifier.includes('content_policy')
  ) {
    category = 'content_filter';
  } else if (
    code === 'invalid_api_key' ||
    identifier.includes('authentication')
  ) {
    category = 'authentication';
  } else if (category === 'unknown' && identifier.includes('rate_limit')) {
    category = 'rate_limit';
  }

  const retryAfterMs =
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after-ms'), 'ms') ??
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after'));

  return { category, code: code ?? type, retryAfterMs };
}
