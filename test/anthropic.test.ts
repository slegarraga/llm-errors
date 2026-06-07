import { describe, expect, it } from 'vitest';
import { normalizeError } from '../src/index.ts';

// Anthropic's SDK exposes the full body at `.error`, i.e.
// `{ type: 'error', error: { type, message } }`.
describe('anthropic errors', () => {
  it('classifies authentication_error', () => {
    const e = normalizeError({
      status: 401,
      error: {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      },
    });
    expect(e.provider).toBe('anthropic');
    expect(e.category).toBe('authentication');
    expect(e.retryable).toBe(false);
    expect(e.code).toBe('authentication_error');
  });

  it('classifies rate_limit_error and reads Retry-After seconds', () => {
    const e = normalizeError({
      status: 429,
      headers: { 'retry-after': '30' },
      error: {
        type: 'error',
        error: { type: 'rate_limit_error', message: 'rate limit exceeded' },
      },
    });
    expect(e.provider).toBe('anthropic');
    expect(e.category).toBe('rate_limit');
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(30000);
  });

  it('maps overloaded_error (HTTP 529) to overloaded and retryable', () => {
    const e = normalizeError({
      status: 529,
      error: {
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      },
    });
    expect(e.category).toBe('overloaded');
    expect(e.retryable).toBe(true);
  });

  it('maps billing_error to insufficient_quota and not retryable', () => {
    const e = normalizeError({
      status: 429,
      error: {
        type: 'error',
        error: {
          type: 'billing_error',
          message: 'Your credit balance is too low.',
        },
      },
    });
    expect(e.provider).toBe('anthropic');
    expect(e.category).toBe('insufficient_quota');
    expect(e.retryable).toBe(false);
  });

  it('lets credit balance wording override retryable rate-limit type', () => {
    const e = normalizeError({
      status: 429,
      headers: { 'retry-after': '30' },
      error: {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Your credit balance is too low.',
        },
      },
    });
    expect(e.provider).toBe('anthropic');
    expect(e.category).toBe('insufficient_quota');
    expect(e.retryable).toBe(false);
    expect(e.retryAfterMs).toBeUndefined();
  });

  it('detects an over-long prompt as context_length_exceeded', () => {
    const e = normalizeError({
      status: 400,
      error: {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'prompt is too long: 250000 tokens > 200000 maximum',
        },
      },
    });
    expect(e.category).toBe('context_length_exceeded');
    expect(e.retryable).toBe(false);
  });

  it('detects the provider from anthropic-specific headers', () => {
    const e = normalizeError({
      status: 400,
      headers: { 'anthropic-ratelimit-requests-limit': '50' },
      error: {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'bad' },
      },
    });
    expect(e.provider).toBe('anthropic');
    expect(e.category).toBe('invalid_request');
  });
});
