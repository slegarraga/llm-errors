import { firstString, isObject } from './internal.ts';
import type { ErrorCategory } from './types.ts';

/**
 * Transport-level failures never reach an HTTP response, so they carry no
 * status code or provider body — yet most of them (timeouts, dropped
 * connections, DNS hiccups) are very much worth retrying. This recognizes
 * them from the Node `code`, the `name`, or the SDK error class name.
 */

/** Node `error.code` values that mean "the connection failed; try again". */
const RETRYABLE_CODES: Record<string, ErrorCategory> = {
  ETIMEDOUT: 'timeout',
  ESOCKETTIMEDOUT: 'timeout',
  ECONNRESET: 'server_error',
  ECONNREFUSED: 'server_error',
  ECONNABORTED: 'server_error',
  EPIPE: 'server_error',
  ENOTFOUND: 'server_error',
  EAI_AGAIN: 'server_error',
  EHOSTUNREACH: 'server_error',
  ENETUNREACH: 'server_error',
};

/**
 * Error `name` / constructor names, matched case-insensitively as substrings,
 * mapped to a category. Covers `AbortError`, the Fetch `TimeoutError`, and the
 * OpenAI / Anthropic SDK connection error classes.
 */
const NAME_PATTERNS: ReadonlyArray<[pattern: string, category: ErrorCategory]> =
  [
    ['timeout', 'timeout'],
    ['aborterror', 'timeout'],
    ['connectionerror', 'server_error'],
    ['connection error', 'server_error'],
    ['fetcherror', 'server_error'],
  ];

export interface NetworkClassification {
  category: ErrorCategory;
  code?: string;
}

/**
 * Try to classify a transport-level error. Returns `undefined` when the value
 * does not look like a network failure, so the caller can fall back to its
 * normal (HTTP-based) classification.
 */
export function classifyNetworkError(
  error: unknown,
): NetworkClassification | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  const code = firstString(error.code);
  if (code && code in RETRYABLE_CODES) {
    return { category: RETRYABLE_CODES[code], code };
  }

  // Check both the instance `name` and the constructor name: a subclass of
  // `Error` that doesn't override `name` still reports `"Error"`, so the
  // distinguishing signal lives on `constructor.name`.
  const names = [
    firstString(error.name),
    firstString((error.constructor as { name?: unknown } | undefined)?.name),
  ];
  for (const name of names) {
    if (!name) {
      continue;
    }
    const haystack = name.toLowerCase();
    for (const [pattern, category] of NAME_PATTERNS) {
      if (haystack.includes(pattern)) {
        return { category, code: name };
      }
    }
  }

  return undefined;
}
