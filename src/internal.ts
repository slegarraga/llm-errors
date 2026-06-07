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

function httpStatus(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-5]\d{2}$/.test(value.trim())
        ? Number(value)
        : undefined;

  if (
    typeof numeric === 'number' &&
    Number.isInteger(numeric) &&
    numeric >= 100 &&
    numeric <= 599
  ) {
    return numeric;
  }
  return undefined;
}

function firstHttpStatus(...values: unknown[]): number | undefined {
  for (const value of values) {
    const status = httpStatus(value);
    if (status !== undefined) {
      return status;
    }
  }
  return undefined;
}

function headerValueToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const stringValue = headerValueToString(entry);
      if (stringValue !== undefined) {
        return stringValue;
      }
    }
  }
  return undefined;
}

function headerPairValue(entry: unknown, lower: string): string | undefined {
  if (
    Array.isArray(entry) &&
    typeof entry[0] === 'string' &&
    entry[0].toLowerCase() === lower
  ) {
    return headerValueToString(entry[1]);
  }
  return undefined;
}

/**
 * Read a header by name from the many container shapes an error may carry:
 * a `Headers` instance, a plain object, a `Map`, or an array of `[k, v]`
 * pairs. Lookup is case-insensitive and accepts common Node-style values such
 * as numbers or string arrays.
 */
export function getHeader(headers: unknown, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const lower = name.toLowerCase();

  // `Headers` (fetch) or `Map`-like: has a `.get` method.
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get(key: string): unknown }).get(name);
    const stringValue = headerValueToString(value);
    if (stringValue !== undefined) {
      return stringValue;
    }
  }

  // Iterable containers (`Map`, `Headers`, arrays of [key, value] pairs).
  if (
    typeof (headers as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
    'function'
  ) {
    for (const entry of headers as Iterable<unknown>) {
      const value = headerPairValue(entry, lower);
      if (value !== undefined) {
        return value;
      }
    }
  }

  // Plain object: case-insensitive key scan.
  if (isObject(headers)) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) {
        const value = headers[key];
        return headerValueToString(value);
      }
    }
  }

  return undefined;
}

function looksLikeProviderErrorBody(value: Record<string, unknown>): boolean {
  return (
    typeof value.type === 'string' ||
    typeof value.code === 'string' ||
    (typeof value.code === 'number' && typeof value.status === 'string') ||
    typeof value.status === 'string' ||
    Array.isArray(value.details) ||
    'param' in value
  );
}

/** Extract an HTTP status code from common error shapes. */
export function readStatus(error: unknown): number | undefined {
  if (!isObject(error)) {
    return undefined;
  }
  const response = isObject(error.response) ? error.response : undefined;
  const inner = isObject(error.error) ? error.error : undefined;
  return firstHttpStatus(
    error.status,
    error.statusCode,
    looksLikeProviderErrorBody(error) ? error.code : undefined,
    response?.status,
    response?.statusCode,
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
  const body = isObject(error.body) ? error.body : undefined;
  const responseData =
    isObject(error.response) && isObject(error.response.data)
      ? error.response.data
      : undefined;

  // Anthropic wraps as `{ type: 'error', error: {...} }`; OpenAI/Gemini SDK
  // error objects expose the inner payload directly at `.error`.
  const candidates: unknown[] = [
    isObject(error.error) && isObject(error.error.error)
      ? error.error.error
      : error.error,
    body?.error,
    responseData?.error,
    body && looksLikeProviderErrorBody(body) ? body : undefined,
    responseData && looksLikeProviderErrorBody(responseData)
      ? responseData
      : undefined,
    looksLikeProviderErrorBody(error) ? error : undefined,
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
