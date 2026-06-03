// A provider-agnostic retry loop built on llm-errors.
//
//   node examples/retry-loop.mjs
//
// The fake `call` throws a few realistic provider errors before succeeding,
// showing how the same loop handles OpenAI, Anthropic and Gemini failures.
import { normalizeError, getRetryDelayMs } from '../dist/index.js';

const failures = [
  // OpenAI 429 with a Retry-After header.
  {
    status: 429,
    headers: { 'retry-after': '1' },
    error: {
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      param: null,
    },
  },
  // Anthropic 529 overloaded.
  {
    status: 529,
    error: {
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    },
  },
  // Gemini RESOURCE_EXHAUSTED with RetryInfo.
  {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Resource has been exhausted.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '1s',
        },
      ],
    },
  },
];

let attempt = 0;
async function call() {
  if (attempt < failures.length) {
    throw failures[attempt];
  }
  return 'success';
}

for (; attempt <= failures.length; attempt++) {
  try {
    const result = await call();
    console.log(`Succeeded on attempt ${attempt}: ${result}`);
    break;
  } catch (err) {
    const e = normalizeError(err);
    const delay = getRetryDelayMs(e, attempt);
    console.log(
      `attempt ${attempt}: ${e.provider}/${e.category} ` +
        `(retryable=${e.retryable}) -> waiting ${Math.round(delay)}ms`,
    );
    if (!e.retryable) {
      console.log('Not retryable, giving up.');
      break;
    }
    await new Promise((r) => setTimeout(r, Math.min(delay, 50)));
  }
}
