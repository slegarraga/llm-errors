/**
 * The LLM provider an error originated from.
 *
 * `'unknown'` is used when the provider cannot be determined from the error
 * shape and no explicit hint was given.
 */
export type Provider = 'openai' | 'anthropic' | 'gemini' | 'unknown';

/**
 * A provider-agnostic classification of an API error.
 *
 * Categories are chosen so that two different providers reporting the same
 * underlying problem map to the same value, letting callers write a single
 * `switch` instead of one branch per provider.
 */
export type ErrorCategory =
  /** Missing or invalid API key / credentials (usually HTTP 401). */
  | 'authentication'
  /** Authenticated but not allowed to use this resource (usually HTTP 403). */
  | 'permission'
  /** Too many requests in a window; safe to retry after a delay (HTTP 429). */
  | 'rate_limit'
  /** Billing quota or credits exhausted; retrying soon will not help (HTTP 429). */
  | 'insufficient_quota'
  /** The prompt plus completion exceeds the model context window (HTTP 400). */
  | 'context_length_exceeded'
  /** The request payload itself is too large (e.g. HTTP 413). */
  | 'request_too_large'
  /** Malformed or invalid request that will fail again unchanged (HTTP 400/422). */
  | 'invalid_request'
  /** The requested model or resource does not exist (HTTP 404). */
  | 'not_found'
  /** Blocked by a provider content / safety policy. */
  | 'content_filter'
  /** The request or upstream model timed out (e.g. HTTP 504). */
  | 'timeout'
  /** Generic upstream failure; usually transient and retryable (HTTP 500). */
  | 'server_error'
  /** The provider is temporarily overloaded; retryable (HTTP 503/529). */
  | 'overloaded'
  /** Could not be classified into any of the above. */
  | 'unknown';

/**
 * A single error normalized into one consistent shape across providers.
 */
export interface NormalizedError {
  /** Which provider the error came from, or `'unknown'`. */
  provider: Provider;
  /** Provider-agnostic category, suitable for branching logic. */
  category: ErrorCategory;
  /** A human-readable message extracted from the provider payload. */
  message: string;
  /** The HTTP status code, when one is available. */
  status?: number;
  /** The provider-specific error code or type string, when available. */
  code?: string;
  /**
   * Whether retrying the same request later may succeed. `true` for transient
   * conditions (rate limits, server errors, overload, timeouts); `false` for
   * deterministic failures (bad request, auth, context length, content filter).
   */
  retryable: boolean;
  /**
   * Suggested delay in milliseconds before retrying, derived from the provider
   * (`Retry-After` header, Google `RetryInfo`, etc.). `undefined` when the
   * provider did not specify one — use {@link getRetryDelayMs} for a fallback.
   */
  retryAfterMs?: number;
  /** The original value passed to {@link normalizeError}, untouched. */
  raw: unknown;
}

/**
 * Options for {@link normalizeError}.
 */
export interface NormalizeOptions {
  /**
   * Force the provider instead of auto-detecting it. Useful when you already
   * know which client threw, or when the error shape is ambiguous.
   */
  provider?: Provider;
}

/**
 * Options for {@link getRetryDelayMs} exponential-backoff fallback.
 */
export interface RetryDelayOptions {
  /** Base delay in milliseconds for the first attempt. Default `500`. */
  baseMs?: number;
  /** Upper bound for the computed delay in milliseconds. Default `60000`. */
  maxMs?: number;
  /**
   * Jitter strategy applied to the exponential delay. `'full'` picks a random
   * value in `[0, delay]`, `'none'` disables jitter. Default `'full'`.
   * Ignored when the provider supplied an explicit `retryAfterMs`.
   */
  jitter?: 'full' | 'none';
}
