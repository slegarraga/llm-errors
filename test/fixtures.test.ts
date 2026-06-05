import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeError, type NormalizeOptions } from '../src/index.ts';

interface FixtureCase {
  name: string;
  shape: string;
  error: unknown;
  options?: NormalizeOptions;
}

const casesRoot = fileURLToPath(new URL('../fixtures/cases/', import.meta.url));
const expectedRoot = fileURLToPath(
  new URL('../fixtures/expected/', import.meta.url),
);

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return jsonFiles(path);
      }
      return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function withoutUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

describe('provider fixture corpus', () => {
  for (const casePath of jsonFiles(casesRoot)) {
    const fixture = readJson<FixtureCase>(casePath);
    const fixtureName = relative(casesRoot, casePath);
    const expectedPath = join(expectedRoot, fixtureName);

    it(`${fixtureName} normalizes ${fixture.shape}`, () => {
      const normalized = normalizeError(fixture.error, fixture.options);
      const actual = withoutUndefined({
        provider: normalized.provider,
        category: normalized.category,
        message: normalized.message,
        status: normalized.status,
        code: normalized.code,
        retryable: normalized.retryable,
        retryAfterMs: normalized.retryAfterMs,
      });

      expect(actual).toEqual(readJson(expectedPath));
      expect(normalized.raw).toBe(fixture.error);
      expect(basename(casePath)).toBe(basename(expectedPath));
    });
  }
});
