import { getHeader } from './internal.ts';
import type { ErrorCategory } from './types.ts';

/**
 * The pre-parsed pieces of an error that every provider classifier and the
 * detector operate on. Kept internal to the package.
 */
export interface ProviderContext {
  status?: number;
  /** The provider error body (`{ type, code, message, ... }`), if found. */
  body: Record<string, unknown> | undefined;
  /** The raw header container (`Headers`, object, pairs), if found. */
  headers: unknown;
}

/** The result a provider classifier contributes to the normalized error. */
export interface Classification {
  category: ErrorCategory;
  code?: string;
  retryAfterMs?: number;
}

/**
 * Map an HTTP status code to a category, ignoring provider specifics. Provider
 * classifiers start here and then refine using their `code` / `type` strings.
 */
export function baseCategoryFromStatus(status?: number): ErrorCategory {
  switch (status) {
    case 401:
      return 'authentication';
    case 403:
      return 'permission';
    case 404:
      return 'not_found';
    case 408:
      return 'timeout';
    case 413:
      return 'request_too_large';
    case 400:
    case 422:
      return 'invalid_request';
    case 429:
      return 'rate_limit';
    case 500:
      return 'server_error';
    case 502:
      return 'server_error';
    case 503:
      return 'overloaded';
    case 504:
      return 'timeout';
    case 529:
      return 'overloaded';
    default:
      break;
  }
  if (typeof status === 'number') {
    if (status >= 500) {
      return 'server_error';
    }
    if (status >= 400) {
      return 'invalid_request';
    }
  }
  return 'unknown';
}

/** Categories that are safe to retry after a delay. */
const RETRYABLE: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'rate_limit',
  'server_error',
  'overloaded',
  'timeout',
]);

/** Whether a category represents a transient, retryable condition. */
export function isRetryableCategory(category: ErrorCategory): boolean {
  return RETRYABLE.has(category);
}

/** Read the first present header from a list of candidate names. */
export function firstHeader(
  headers: unknown,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = getHeader(headers, name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
