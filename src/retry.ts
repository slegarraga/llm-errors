import { isObject } from './internal.ts';
import type { NormalizedError, RetryDelayOptions } from './types.ts';

function nonNegativeFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Parse a `Retry-After` header value into milliseconds.
 *
 * Per RFC 7231 the value is either a number of seconds (`"30"`) or an
 * HTTP date (`"Wed, 21 Oct 2026 07:28:00 GMT"`). Some providers also send a
 * fractional `retry-after-ms` value, which is accepted when `unit` is `'ms'`.
 */
export function parseRetryAfter(
  value: string | undefined,
  unit: 's' | 'ms' = 's',
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    const ms = unit === 'ms' ? numeric : numeric * 1000;
    return ms >= 0 ? ms : undefined;
  }

  if (unit === 'ms') {
    return undefined;
  }

  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

/**
 * Parse a Google `RetryInfo.retryDelay` value into milliseconds.
 *
 * Google encodes it either as a duration string (`"30s"`, `"1.5s"`) or as a
 * `{ seconds, nanos }` object inside `error.details[]`.
 */
export function parseGoogleRetryDelay(details: unknown): number | undefined {
  if (!Array.isArray(details)) {
    return undefined;
  }
  for (const detail of details) {
    if (!isObject(detail)) {
      continue;
    }
    const type = detail['@type'];
    if (typeof type === 'string' && !type.includes('RetryInfo')) {
      continue;
    }
    const delay = detail.retryDelay;
    if (typeof delay === 'string') {
      const seconds = Number(delay.replace(/s$/, ''));
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
    }
    if (isObject(delay)) {
      const seconds =
        typeof delay.seconds === 'number'
          ? delay.seconds
          : Number(delay.seconds);
      const nanos =
        delay.nanos === undefined
          ? 0
          : typeof delay.nanos === 'number'
            ? delay.nanos
            : Number(delay.nanos);
      if (
        Number.isFinite(seconds) &&
        seconds >= 0 &&
        Number.isFinite(nanos) &&
        nanos >= 0 &&
        nanos < 1e9
      ) {
        return seconds * 1000 + Math.round(nanos / 1e6);
      }
    }
  }
  return undefined;
}

/**
 * Suggested delay before retrying, in milliseconds.
 *
 * Non-retryable errors return `0`. When the provider supplied an explicit
 * valid delay (`error.retryAfterMs`) it is respected. Otherwise this falls
 * back to exponential backoff:
 * `baseMs * 2 ** attempt`, capped at `maxMs`, with optional full jitter.
 *
 * @param error   A {@link NormalizedError}.
 * @param attempt Zero-based retry attempt number (0 for the first retry).
 * @param options Backoff tuning. See {@link RetryDelayOptions}.
 */
export function getRetryDelayMs(
  error: NormalizedError,
  attempt: number,
  options: RetryDelayOptions = {},
): number {
  if (!error.retryable) {
    return 0;
  }

  const explicitDelay = nonNegativeFinite(error.retryAfterMs);
  if (explicitDelay !== undefined) {
    return explicitDelay;
  }

  const baseMs = nonNegativeFinite(options.baseMs) ?? 500;
  const maxMs = nonNegativeFinite(options.maxMs) ?? 60000;
  const jitter = options.jitter ?? 'full';

  const safeAttempt =
    Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const exponential = Math.min(maxMs, baseMs * 2 ** safeAttempt);

  if (jitter === 'none') {
    return exponential;
  }
  return Math.random() * exponential;
}
