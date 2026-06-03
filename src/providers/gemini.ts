import {
  baseCategoryFromStatus,
  firstHeader,
  type Classification,
  type ProviderContext,
} from '../classify.ts';
import { firstString } from '../internal.ts';
import { parseGoogleRetryDelay, parseRetryAfter } from '../retry.ts';
import type { ErrorCategory } from '../types.ts';

/** Canonical google.rpc.Code names → provider-agnostic categories. */
const RPC_STATUS: Record<string, ErrorCategory> = {
  UNAUTHENTICATED: 'authentication',
  PERMISSION_DENIED: 'permission',
  NOT_FOUND: 'not_found',
  INVALID_ARGUMENT: 'invalid_request',
  FAILED_PRECONDITION: 'invalid_request',
  OUT_OF_RANGE: 'invalid_request',
  UNIMPLEMENTED: 'invalid_request',
  RESOURCE_EXHAUSTED: 'rate_limit',
  INTERNAL: 'server_error',
  UNKNOWN: 'server_error',
  ABORTED: 'server_error',
  DATA_LOSS: 'server_error',
  UNAVAILABLE: 'overloaded',
  DEADLINE_EXCEEDED: 'timeout',
  CANCELLED: 'timeout',
};

function rpcStatus(ctx: ProviderContext): string | undefined {
  const status = firstString(ctx.body?.status);
  if (status && /^[A-Z][A-Z_]+$/.test(status)) {
    return status;
  }
  return undefined;
}

/** Heuristic: does this error look like it came from the Gemini API? */
export function matches(ctx: ProviderContext): boolean {
  if (rpcStatus(ctx) !== undefined) {
    return true;
  }
  // A numeric `code` alongside a `details` array is the Google error envelope.
  return typeof ctx.body?.code === 'number' && Array.isArray(ctx.body?.details);
}

export function classify(ctx: ProviderContext): Classification {
  const status = rpcStatus(ctx);

  const mapped = status ? RPC_STATUS[status] : undefined;
  const category: ErrorCategory = mapped ?? baseCategoryFromStatus(ctx.status);

  const retryAfterMs =
    parseGoogleRetryDelay(ctx.body?.details) ??
    parseRetryAfter(firstHeader(ctx.headers, 'retry-after'));

  return { category, code: status, retryAfterMs };
}
