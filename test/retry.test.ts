import { describe, expect, it } from 'vitest';
import {
  getRetryDelayMs,
  parseGoogleRetryDelay,
  parseRetryAfter,
  type NormalizedError,
} from '../src/index.ts';

describe('parseRetryAfter', () => {
  it('parses a seconds value into milliseconds', () => {
    expect(parseRetryAfter('30')).toBe(30000);
  });

  it('parses a millisecond value when unit is ms', () => {
    expect(parseRetryAfter('1500', 'ms')).toBe(1500);
  });

  it('parses an HTTP date into a non-negative delay', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeTypeOf('number');
    expect(ms!).toBeGreaterThanOrEqual(0);
  });

  it('returns undefined for empty, missing or garbage values', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('not-a-date')).toBeUndefined();
  });

  it('ignores negative seconds', () => {
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});

describe('parseGoogleRetryDelay', () => {
  it('parses a duration string', () => {
    expect(
      parseGoogleRetryDelay([
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '8s',
        },
      ]),
    ).toBe(8000);
  });

  it('returns undefined when details is not an array', () => {
    expect(parseGoogleRetryDelay(undefined)).toBeUndefined();
    expect(parseGoogleRetryDelay({})).toBeUndefined();
  });

  it('returns undefined when no RetryInfo is present', () => {
    expect(
      parseGoogleRetryDelay([
        { '@type': 'type.googleapis.com/google.rpc.Help' },
      ]),
    ).toBeUndefined();
  });
});

describe('getRetryDelayMs', () => {
  const base = (over: Partial<NormalizedError>): NormalizedError => ({
    provider: 'openai',
    category: 'rate_limit',
    message: 'x',
    retryable: true,
    raw: null,
    ...over,
  });

  it('respects a provider-supplied retryAfterMs', () => {
    expect(getRetryDelayMs(base({ retryAfterMs: 4200 }), 3)).toBe(4200);
  });

  it('falls back to deterministic exponential backoff without jitter', () => {
    const e = base({});
    expect(getRetryDelayMs(e, 0, { baseMs: 500, jitter: 'none' })).toBe(500);
    expect(getRetryDelayMs(e, 1, { baseMs: 500, jitter: 'none' })).toBe(1000);
    expect(getRetryDelayMs(e, 2, { baseMs: 500, jitter: 'none' })).toBe(2000);
  });

  it('caps the exponential delay at maxMs', () => {
    const e = base({});
    expect(
      getRetryDelayMs(e, 20, { baseMs: 500, maxMs: 8000, jitter: 'none' }),
    ).toBe(8000);
  });

  it('keeps full jitter within [0, exponential]', () => {
    const e = base({});
    for (let i = 0; i < 50; i++) {
      const ms = getRetryDelayMs(e, 3, { baseMs: 500, jitter: 'full' });
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(4000);
    }
  });
});
