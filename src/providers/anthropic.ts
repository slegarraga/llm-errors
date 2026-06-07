import {
  baseCategoryFromStatus,
  firstHeader,
  type Classification,
  type ProviderContext,
} from '../classify.ts';
import { firstString } from '../internal.ts';
import { parseRetryAfter } from '../retry.ts';
import type { ErrorCategory } from '../types.ts';

const ANTHROPIC_TYPES: Record<string, ErrorCategory> = {
  authentication_error: 'authentication',
  permission_error: 'permission',
  not_found_error: 'not_found',
  request_too_large: 'request_too_large',
  rate_limit_error: 'rate_limit',
  invalid_request_error: 'invalid_request',
  api_error: 'server_error',
  overloaded_error: 'overloaded',
  billing_error: 'insufficient_quota',
  timeout_error: 'timeout',
};

/** Heuristic: does this error look like it came from the Anthropic API? */
export function matches(ctx: ProviderContext): boolean {
  if (
    firstHeader(
      ctx.headers,
      'anthropic-version',
      'anthropic-ratelimit-requests-limit',
      'anthropic-ratelimit-tokens-limit',
    ) !== undefined
  ) {
    return true;
  }
  const body = ctx.body;
  if (!body) {
    return false;
  }
  // `param` is an OpenAI-only field; its presence rules Anthropic out even
  // though both providers share type strings like `invalid_request_error`.
  if ('param' in body) {
    return false;
  }
  const type = firstString(body.type);
  return type !== undefined && type in ANTHROPIC_TYPES;
}

export function classify(ctx: ProviderContext): Classification {
  const body = ctx.body ?? {};
  const type = firstString(body.type);
  const message = (firstString(body.message) ?? '').toLowerCase();

  const mapped = type ? ANTHROPIC_TYPES[type] : undefined;
  let category: ErrorCategory = mapped ?? baseCategoryFromStatus(ctx.status);

  // Anthropic reports an over-long prompt as `invalid_request_error` with a
  // "prompt is too long" message rather than a dedicated type.
  if (
    category === 'invalid_request' &&
    (message.includes('prompt is too long') ||
      message.includes('maximum context') ||
      message.includes('context window'))
  ) {
    category = 'context_length_exceeded';
  } else if (
    message.includes('credit balance') ||
    message.includes('billing') ||
    message.includes('insufficient quota')
  ) {
    category = 'insufficient_quota';
  }

  const retryAfterMs =
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after-ms'), 'ms') ??
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after'));

  return { category, code: type, retryAfterMs };
}
