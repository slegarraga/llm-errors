import { describe, expect, it } from 'vitest';
import { isRetryableError, normalizeError } from '../src/index.ts';

describe('normalizeError edge cases', () => {
  it('never throws on null / undefined / primitives', () => {
    for (const input of [null, undefined, 42, true]) {
      const e = normalizeError(input);
      expect(e.provider).toBe('unknown');
      expect(e.category).toBe('unknown');
      expect(e.retryable).toBe(false);
      expect(e.raw).toBe(input);
    }
  });

  it('uses a thrown Error message', () => {
    const e = normalizeError(new Error('boom'));
    expect(e.message).toBe('boom');
    expect(e.category).toBe('unknown');
  });

  it('uses a plain string as the message', () => {
    expect(normalizeError('went wrong').message).toBe('went wrong');
  });

  it('classifies by status alone when the provider is unknown', () => {
    const e = normalizeError({ status: 503 });
    expect(e.provider).toBe('unknown');
    expect(e.category).toBe('overloaded');
    expect(e.retryable).toBe(true);
  });

  it('honors an explicit provider hint over auto-detection', () => {
    const geminiShaped = {
      error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'x' },
    };
    const e = normalizeError(geminiShaped, { provider: 'openai' });
    expect(e.provider).toBe('openai');
  });

  it('exposes the original value untouched on raw', () => {
    const input = { status: 400, error: { type: 'invalid_request_error' } };
    expect(normalizeError(input).raw).toBe(input);
  });
});

describe('header container shapes', () => {
  it('reads a fetch Headers instance', () => {
    const e = normalizeError({
      status: 429,
      headers: new Headers({ 'retry-after': '5' }),
      error: { type: 'rate_limit_error', param: null },
    });
    expect(e.retryAfterMs).toBe(5000);
  });

  it('reads an array of [key, value] header pairs', () => {
    const e = normalizeError({
      status: 429,
      headers: [['Retry-After', '7']],
      error: { type: 'rate_limit_error', param: null },
    });
    expect(e.retryAfterMs).toBe(7000);
  });

  it('reads a Map of headers', () => {
    const e = normalizeError({
      status: 429,
      headers: new Map([['Retry-After', '9']]),
      error: { type: 'rate_limit_error', param: null },
    });
    expect(e.retryAfterMs).toBe(9000);
  });

  it('reads numeric and string-array header values from plain objects', () => {
    const e = normalizeError({
      status: 429,
      headers: { 'retry-after': [12], 'retry-after-ms': 2500 },
      error: { type: 'rate_limit_error', param: null },
    });
    expect(e.retryAfterMs).toBe(2500);
  });
});

describe('plain provider bodies', () => {
  it('detects a direct OpenAI error body', () => {
    const e = normalizeError({
      message: 'Rate limit reached for requests',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      param: null,
    });
    expect(e.provider).toBe('openai');
    expect(e.category).toBe('rate_limit');
    expect(e.retryable).toBe(true);
  });

  it('detects a direct Gemini RPC error body and numeric code status', () => {
    const e = normalizeError({
      code: 503,
      message: 'The model is overloaded. Please try again later.',
      status: 'UNAVAILABLE',
    });
    expect(e.provider).toBe('gemini');
    expect(e.status).toBe(503);
    expect(e.category).toBe('overloaded');
    expect(e.retryable).toBe(true);
  });

  it('does not expose non-HTTP Gemini numeric codes as HTTP status', () => {
    const e = normalizeError({
      code: 8,
      message: 'Resource exhausted',
      status: 'RESOURCE_EXHAUSTED',
    });
    expect(e.provider).toBe('gemini');
    expect(e.status).toBeUndefined();
    expect(e.category).toBe('rate_limit');
    expect(e.retryable).toBe(true);
  });
});

describe('generic HTTP errors', () => {
  it('preserves Retry-After for unknown retryable status errors', () => {
    const e = normalizeError({
      statusCode: 503,
      headers: { 'retry-after': '4' },
      body: { error: { message: 'Service temporarily unavailable' } },
    });
    expect(e.provider).toBe('unknown');
    expect(e.category).toBe('overloaded');
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(4000);
  });

  it('drops Retry-After on non-retryable unknown status errors', () => {
    const e = normalizeError({
      statusCode: 400,
      headers: { 'retry-after': '60' },
      body: { error: { message: 'Bad request' } },
    });
    expect(e.provider).toBe('unknown');
    expect(e.category).toBe('invalid_request');
    expect(e.retryable).toBe(false);
    expect(e.retryAfterMs).toBeUndefined();
  });
});

describe('isRetryableError', () => {
  it('returns true for transient errors', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
  });

  it('returns false for deterministic errors', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
  });
});
