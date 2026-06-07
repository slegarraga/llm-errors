import {
  baseCategoryFromStatus,
  firstHeader,
  type Classification,
  type ProviderContext,
} from '../classify.ts';
import { firstString } from '../internal.ts';
import { parseRetryAfter } from '../retry.ts';
import type { ErrorCategory } from '../types.ts';

const OPENAI_CODES = new Set([
  'billing_hard_limit_reached',
  'billing_not_active',
  'context_length_exceeded',
  'content_filter',
  'content_policy_violation',
  'insufficient_quota',
  'invalid_api_key',
  'model_not_found',
  'rate_limit_exceeded',
]);

function includesAny(
  haystack: string,
  needles: ReadonlyArray<string>,
): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

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
  return code !== undefined && OPENAI_CODES.has(code);
}

export function classify(ctx: ProviderContext): Classification {
  const body = ctx.body ?? {};
  const type = firstString(body.type);
  const code = firstString(body.code);
  const message = firstString(body.message) ?? '';
  const identifier = `${type ?? ''} ${code ?? ''} ${message}`.toLowerCase();

  let category: ErrorCategory = baseCategoryFromStatus(ctx.status);

  if (
    identifier.includes('context_length') ||
    identifier.includes('context window')
  ) {
    category = 'context_length_exceeded';
  } else if (
    includesAny(identifier, [
      'insufficient_quota',
      'billing_hard_limit',
      'billing_not_active',
      'exceeded your current quota',
    ])
  ) {
    category = 'insufficient_quota';
  } else if (
    includesAny(identifier, [
      'content_filter',
      'content_policy',
      'safety_policy',
    ])
  ) {
    category = 'content_filter';
  } else if (
    code === 'invalid_api_key' ||
    includesAny(identifier, ['authentication', 'unauthorized'])
  ) {
    category = 'authentication';
  } else if (includesAny(identifier, ['permission', 'forbidden'])) {
    category = 'permission';
  } else if (includesAny(identifier, ['not_found', 'model_not_found'])) {
    category = 'not_found';
  } else if (includesAny(identifier, ['timeout', 'timed out'])) {
    category = 'timeout';
  } else if (includesAny(identifier, ['overload', 'unavailable'])) {
    category = 'overloaded';
  } else if (includesAny(identifier, ['server_error', 'api_error'])) {
    category = 'server_error';
  } else if (identifier.includes('rate_limit')) {
    category = 'rate_limit';
  } else if (category === 'unknown' && identifier.includes('invalid_request')) {
    category = 'invalid_request';
  }

  const retryAfterMs =
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after-ms'), 'ms') ??
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after'));

  return { category, code: code ?? type, retryAfterMs };
}
