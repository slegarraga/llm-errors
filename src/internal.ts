/**
 * Internal probing helpers. These intentionally accept `unknown` and never
 * throw: error objects arrive in many shapes (SDK error classes, raw `fetch`
 * responses, plain JSON) and the library must degrade gracefully on any of
 * them.
 */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Return the first argument that is a non-empty string. */
export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Return the first argument that is a finite number. */
export function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Read a header by name from the many container shapes an error may carry:
 * a `Headers` instance, a plain object, a `Map`, or an array of `[k, v]`
 * pairs. Lookup is case-insensitive.
 */
export function getHeader(headers: unknown, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const lower = name.toLowerCase();

  // `Headers` (fetch) or `Map`-like: has a `.get` method.
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get(key: string): unknown }).get(name);
    return typeof value === 'string' ? value : undefined;
  }

  // Array of [key, value] pairs.
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        entry[0].toLowerCase() === lower
      ) {
        return typeof entry[1] === 'string' ? entry[1] : undefined;
      }
    }
    return undefined;
  }

  // Plain object: case-insensitive key scan.
  if (isObject(headers)) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) {
        const value = headers[key];
        return typeof value === 'string' ? value : undefined;
      }
    }
  }

  return undefined;
}

/** Extract an HTTP status code from common error shapes. */
export function readStatus(error: unknown): number | undefined {
  if (!isObject(error)) {
    return undefined;
  }
  const response = isObject(error.response) ? error.response : undefined;
  const inner = isObject(error.error) ? error.error : undefined;
  return firstNumber(
    error.status,
    error.statusCode,
    response?.status,
    // Google encodes the status as `error.code` (a numeric HTTP status).
    inner?.code,
  );
}

/** Extract the header container from common error shapes. */
export function readHeaders(error: unknown): unknown {
  if (!isObject(error)) {
    return undefined;
  }
  const response = isObject(error.response) ? error.response : undefined;
  return error.headers ?? response?.headers;
}

/**
 * Extract the provider error body — the object that holds `type` / `code` /
 * `message`. SDK error classes expose it at `error.error`; raw responses may
 * nest it under `error.body.error` or `error.response.data.error`.
 */
export function readErrorBody(
  error: unknown,
): Record<string, unknown> | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  // Anthropic wraps as `{ type: 'error', error: {...} }`; OpenAI/Gemini SDK
  // error objects expose the inner payload directly at `.error`.
  const candidates: unknown[] = [
    isObject(error.error) && isObject(error.error.error)
      ? error.error.error
      : error.error,
    isObject(error.body)
      ? (error.body as Record<string, unknown>).error
      : undefined,
    isObject(error.response) && isObject(error.response.data)
      ? (error.response.data as Record<string, unknown>).error
      : undefined,
  ];

  for (const candidate of candidates) {
    if (isObject(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/** Best-effort human-readable message from an error of any shape. */
export function readMessage(
  error: unknown,
  body: Record<string, unknown> | undefined,
): string {
  const fromBody = body ? firstString(body.message) : undefined;
  if (fromBody) {
    return fromBody;
  }
  if (isObject(error)) {
    const direct = firstString(error.message);
    if (direct) {
      return direct;
    }
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'Unknown error';
}
