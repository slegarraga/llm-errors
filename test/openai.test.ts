import { describe, expect, it } from 'vitest';
import { normalizeError } from '../src/index.ts';

// Shapes mirror the `openai` SDK's `APIError`: status + headers + the parsed
// response `error` object.
describe('openai errors', () => {
  it('classifies an invalid API key as authentication', () => {
    const e = normalizeError({
      status: 401,
      headers: { 'openai-version': '2020-10-01' },
      error: {
        message: 'Incorrect API key provided',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
        param: null,
      },
    });
    expect(e.provider).toBe('openai');
    expect(e.category).toBe('authentication');
    expect(e.retryable).toBe(false);
    expect(e.message).toMatch(/Incorrect API key/);
  });

  it('classifies a 429 as a retryable rate limit and reads Retry-After', () => {
    const e = normalizeError({
      status: 429,
      headers: { 'retry-after': '2' },
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        param: null,
      },
    });
    expect(e.provider).toBe('openai');
    expect(e.category).toBe('rate_limit');
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(2000);
  });

  it('separates insufficient_quota from rate limits (not retryable)', () => {
    const e = normalizeError({
      status: 429,
      error: {
        message: 'You exceeded your current quota',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        param: null,
      },
    });
    expect(e.category).toBe('insufficient_quota');
    expect(e.retryable).toBe(false);
  });

  it('detects context_length_exceeded from the error code', () => {
    const e = normalizeError({
      status: 400,
      error: {
        message: "This model's maximum context length is 8192 tokens",
        type: 'invalid_request_error',
        code: 'context_length_exceeded',
        param: 'messages',
      },
    });
    expect(e.category).toBe('context_length_exceeded');
    expect(e.retryable).toBe(false);
  });

  it('treats 500 server errors as retryable', () => {
    const e = normalizeError({
      status: 500,
      error: {
        message: 'The server had an error',
        type: 'server_error',
        code: null,
        param: null,
      },
    });
    expect(e.category).toBe('server_error');
    expect(e.retryable).toBe(true);
  });

  it('prefers the millisecond Retry-After header when present', () => {
    const e = normalizeError({
      status: 429,
      headers: { 'retry-after-ms': '1500', 'retry-after': '2' },
      error: { type: 'rate_limit_error', param: null },
    });
    expect(e.retryAfterMs).toBe(1500);
  });
});
