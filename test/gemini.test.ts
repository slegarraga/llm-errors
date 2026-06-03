import { describe, expect, it } from 'vitest';
import { normalizeError } from '../src/index.ts';

// Gemini returns the Google API envelope:
// `{ error: { code, message, status, details } }`.
describe('gemini errors', () => {
  it('classifies RESOURCE_EXHAUSTED and reads RetryInfo (string duration)', () => {
    const e = normalizeError({
      error: {
        code: 429,
        message: 'Resource has been exhausted (e.g. check quota).',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '17s',
          },
        ],
      },
    });
    expect(e.provider).toBe('gemini');
    expect(e.category).toBe('rate_limit');
    expect(e.status).toBe(429);
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(17000);
    expect(e.code).toBe('RESOURCE_EXHAUSTED');
  });

  it('classifies PERMISSION_DENIED as not retryable', () => {
    const e = normalizeError({
      error: {
        code: 403,
        message: 'The caller does not have permission',
        status: 'PERMISSION_DENIED',
      },
    });
    expect(e.provider).toBe('gemini');
    expect(e.category).toBe('permission');
    expect(e.retryable).toBe(false);
  });

  it('classifies INVALID_ARGUMENT as invalid_request', () => {
    const e = normalizeError({
      error: {
        code: 400,
        message: 'Invalid value',
        status: 'INVALID_ARGUMENT',
      },
    });
    expect(e.category).toBe('invalid_request');
    expect(e.retryable).toBe(false);
  });

  it('maps UNAVAILABLE to overloaded and retryable', () => {
    const e = normalizeError({
      error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' },
    });
    expect(e.category).toBe('overloaded');
    expect(e.retryable).toBe(true);
  });

  it('reads RetryInfo expressed as a { seconds, nanos } object', () => {
    const e = normalizeError({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'slow down',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: { seconds: 5, nanos: 500000000 },
          },
        ],
      },
    });
    expect(e.retryAfterMs).toBe(5500);
  });
});
