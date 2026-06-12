import { describe, expect, it } from 'vitest';
import { normalizeError } from '../src/index.ts';

// Transport-level errors never reach an HTTP response: no status, no body.
describe('network / transport errors', () => {
  it('treats a connection timeout (ETIMEDOUT) as a retryable timeout', () => {
    const e = normalizeError(
      Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    );
    expect(e.category).toBe('timeout');
    expect(e.retryable).toBe(true);
    expect(e.code).toBe('ETIMEDOUT');
  });

  it('treats a dropped connection (ECONNRESET) as a retryable server error', () => {
    const e = normalizeError(
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    );
    expect(e.category).toBe('server_error');
    expect(e.retryable).toBe(true);
  });

  it('treats a DNS failure (EAI_AGAIN) as retryable', () => {
    const e = normalizeError(
      Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' }),
    );
    expect(e.retryable).toBe(true);
  });

  it('recognizes an AbortError by name as a timeout', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    const e = normalizeError(err);
    expect(e.category).toBe('timeout');
    expect(e.retryable).toBe(true);
  });

  it('does not treat a deliberate user abort as retryable', () => {
    // The OpenAI SDK throws APIUserAbortError when the caller cancels the
    // request; resurrecting it with a retry would defeat the cancellation.
    class APIUserAbortError extends Error {}
    const e = normalizeError(new APIUserAbortError('Request was aborted.'));
    expect(e.category).toBe('unknown');
    expect(e.retryable).toBe(false);
  });

  it('recognizes the SDK APIConnectionTimeoutError class name', () => {
    class APIConnectionTimeoutError extends Error {}
    const e = normalizeError(new APIConnectionTimeoutError('timed out'));
    expect(e.category).toBe('timeout');
    expect(e.retryable).toBe(true);
  });

  it('does not let a network guess override a real HTTP status', () => {
    // A 400 with an ECONNRESET code should stay an invalid_request, because a
    // genuine HTTP response did arrive.
    const e = normalizeError({
      status: 400,
      code: 'ECONNRESET',
      error: { type: 'invalid_request_error' },
    });
    expect(e.category).toBe('invalid_request');
    expect(e.retryable).toBe(false);
  });
});
